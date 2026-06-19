// Fila BullMQ "messages-in" e o worker que a consome.
// O webhook apenas ENFILEIRA o payload bruto e responde 200; este worker
// processa depois, com retry automatico. Assim, um deploy/reinicio no meio
// do recebimento nao perde a mensagem do cliente.
import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import type { Server } from "socket.io";
import { prisma } from "./prisma";
import { getIO } from "./socket";
import { normalizarJid } from "./phone";
import { TipoMsg, DirecaoMsg, Prisma } from "../generated/prisma/client";

// Conexao dedicada para a fila/worker. Separada do singleton de redis.ts
// porque o worker usa comandos bloqueantes (BRPOPLPUSH) que ocupariam a
// conexao usada pelo health check. maxRetriesPerRequest: null e exigido.
// BullMQ embute sua propria copia do ioredis; o cast resolve a divergencia
// puramente estrutural de tipos (em runtime e a mesma biblioteca).
const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
) as unknown as ConnectionOptions;

const NOME_FILA = "messages-in";

// Produtor: o webhook usa esta fila para enfileirar os eventos da Evolution.
export const messagesQueue = new Queue(NOME_FILA, {
  connection,
  defaultJobOptions: {
    // Retry com backoff exponencial caso o processamento falhe.
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    // Limpeza para nao acumular jobs concluidos/falhos indefinidamente.
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

// Estrutura minima esperada do evento da Evolution v2.
type EventoEvolution = {
  event?: string;
  instance?: string;
  data?: {
    key?: {
      id?: string;
      remoteJid?: string;
      fromMe?: boolean;
    };
    pushName?: string;
    message?: Record<string, unknown> | null;
    messageType?: string;
    messageTimestamp?: number | string;
  };
};

// Mapeia o messageType da Evolution para o enum TipoMsg do dominio.
function mapearTipo(msgType?: string): TipoMsg {
  switch (msgType) {
    case "conversation":
    case "extendedTextMessage":
      return TipoMsg.TEXTO;
    case "audioMessage":
      return TipoMsg.AUDIO;
    case "imageMessage":
      return TipoMsg.IMAGEM;
    case "videoMessage":
      return TipoMsg.VIDEO;
    case "documentMessage":
      return TipoMsg.DOCUMENTO;
    default:
      return TipoMsg.OUTRO;
  }
}

// Extrai o texto da mensagem (quando houver). Para midia nao baixamos nada
// nesta fase: o conteudo fica null e so registramos o tipo.
function extrairConteudo(
  message?: Record<string, unknown> | null,
): string | null {
  if (!message) return null;
  const conversation = message["conversation"];
  if (typeof conversation === "string") return conversation;
  const estendida = message["extendedTextMessage"] as
    | { text?: string }
    | undefined;
  if (typeof estendida?.text === "string") return estendida.text;
  return null;
}

// Processa um unico evento. Retorna sem erro para eventos que nao interessam.
async function processarEvento(
  payload: EventoEvolution,
  io: Server | null,
): Promise<void> {
  const event = payload?.event;
  // So processamos recebimento/insercao de mensagens. Demais eventos: ignora.
  if (event !== "MESSAGES_UPSERT") return;

  const data = payload?.data;
  const jid = data?.key?.remoteJid;
  const externalId = data?.key?.id;

  // Defensivo: se faltarem campos essenciais, loga e ignora (nao quebra).
  if (!jid || !externalId) {
    console.warn(
      `[ingest] evento sem jid/externalId ignorado (instance=${payload?.instance ?? "?"})`,
    );
    return;
  }

  // Ignora mensagens de grupo.
  if (jid.endsWith("@g.us")) return;

  const fromMe = data?.key?.fromMe === true;
  const pushName = data?.pushName;
  const telefone = normalizarJid(jid);
  if (!telefone) {
    console.warn(`[ingest] jid sem digitos ignorado: ${jid}`);
    return;
  }

  const tipo = mapearTipo(data?.messageType);
  const conteudo = extrairConteudo(data?.message);
  const direcao: DirecaoMsg = fromMe ? DirecaoMsg.OUT : DirecaoMsg.IN;

  // IDEMPOTENCIA: a Evolution reenvia eventos. Se a mensagem ja existe,
  // nao duplica, nao altera e nao reemite o evento de tempo real.
  const jaExiste = await prisma.mensagem.findUnique({
    where: { externalId },
    select: { id: true },
  });
  if (jaExiste) {
    console.log(`[ingest] ${telefone} duplicada ignorada ${externalId}`);
    return;
  }

  // Lead: upsert por telefone normalizado.
  let lead = await prisma.lead.upsert({
    where: { telefone },
    update: {},
    create: {
      telefone,
      nome: pushName ?? undefined,
      origem: "whatsapp",
    },
  });
  // Se chegou pushName e o Lead ainda nao tinha nome, preenche.
  if (!lead.nome && pushName) {
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: { nome: pushName },
    });
  }

  // Conversa: garante UMA conversa "aberta" para o Lead.
  let conversa = await prisma.conversa.findFirst({
    where: { leadId: lead.id, status: "aberta" },
    orderBy: { criadoEm: "desc" },
  });
  if (!conversa) {
    conversa = await prisma.conversa.create({
      data: {
        leadId: lead.id,
        instancia: payload?.instance ?? "sixxis-wa1",
      },
    });
  }

  // Hora real da mensagem quando disponivel (timestamp unix em segundos).
  const ts = data?.messageTimestamp;
  const hora = ts ? new Date(Number(ts) * 1000) : undefined;

  try {
    const mensagem = await prisma.mensagem.create({
      data: {
        externalId,
        conversaId: conversa.id,
        direcao,
        tipo,
        conteudo,
        raw: payload as unknown as Prisma.InputJsonValue,
        ...(hora ? { hora } : {}),
      },
    });

    console.log(`[ingest] ${telefone} ${tipo} ${externalId}`);

    // Tempo real: notifica os clientes conectados sobre a nova mensagem.
    (io ?? getIO())?.emit("mensagem:nova", {
      leadId: lead.id,
      conversaId: conversa.id,
      mensagemId: mensagem.id,
      direcao: mensagem.direcao,
      tipo: mensagem.tipo,
      conteudo: mensagem.conteudo,
      hora: mensagem.hora,
    });
  } catch (erro) {
    // Corrida: outro job gravou a mesma mensagem entre o findUnique e o create.
    // P2002 = violacao de unique (externalId). Tratamos como idempotente.
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      console.log(`[ingest] ${telefone} duplicada ignorada ${externalId}`);
      return;
    }
    throw erro;
  }
}

// Cria e inicia o worker que consome a fila "messages-in".
export function createMessagesWorker(io?: Server): Worker {
  const worker = new Worker(
    NOME_FILA,
    async (job: Job) => {
      // Cada job e processado isoladamente. Em erro, lancamos para o BullMQ
      // reprocessar (retry). Um job ruim nunca derruba o worker.
      await processarEvento(job.data as EventoEvolution, io ?? null);
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[worker] job ${job?.id ?? "?"} falhou (tentativa ${job?.attemptsMade ?? "?"}): ${err?.message}`,
    );
  });

  worker.on("error", (err) => {
    console.error(`[worker] erro de conexao: ${err?.message}`);
  });

  console.log(`[worker] consumindo a fila "${NOME_FILA}"`);
  return worker;
}
