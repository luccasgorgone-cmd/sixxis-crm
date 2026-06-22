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
import { rotearLeadNovo } from "./roteamento";
import { fetchFotoPerfil, enviarTexto } from "./evolution";
import { nomeEfetivo } from "./cliente";
import { aplicarModelo } from "./modelos";
import { enviarSMS, enviarEmail } from "./providers";
import { TipoMsg, DirecaoMsg, Finalidade, Prisma } from "../generated/prisma/client";
import {
  CanalEnvio,
  StatusCampanha,
  StatusDestino,
} from "../generated/prisma/enums";

const NOME_FILA = "messages-in";
const FILA_CAMPANHAS = "campaigns";

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

// Produtor da fila de campanhas (criado sob demanda, igual a de mensagens).
let campaignQueueSingleton: Queue | null = null;
export function getCampaignsQueue(): Queue {
  if (!campaignQueueSingleton) {
    campaignQueueSingleton = new Queue(FILA_CAMPANHAS, {
      connection: getConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
      },
    });
  }
  return campaignQueueSingleton;
}

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Throttle entre envios (anti-ban). Configuravel por env.
const THROTTLE_CAMPANHA_MS = Number(process.env.CAMPANHA_THROTTLE_MS ?? 1500);

// Processa UMA campanha: itera os destinos PENDENTE com throttle, aplica o
// modelo por destinatario, envia pelo canal e grava status/erro + contadores.
async function processarCampanha(
  campanhaId: string,
  io: Server | null,
): Promise<void> {
  const campanha = await prisma.campanha.findUnique({
    where: { id: campanhaId },
    select: {
      id: true,
      canal: true,
      finalidade: true,
      mensagem: true,
      assunto: true,
      valoresJson: true,
      status: true,
    },
  });
  if (!campanha) return;
  if (campanha.status === StatusCampanha.CANCELADA) return;

  // Instancia de WhatsApp da finalidade (para o canal WhatsApp).
  let instancia: string | null = null;
  if (campanha.canal === CanalEnvio.WHATSAPP) {
    const inst = await prisma.instanciaWhatsApp.findFirst({
      where: { finalidade: campanha.finalidade, ativo: true },
      select: { instanciaEvolution: true },
    });
    instancia = inst?.instanciaEvolution ?? process.env.EVOLUTION_INSTANCE ?? null;
  }

  const valores = (campanha.valoresJson ?? {}) as Record<string, string>;

  const destinos = await prisma.campanhaDestino.findMany({
    where: { campanhaId, status: StatusDestino.PENDENTE },
    select: {
      id: true,
      destino: true,
      lead: {
        select: {
          nome: true,
          pushName: true,
          nomeManual: true,
          telefone: true,
          empresa: true,
        },
      },
    },
  });

  for (const d of destinos) {
    // Aborta se a campanha foi cancelada no meio.
    const atual = await prisma.campanha.findUnique({
      where: { id: campanhaId },
      select: { status: true },
    });
    if (atual?.status === StatusCampanha.CANCELADA) break;

    const texto = aplicarModelo(campanha.mensagem, {
      lead: { nomeEfetivo: nomeEfetivo(d.lead), empresa: d.lead.empresa },
      valoresDigitados: valores,
    });

    let ok = false;
    let erro: string | null = null;
    if (campanha.canal === CanalEnvio.WHATSAPP) {
      const r = await enviarTexto(d.destino, texto, instancia);
      ok = r.ok;
      erro = r.ok ? null : "falha no envio (WhatsApp)";
    } else if (campanha.canal === CanalEnvio.SMS) {
      const r = await enviarSMS(d.destino, texto);
      ok = r.ok;
      erro = r.erro ?? null;
    } else {
      const r = await enviarEmail(d.destino, campanha.assunto ?? "", texto);
      ok = r.ok;
      erro = r.erro ?? null;
    }

    await prisma.campanhaDestino.update({
      where: { id: d.id },
      data: {
        status: ok ? StatusDestino.ENVIADO : StatusDestino.FALHA,
        erro,
        // Guarda o texto exato enviado a este destinatario (auditoria/admin).
        mensagem: texto,
        enviadoEm: ok ? new Date() : null,
      },
    });
    const campanhaAtualizada = await prisma.campanha.update({
      where: { id: campanhaId },
      data: ok ? { enviados: { increment: 1 } } : { falhas: { increment: 1 } },
      select: { enviados: true, falhas: true, total: true, pulados: true },
    });

    (io ?? getIO())?.emit("campanha:progresso", {
      campanhaId,
      ...campanhaAtualizada,
    });

    await dormir(THROTTLE_CAMPANHA_MS);
  }

  // Conclui (a menos que tenha sido cancelada).
  const fim = await prisma.campanha.findUnique({
    where: { id: campanhaId },
    select: { status: true },
  });
  if (fim?.status !== StatusCampanha.CANCELADA) {
    await prisma.campanha.update({
      where: { id: campanhaId },
      data: { status: StatusCampanha.CONCLUIDA, concluidoEm: new Date() },
    });
  }
  (io ?? getIO())?.emit("campanha:concluida", { campanhaId });
}

// Cria e inicia o worker da fila de campanhas.
export function createCampaignWorker(io?: Server): Worker {
  const worker = new Worker(
    FILA_CAMPANHAS,
    async (job: Job) => {
      const { campanhaId } = job.data as { campanhaId: string };
      await processarCampanha(campanhaId, io ?? null);
    },
    { connection: getConnection() },
  );
  worker.on("failed", (job, err) => {
    console.error(
      `[campanha] job ${job?.id ?? "?"} falhou: ${err?.message}`,
    );
  });
  worker.on("error", (err) => {
    console.error(`[campanha] erro de conexao: ${err?.message}`);
  });
  console.log(`[worker] consumindo a fila "${FILA_CAMPANHAS}"`);
  return worker;
}

// Throttle da busca de foto de perfil: nao buscar a cada mensagem. Memoria do
// processo (reset no restart, aceitavel). Re-busca quando a foto envelhece (a
// URL do WhatsApp expira) ou apos a janela de throttle quando ainda nao ha foto.
const ultimaTentativaFoto = new Map<string, number>();
const THROTTLE_FOTO_MS = 6 * 60 * 60 * 1000; // 6h entre tentativas
const VALIDADE_FOTO_MS = 7 * 24 * 60 * 60 * 1000; // re-busca foto com >7d

// Best-effort, NAO bloqueia a ingestao: dispara em background e ignora erros.
function agendarFotoPerfil(
  lead: { id: string; fotoUrl: string | null; fotoAtualizadaEm: Date | null },
  telefone: string,
  instancia: string,
  io: Server | null,
): void {
  const agora = Date.now();
  const fotoFresca =
    !!lead.fotoUrl &&
    !!lead.fotoAtualizadaEm &&
    agora - lead.fotoAtualizadaEm.getTime() < VALIDADE_FOTO_MS;
  if (fotoFresca) return;
  const ultima = ultimaTentativaFoto.get(lead.id) ?? 0;
  if (agora - ultima < THROTTLE_FOTO_MS) return;
  ultimaTentativaFoto.set(lead.id, agora);

  void (async () => {
    try {
      const url = await fetchFotoPerfil(instancia, telefone);
      await prisma.lead.update({
        where: { id: lead.id },
        // Carimba fotoAtualizadaEm mesmo sem foto, para nao reinsistir a cada msg.
        data: { fotoAtualizadaEm: new Date(), ...(url ? { fotoUrl: url } : {}) },
      });
      if (url) {
        (io ?? getIO())?.emit("cliente:atualizado", { leadId: lead.id, fotoUrl: url });
      }
    } catch (erro) {
      console.warn(
        `[foto] falha ao atualizar foto do lead ${lead.id}: ${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  })();
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
      pushName: pushName ?? undefined,
      origem: "whatsapp",
    },
  });
  // Mantem o pushName do WhatsApp sempre atualizado quando vier no payload.
  if (pushName && lead.pushName !== pushName) {
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: { pushName },
    });
  }
  // Compat: se o nome legado ainda estava vazio, preenche com o pushName.
  if (!lead.nome && pushName) {
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: { nome: pushName },
    });
  }

  // Resolve a instancia (numero) pelo campo `instance` do payload. Define a
  // finalidade (VENDA/POS_VENDA). Instancia nao cadastrada: ingere mesmo assim
  // como VENDA e loga aviso (nao perde mensagem).
  const nomeInstancia = payload?.instance ?? "sixxis-wa1";
  const instancia = await prisma.instanciaWhatsApp.findUnique({
    where: { instanciaEvolution: nomeInstancia },
    select: { id: true, finalidade: true },
  });
  if (!instancia) {
    console.warn(
      `[ingest] instancia "${nomeInstancia}" nao cadastrada; usando finalidade VENDA`,
    );
  }
  const finalidade = instancia?.finalidade ?? Finalidade.VENDA;

  // Foto de perfil do WhatsApp (best-effort, throttled, nao bloqueia ingestao).
  agendarFotoPerfil(
    { id: lead.id, fotoUrl: lead.fotoUrl, fotoAtualizadaEm: lead.fotoAtualizadaEm },
    telefone,
    nomeInstancia,
    io,
  );

  // Conversa: garante UMA conversa "aberta" para o Lead NAQUELA finalidade.
  let conversa = await prisma.conversa.findFirst({
    where: { leadId: lead.id, status: "aberta", finalidade },
    orderBy: { criadoEm: "desc" },
  });
  if (!conversa) {
    conversa = await prisma.conversa.create({
      data: {
        leadId: lead.id,
        instancia: nomeInstancia,
        instanciaId: instancia?.id ?? null,
        finalidade,
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
      leadNome: nomeEfetivo(lead),
      leadFoto: lead.fotoUrl,
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

    // Garante um negocio aberto para o lead NAQUELA finalidade (idempotente).
    // Registra HistoricoNegocio(CRIACAO) e emite evento.
    await garantirNegocioParaLead(lead.id, finalidade);
    // Roteia o negocio da finalidade para a equipe correta (sticky/round-robin).
    // Idempotente: nao mexe em negocio ja atribuido.
    await rotearLeadNovo(lead.id, finalidade);
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
