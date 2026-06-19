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
import { garantirNegocioParaLead } from "./negocio";
import { TipoMsg, DirecaoMsg, Prisma } from "../generated/prisma/client";

const NOME_FILA = "messages-in";

// IMPORTANTE: nada de conexao Redis/BullMQ no topo do modulo. Tudo e criado
// sob demanda (lazy), so em runtime. Assim o "next build" nao tenta conectar
// no Redis em tempo de build (no Railway o Redis nem e alcancavel no build).

// Conexao dedicada para a fila/worker, criada sob demanda. Separada do
// singleton de redis.ts porque o worker usa comandos bloqueantes (BRPOPLPUSH)
// que ocupariam a conexao usada pelo health check.
// lazyConnect: true => so conecta na primeira operacao (runtime).
// maxRetriesPerRequest: null e exigido pelo BullMQ.
let connectionSingleton: IORedis | null = null;
function getConnection(): ConnectionOptions {
  if (!connectionSingleton) {
    const conn = new IORedis(
      process.env.REDIS_URL ?? "redis://localhost:6379",
      { lazyConnect: true, maxRetriesPerRequest: null },
    );
    conn.on("error", (err) => {
      console.error(`[queue] erro de conexao redis: ${err?.message}`);
    });
    connectionSingleton = conn;
  }
  // BullMQ embute sua propria copia do ioredis; o cast resolve a divergencia
  // puramente estrutural de tipos (em runtime e a mesma biblioteca).
  return connectionSingleton as unknown as ConnectionOptions;
}

// Produtor: a fila e criada na PRIMEIRA chamada (dentro do handler do webhook),
// nunca no carregamento do modulo.
let queueSingleton: Queue | null = null;
export function getMessagesQueue(): Queue {
  if (!queueSingleton) {
    queueSingleton = new Queue(NOME_FILA, {
      connection: getConnection(),
      defaultJobOptions: {
        // Retry com backoff exponencial caso o processamento falhe.
        attempts: 5,
        backoff: { type: "exponential", delay: 2000 },
        // Limpeza para nao acumular jobs concluidos/falhos indefinidamente.
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return queueSingleton;
}

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
  // A Evolution envia o nome do evento em formatos diferentes conforme a versao/
  // config: "MESSAGES_UPSERT" (maiusculo, underscore) ou "messages.upsert"
  // (minusculo, ponto). Normaliza antes de comparar para aceitar ambos.
  const evtRaw = String(payload?.event ?? "");
  const evt = evtRaw.toUpperCase().replace(/\./g, "_");
  // So processamos recebimento/insercao de mensagens. Demais eventos: ignora.
  if (evt !== "MESSAGES_UPSERT") return;

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

    // Atualiza a conversa: ultima atividade sempre; nao lidas so na ENTRADA.
    // (mensagens OUT vindas do proprio celular nao contam como nao lidas.)
    const conversaAtualizada = await prisma.conversa.update({
      where: { id: conversa.id },
      data: {
        ultimaMensagemEm: mensagem.hora,
        ...(direcao === DirecaoMsg.IN ? { naoLidas: { increment: 1 } } : {}),
      },
      select: { naoLidas: true },
    });

    // Tempo real: notifica os clientes conectados sobre a nova mensagem.
    // O payload carrega o suficiente para a UI atualizar lista E thread.
    (io ?? getIO())?.emit("mensagem:nova", {
      leadId: lead.id,
      leadNome: lead.nome,
      leadTelefone: telefone,
      conversaId: conversa.id,
      mensagemId: mensagem.id,
      direcao: mensagem.direcao,
      tipo: mensagem.tipo,
      conteudo: mensagem.conteudo,
      statusEnvio: mensagem.statusEnvio,
      hora: mensagem.hora,
      naoLidas: conversaAtualizada.naoLidas,
      ultimaMensagemEm: mensagem.hora,
    });

    // Garante um negocio aberto para o lead (idempotente). Leads novos passam
    // a aparecer no Kanban; registra HistoricoNegocio(CRIACAO) e emite evento.
    await garantirNegocioParaLead(lead.id);
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
    { connection: getConnection() },
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
