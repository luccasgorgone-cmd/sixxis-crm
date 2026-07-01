// Fila BullMQ "messages-in" e o worker que a consome.
// O webhook apenas ENFILEIRA o payload bruto e responde 200; este worker
// processa depois, com retry automatico. Assim, um deploy/reinicio no meio
// do recebimento nao perde a mensagem do cliente.
import { Queue, Worker, type Job, type ConnectionOptions } from "bullmq";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import type { Server } from "socket.io";
import { prisma } from "./prisma";
import { getIO } from "./socket";
import { normalizarJid } from "./phone";
import { garantirNegocioParaLead } from "./negocio";
import { rotearLeadNovo } from "./roteamento";
import { criarNotificacao } from "./notificacao";
import { campoDono } from "./dono";
import { estaAbertoAgora, normalizarHorarios } from "./horario";
import { fetchFotoPerfil, enviarTexto } from "./evolution";
import { garantirConversaUnificada } from "./conversa";
import { persistirMidia } from "./midia";
import { nomeEfetivo } from "./cliente";
import { aplicarModelo } from "./modelos";
import { enviarSMS, enviarEmail } from "./providers";
import {
  TipoMsg,
  DirecaoMsg,
  StatusEnvio,
  Finalidade,
  Prisma,
} from "../generated/prisma/client";
import {
  CanalEnvio,
  StatusCampanha,
  StatusDestino,
  AtividadeTipo,
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
      variacoesJson: true,
      status: true,
      agente: { select: { nome: true } },
    },
  });
  if (!campanha) return;
  if (campanha.status === StatusCampanha.CANCELADA) return;

  // Redacoes alternativas (copiadas na criacao) para variar por destinatario.
  const variacoes = Array.isArray(campanha.variacoesJson)
    ? (campanha.variacoesJson as unknown[]).filter(
        (v): v is string => typeof v === "string",
      )
    : [];

  // Instancia de WhatsApp da finalidade (para o canal WhatsApp). O envio pode
  // sair por este numero; a resposta do cliente cai sempre na conversa unificada.
  let instancia: string | null = null;
  let instanciaId: string | null = null;
  if (campanha.canal === CanalEnvio.WHATSAPP) {
    const inst = await prisma.instanciaWhatsApp.findFirst({
      where: { finalidade: campanha.finalidade, ativo: true },
      select: { id: true, instanciaEvolution: true },
    });
    instancia = inst?.instanciaEvolution ?? process.env.EVOLUTION_INSTANCE ?? null;
    instanciaId = inst?.id ?? null;
  }

  const valores = (campanha.valoresJson ?? {}) as Record<string, string>;

  const destinos = await prisma.campanhaDestino.findMany({
    where: { campanhaId, status: StatusDestino.PENDENTE },
    select: {
      id: true,
      destino: true,
      leadId: true,
      lead: {
        select: {
          id: true,
          nome: true,
          pushName: true,
          nomeManual: true,
          telefone: true,
          empresa: true,
          // {produto} = produto do ultimo orcamento do lead (se houver).
          orcamentos: {
            orderBy: { criadoEm: "desc" },
            take: 1,
            select: { produto: true },
          },
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
      lead: {
        nomeEfetivo: nomeEfetivo(d.lead),
        empresa: d.lead.empresa,
        produto: d.lead.orcamentos[0]?.produto ?? null,
      },
      agente: { nome: campanha.agente?.nome ?? null },
      valoresDigitados: valores,
      variacoes,
    });

    let ok = false;
    let erro: string | null = null;
    let externalIdWa: string | undefined;
    if (campanha.canal === CanalEnvio.WHATSAPP) {
      const r = await enviarTexto(d.destino, texto, instancia);
      ok = r.ok;
      externalIdWa = r.externalId;
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

    // Envio em massa por WhatsApp: registra a mensagem OUT na CONVERSA UNIFICADA
    // (leadId, finalidade) do destinatario, reabrindo/usando a existente. Nunca
    // cria conversa por instancia. A futura resposta do cliente cai no mesmo chat.
    if (ok && campanha.canal === CanalEnvio.WHATSAPP) {
      try {
        const conversa = await garantirConversaUnificada(
          d.leadId,
          campanha.finalidade,
          { instancia, instanciaId },
        );
        const msg = await prisma.mensagem.create({
          data: {
            externalId: externalIdWa ?? `out-${randomUUID()}`,
            conversaId: conversa.id,
            direcao: DirecaoMsg.OUT,
            tipo: TipoMsg.TEXTO,
            conteudo: texto,
            instancia,
            instanciaId,
            statusEnvio: StatusEnvio.ENVIADA,
            lida: true,
            hora: new Date(),
          },
        });
        await prisma.conversa.update({
          where: { id: conversa.id },
          data: { ultimaMensagemEm: msg.hora },
        });
        (io ?? getIO())?.emit("mensagem:nova", {
          leadId: d.leadId,
          leadNome: nomeEfetivo(d.lead),
          leadTelefone: d.destino,
          conversaId: conversa.id,
          mensagemId: msg.id,
          direcao: msg.direcao,
          tipo: msg.tipo,
          conteudo: msg.conteudo,
          mediaUrl: msg.mediaUrl,
          statusEnvio: msg.statusEnvio,
          hora: msg.hora,
          naoLidas: 0,
          ultimaMensagemEm: msg.hora,
        });
      } catch (e) {
        // Falha de registro nao deve abortar a campanha (idempotencia/corrida).
        console.warn(
          `[campanha] falha ao registrar mensagem na conversa unificada do lead ${d.leadId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

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

// Extrai um conteudo legivel: texto puro, legenda de midia ou um resumo para
// tipos sem texto (figurinha/localizacao/contato). Captura o maximo de info.
function extrairConteudo(
  message?: Record<string, unknown> | null,
): string | null {
  if (!message) return null;
  const m = message as Record<string, Record<string, unknown> | string | undefined>;

  const conversation = m["conversation"];
  if (typeof conversation === "string") return conversation;
  const estendida = m["extendedTextMessage"] as { text?: string } | undefined;
  if (typeof estendida?.text === "string") return estendida.text;

  // Legendas de midia.
  const img = m["imageMessage"] as { caption?: string } | undefined;
  if (img) return img.caption?.trim() || "[imagem]";
  const vid = m["videoMessage"] as { caption?: string } | undefined;
  if (vid) return vid.caption?.trim() || "[video]";
  const doc = m["documentMessage"] as
    | { caption?: string; fileName?: string }
    | undefined;
  if (doc) return doc.caption?.trim() || `[documento] ${doc.fileName ?? ""}`.trim();
  if (m["audioMessage"]) return "[audio]";

  // Tipos sem texto: resumo legivel.
  if (m["stickerMessage"]) return "[figurinha]";
  const loc = m["locationMessage"] as
    | { degreesLatitude?: number; degreesLongitude?: number; name?: string }
    | undefined;
  if (loc) {
    const lugar = loc.name ? ` ${loc.name}` : "";
    const coord =
      loc.degreesLatitude != null && loc.degreesLongitude != null
        ? ` (${loc.degreesLatitude}, ${loc.degreesLongitude})`
        : "";
    return `[localizacao]${lugar}${coord}`.trim();
  }
  const contato = m["contactMessage"] as { displayName?: string } | undefined;
  if (contato) return `[contato] ${contato.displayName ?? ""}`.trim();
  const contatos = m["contactsArrayMessage"] as
    | { contacts?: { displayName?: string }[] }
    | undefined;
  if (contatos?.contacts) {
    return `[contatos] ${contatos.contacts
      .map((c) => c.displayName)
      .filter(Boolean)
      .join(", ")}`.trim();
  }
  return null;
}

// Extrai dados de ANUNCIO (Click-to-WhatsApp) do contextInfo.externalAdReply
// de qualquer subtipo de mensagem. Retorna ctwaClid + dados do anuncio quando
// presentes (mensagem originada de clique num anuncio do Meta).
function extrairAnuncio(message?: Record<string, unknown> | null): {
  ctwaClid: string | null;
  anuncioId: string | null;
  anuncioTitulo: string | null;
  anuncioUrl: string | null;
  origemDetalhe: string | null;
} | null {
  if (!message) return null;
  for (const sub of Object.values(message)) {
    if (!sub || typeof sub !== "object") continue;
    const ctx = (sub as { contextInfo?: Record<string, unknown> }).contextInfo;
    if (!ctx) continue;
    const ad = ctx["externalAdReply"] as
      | {
          title?: string;
          body?: string;
          sourceId?: string;
          sourceUrl?: string;
          sourceType?: string;
          ctwaClid?: string;
        }
      | undefined;
    const ctwaClid =
      (ad?.ctwaClid as string | undefined) ??
      (ctx["ctwaClid"] as string | undefined) ??
      null;
    if (ad || ctwaClid) {
      return {
        ctwaClid: ctwaClid || null,
        anuncioId: ad?.sourceId || null,
        anuncioTitulo: ad?.title || null,
        anuncioUrl: ad?.sourceUrl || null,
        origemDetalhe: ad?.body || ad?.sourceType || null,
      };
    }
  }
  return null;
}

// Transcricao de audio (speech-to-text), quando a Evolution enviar. Busca em
// alguns locais conhecidos; ausente = null.
function extrairTranscricao(data?: EventoEvolution["data"]): string | null {
  const d = data as Record<string, unknown> | undefined;
  const direto = d?.["speechToText"];
  if (typeof direto === "string" && direto.trim()) return direto.trim();
  const msg = data?.message as Record<string, unknown> | undefined;
  const noMsg = msg?.["speechToText"];
  if (typeof noMsg === "string" && noMsg.trim()) return noMsg.trim();
  const audio = msg?.["audioMessage"] as { transcription?: string } | undefined;
  if (typeof audio?.transcription === "string" && audio.transcription.trim()) {
    return audio.transcription.trim();
  }
  return null;
}

// Revogacao recebida (cliente apagou a mensagem): preserva o conteudo, so marca
// apagada=true (apagadaPor=CLIENTE) e registra Atividade. Auditavel pelo admin.
async function marcarApagadaPeloCliente(
  externalIdRevogado: string,
  io: Server | null,
): Promise<void> {
  const msg = await prisma.mensagem.findUnique({
    where: { externalId: externalIdRevogado },
    select: {
      id: true,
      apagada: true,
      conversa: { select: { id: true, leadId: true } },
    },
  });
  if (!msg || msg.apagada) return;
  await prisma.mensagem.update({
    where: { id: msg.id },
    data: { apagada: true, apagadaEm: new Date(), apagadaPor: "CLIENTE" },
  });
  await prisma.atividade.create({
    data: {
      leadId: msg.conversa.leadId,
      tipo: AtividadeTipo.MENSAGEM_APAGADA,
      descricao: "Mensagem apagada pelo cliente",
    },
  });
  (io ?? getIO())?.emit("mensagem:apagada", {
    conversaId: msg.conversa.id,
    mensagemId: msg.id,
    apagadaPor: "CLIENTE",
  });
  console.log(`[ingest] mensagem ${externalIdRevogado} marcada como apagada (CLIENTE)`);
}

// Detecta o id revogado num evento: protocolMessage REVOKE (no upsert) ou
// messageStubType REVOKE (no update). Retorna o id da mensagem original.
function idRevogado(payload: EventoEvolution): string | null {
  const data = payload?.data as Record<string, unknown> | undefined;
  const proto = (data?.message as Record<string, unknown> | undefined)
    ?.protocolMessage as { type?: number | string; key?: { id?: string } } | undefined;
  const ehRevoke =
    !!proto && (proto.type === 0 || proto.type === "REVOKE" || proto.type === "0");
  if (ehRevoke && proto?.key?.id) return proto.key.id;

  const upd = data?.update as Record<string, unknown> | undefined;
  const stub = upd?.["messageStubType"] ?? data?.["messageStubType"];
  if ((stub === 1 || stub === "REVOKE") && payload?.data?.key?.id) {
    return payload.data.key.id;
  }
  return null;
}

// Atualiza o statusEnvio de uma mensagem OUT a partir de um messages.update.
const ORDEM_STATUS: Record<string, number> = {
  ENVIANDO: 0,
  ENVIADA: 1,
  ENTREGUE: 2,
  ERRO: 3,
};
const MAPA_STATUS: Record<string, StatusEnvio> = {
  PENDING: StatusEnvio.ENVIADA,
  SERVER_ACK: StatusEnvio.ENVIADA,
  DELIVERY_ACK: StatusEnvio.ENTREGUE,
  READ: StatusEnvio.ENTREGUE,
  PLAYED: StatusEnvio.ENTREGUE,
  ERROR: StatusEnvio.ERRO,
};
async function atualizarStatusMensagem(
  payload: EventoEvolution,
  io: Server | null,
): Promise<void> {
  const data = payload?.data as Record<string, unknown> | undefined;
  const externalId =
    (data?.key as { id?: string } | undefined)?.id ??
    (data?.["keyId"] as string | undefined);
  const upd = data?.update as { status?: string } | undefined;
  const statusRaw = String(upd?.status ?? (data?.["status"] as string) ?? "");
  if (!externalId || !statusRaw) return;
  const novo = MAPA_STATUS[statusRaw.toUpperCase()];
  if (!novo) return;

  const msg = await prisma.mensagem.findUnique({
    where: { externalId },
    select: { id: true, direcao: true, conversaId: true, statusEnvio: true },
  });
  if (!msg || msg.direcao !== DirecaoMsg.OUT) return;
  // Nao regride (ENTREGUE nao volta para ENVIADA), exceto para ERRO.
  if (
    msg.statusEnvio &&
    novo !== StatusEnvio.ERRO &&
    ORDEM_STATUS[msg.statusEnvio] >= ORDEM_STATUS[novo]
  ) {
    return;
  }
  await prisma.mensagem.update({
    where: { id: msg.id },
    data: { statusEnvio: novo },
  });
  (io ?? getIO())?.emit("mensagem:status", {
    conversaId: msg.conversaId,
    mensagemId: msg.id,
    statusEnvio: novo,
  });
}

// URL "original" da midia (sub-objeto da mensagem). Pode ser criptografada/
// efemera; usada apenas como fallback enquanto o R2 nao confirma.
function extrairMediaUrl(message?: Record<string, unknown> | null): string | null {
  if (!message) return null;
  for (const chave of [
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "documentMessage",
    "stickerMessage",
  ]) {
    const sub = message[chave] as { url?: string } | undefined;
    if (sub?.url) return sub.url;
  }
  return null;
}

// Tipos que carregam midia para baixar.
function ehMidia(tipo: TipoMsg): boolean {
  return (
    tipo === TipoMsg.IMAGEM ||
    tipo === TipoMsg.VIDEO ||
    tipo === TipoMsg.AUDIO ||
    tipo === TipoMsg.DOCUMENTO
  );
}

// Best-effort: baixa a midia da Evolution (com retry/backoff) e sobe no R2,
// gravando a URL permanente em mediaUrl. Nao bloqueia a ingestao: dispara em
// background e engole erros (o desfecho ja e logado por persistirMidia).
function agendarMidia(
  mensagemId: string,
  conversaId: string,
  externalId: string,
  telefone: string,
  instancia: string,
  data: EventoEvolution["data"],
  io: Server | null,
): void {
  void persistirMidia({
    mensagemId,
    conversaId,
    externalId,
    telefone,
    instancia,
    data,
    io,
  }).catch((erro) => {
    console.warn(
      `[midia] erro inesperado ao persistir ${externalId}: ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  });
}

// Dedup em memoria de chamadas ja tratadas (a Evolution envia varios eventos
// por chamada: offer/accept/terminate). TTL curto; reset no restart (aceitavel).
const chamadasVistas = new Map<string, number>();
const TTL_CHAMADA_MS = 10 * 60 * 1000;

// Chamada RECEBIDA (evento CALL): nao atende/streama. Resolve o setor pelo
// numero que recebeu; se o cliente ja tem dono nesse setor, notifica o dono;
// senao aciona a distribuicao (rotearLeadNovo) e notifica o escolhido. Registra
// Atividade "Chamada recebida" no historico do cliente.
async function processarChamada(
  payload: EventoEvolution,
  io: Server | null,
): Promise<void> {
  // O payload de CALL pode vir como objeto unico ou array de chamadas.
  const bruto = (payload as { data?: unknown }).data;
  const chamada = (Array.isArray(bruto) ? bruto[0] : bruto) as
    | { id?: string; from?: string; isVideo?: boolean; status?: string }
    | undefined;
  const jid = chamada?.from;
  if (!jid || jid.endsWith("@g.us")) return;

  // Dedup por id da chamada (ou pelo jid quando nao houver id).
  const agoraMs = Date.now();
  for (const [k, t] of chamadasVistas) {
    if (agoraMs - t > TTL_CHAMADA_MS) chamadasVistas.delete(k);
  }
  const chaveDedup = chamada?.id ?? `from:${jid}`;
  if (chamadasVistas.has(chaveDedup)) return;
  chamadasVistas.set(chaveDedup, agoraMs);

  const telefone = normalizarJid(jid);
  if (!telefone) return;

  // Setor pelo numero que RECEBEU (a instancia do payload).
  const nomeInstancia = payload?.instance ?? "sixxis-wa1";
  const instancia = await prisma.instanciaWhatsApp.findUnique({
    where: { instanciaEvolution: nomeInstancia },
    select: { finalidade: true },
  });
  const finalidade = instancia?.finalidade ?? Finalidade.VENDA;

  // Lead (cria se for um numero novo ligando pela 1a vez).
  const lead = await prisma.lead.upsert({
    where: { telefone },
    update: {},
    create: { telefone, origem: "whatsapp" },
  });

  // Garante negocio + roteia (idempotente) para resolver/definir o dono do setor.
  await garantirNegocioParaLead(lead.id, finalidade);
  await rotearLeadNovo(lead.id, finalidade);

  // Dono atual do setor apos o roteamento.
  const leadAtual = await prisma.lead.findUnique({
    where: { id: lead.id },
    select: { donoId: true, donoPosVendaId: true },
  });
  const donoId = leadAtual ? leadAtual[campoDono(finalidade)] : null;

  const tipoChamada = chamada?.isVideo ? "Chamada de video" : "Chamada";
  const descricao = `${tipoChamada} recebida${
    finalidade === Finalidade.POS_VENDA ? " (pos-venda)" : ""
  }`;

  // Historico do cliente.
  await prisma.atividade.create({
    data: {
      leadId: lead.id,
      agenteId: donoId ?? null,
      tipo: AtividadeTipo.CONTATO,
      descricao,
    },
  });

  // Notifica o atendente correto (se houver dono).
  if (donoId) {
    await criarNotificacao({
      agenteId: donoId,
      tipo: "CHAMADA",
      titulo: `${tipoChamada} recebida`,
      descricao: `${nomeEfetivo(lead)} esta ligando`,
      link: "/inbox",
      leadId: lead.id,
    });
  }
  console.log(`[chamada] ${telefone} (${finalidade}) -> dono ${donoId ?? "sem dono"}`);
}

// Mensagem padrao (editavel em Admin -> Geral) quando o admin nao definiu uma.
const MSG_FORA_HORARIO_PADRAO =
  "Olá! Agradecemos o seu contato com a Sixxis. No momento estamos fora do horário de atendimento. Assim que um de nossos atendentes estiver disponível, retornaremos por aqui. Obrigado pela preferência!";
// Reenvio so apos ~8h (nao repete a cada mensagem do cliente).
const REENVIO_FORA_HORARIO_MS = 8 * 60 * 60 * 1000;

// Envia, UMA vez por janela, a mensagem automatica de "fora do horario" quando o
// CRM esta fechado. NAO interfere no roteamento (o lead ja foi atribuido antes).
async function responderForaHorarioSePreciso(
  conversa: {
    id: string;
    instancia: string;
    instanciaId: string | null;
    foraHorarioAvisadoEm: Date | null;
  },
  telefone: string,
  lead: {
    id: string;
    nome: string | null;
    pushName: string | null;
    nomeManual: string | null;
    telefone: string;
    fotoUrl: string | null;
  },
  io: Server | null,
): Promise<void> {
  try {
    const config = await prisma.configuracaoCRM.findFirst({
      select: { horarios: true, fuso: true, mensagemForaHorario: true },
    });
    if (!config) return;
    // Dentro do expediente: nunca envia.
    const aberto = estaAbertoAgora(
      normalizarHorarios(config.horarios),
      config.fuso ?? "America/Sao_Paulo",
    );
    if (aberto) return;
    // Ja avisou nesta janela? Nao repete.
    const ultimo = conversa.foraHorarioAvisadoEm?.getTime() ?? 0;
    if (Date.now() - ultimo < REENVIO_FORA_HORARIO_MS) return;

    const texto = (config.mensagemForaHorario ?? "").trim() || MSG_FORA_HORARIO_PADRAO;
    const agora = new Date();
    const r = await enviarTexto(telefone, texto, conversa.instancia);
    const status = r.ok ? StatusEnvio.ENVIADA : StatusEnvio.ERRO;

    let msg;
    try {
      msg = await prisma.mensagem.create({
        data: {
          externalId: r.externalId ?? `out-auto-${randomUUID()}`,
          conversaId: conversa.id,
          direcao: DirecaoMsg.OUT,
          tipo: TipoMsg.TEXTO,
          conteudo: texto,
          instancia: conversa.instancia,
          instanciaId: conversa.instanciaId,
          statusEnvio: status,
          lida: true,
          hora: agora,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        msg = await prisma.mensagem.create({
          data: {
            externalId: `out-auto-${randomUUID()}`,
            conversaId: conversa.id,
            direcao: DirecaoMsg.OUT,
            tipo: TipoMsg.TEXTO,
            conteudo: texto,
            instancia: conversa.instancia,
            instanciaId: conversa.instanciaId,
            statusEnvio: status,
            lida: true,
            hora: agora,
          },
        });
      } else {
        throw e;
      }
    }

    // Marca a janela (mesmo em falha de envio, para nao reinsistir a cada msg).
    await prisma.conversa.update({
      where: { id: conversa.id },
      data: { foraHorarioAvisadoEm: agora, ultimaMensagemEm: agora },
    });

    (io ?? getIO())?.emit("mensagem:nova", {
      leadId: lead.id,
      leadNome: nomeEfetivo(lead),
      leadFoto: lead.fotoUrl,
      leadTelefone: telefone,
      conversaId: conversa.id,
      mensagemId: msg.id,
      direcao: msg.direcao,
      tipo: msg.tipo,
      conteudo: msg.conteudo,
      mediaUrl: msg.mediaUrl,
      statusEnvio: msg.statusEnvio,
      hora: msg.hora,
      naoLidas: 0,
      ultimaMensagemEm: agora,
    });
  } catch (e) {
    console.warn(
      `[fora-horario] falha ao responder ${telefone}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
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

  // Chamada recebida (CALL): notifica o atendente; nao tenta atender.
  if (evt === "CALL") {
    await processarChamada(payload, io);
    return;
  }

  // Revogacao dedicada (cliente apagou): preserva, nao deleta.
  if (evt === "MESSAGES_DELETE") {
    const revId = payload?.data?.key?.id ?? idRevogado(payload);
    if (revId) await marcarApagadaPeloCliente(revId, io);
    return;
  }
  // Update pode ser revogacao (stub) OU atualizacao de status de entrega/leitura.
  if (evt === "MESSAGES_UPDATE") {
    const revId = idRevogado(payload);
    if (revId) await marcarApagadaPeloCliente(revId, io);
    else await atualizarStatusMensagem(payload, io);
    return;
  }
  // So processamos recebimento/insercao de mensagens. Demais eventos: ignora.
  if (evt !== "MESSAGES_UPSERT") return;

  // Revogacao que chega como upsert com protocolMessage REVOKE.
  const revInline = idRevogado(payload);
  if (revInline) {
    await marcarApagadaPeloCliente(revInline, io);
    return;
  }

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

  // DIAGNOSTICO (temporario, Fatia 2.37 Parte A — REMOVER na Parte C): quando o
  // remetente e um @lid (numero mascarado por privacidade), loga a key crua e o
  // pushName para descobrirmos como mapear @lid -> telefone real via Evolution.
  if (jid.endsWith("@lid")) {
    console.log(
      "[LID-DIAG]",
      JSON.stringify(data?.key ?? {}),
      "pushName=",
      data?.pushName,
    );
  }

  // Ignora "leads fantasma": remetentes que nao sao clientes de fato.
  //   @g.us      -> grupos
  //   @broadcast -> listas de transmissao (e status@broadcast: status/stories)
  //   @newsletter-> canais/newsletters
  // Clientes normais (@s.whatsapp.net) e numeros mascarados (@lid) seguem o
  // fluxo normal. Anuncios (Click-to-WhatsApp) chegam por @s.whatsapp.net e
  // continuam entrando.
  if (
    jid.endsWith("@g.us") ||
    jid.endsWith("@broadcast") ||
    jid.endsWith("@newsletter")
  ) {
    return;
  }

  const fromMe = data?.key?.fromMe === true;
  const pushName = data?.pushName;
  // pushName so nomeia o lead em mensagens de ENTRADA. Em mensagens de SAIDA
  // (fromMe), o WhatsApp envia "Voce"/nome da propria conta, que NAO e o nome
  // do cliente — usa-lo renomearia o cliente para "Voce".
  const pushNameCliente = fromMe ? undefined : (pushName ?? undefined);
  const telefone = normalizarJid(jid);
  if (!telefone) {
    console.warn(`[ingest] jid sem digitos ignorado: ${jid}`);
    return;
  }

  const tipo = mapearTipo(data?.messageType);
  const conteudo = extrairConteudo(data?.message);
  const transcricao = extrairTranscricao(data);
  const mediaUrlOriginal = extrairMediaUrl(data?.message);
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
      // So nomeia a partir do pushName em mensagens de entrada (ver acima).
      // Em saida, cria sem nome e cai no telefone via nomeEfetivo.
      nome: pushNameCliente,
      pushName: pushNameCliente,
      origem: "whatsapp",
    },
  });
  // Mantem o pushName do WhatsApp atualizado — apenas em mensagens de ENTRADA.
  if (pushNameCliente && lead.pushName !== pushNameCliente) {
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: { pushName: pushNameCliente },
    });
  }
  // Compat: se o nome legado ainda estava vazio, preenche com o pushName de
  // entrada. Nunca sobrescreve o nomeManual (override do atendente).
  if (!lead.nome && pushNameCliente) {
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: { nome: pushNameCliente },
    });
  }

  // Origem por ANUNCIO (Click-to-WhatsApp): grava na 1a mensagem, sem
  // sobrescrever dados ja existentes com vazio. Registra Atividade de origem.
  if (direcao === DirecaoMsg.IN && !lead.ctwaClid && !lead.anuncioId) {
    const anuncio = extrairAnuncio(data?.message);
    if (anuncio && (anuncio.ctwaClid || anuncio.anuncioId)) {
      lead = await prisma.lead.update({
        where: { id: lead.id },
        data: {
          ...(anuncio.ctwaClid ? { ctwaClid: anuncio.ctwaClid } : {}),
          ...(anuncio.anuncioId ? { anuncioId: anuncio.anuncioId } : {}),
          ...(anuncio.anuncioTitulo ? { anuncioTitulo: anuncio.anuncioTitulo } : {}),
          ...(anuncio.anuncioUrl ? { anuncioUrl: anuncio.anuncioUrl } : {}),
          ...(anuncio.origemDetalhe ? { origemDetalhe: anuncio.origemDetalhe } : {}),
          ...(lead.origem ? {} : { origem: "anuncio" }),
        },
      });
      await prisma.atividade.create({
        data: {
          leadId: lead.id,
          tipo: AtividadeTipo.CRIACAO,
          descricao: `Origem: anuncio${anuncio.anuncioTitulo ? ` "${anuncio.anuncioTitulo}"` : ""}`,
        },
      });
    }
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

  // Conversa UNIFICADA por (leadId, finalidade): considera QUALQUER conversa do
  // setor (inclusive arquivada) e a REABRE em vez de criar uma segunda. Assim
  // todos os numeros do mesmo setor caem na mesma conversa.
  const conversa = await garantirConversaUnificada(lead.id, finalidade, {
    instancia: nomeInstancia,
    instanciaId: instancia?.id ?? null,
  });

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
        // Numero que originou/enviou esta mensagem (mantido mesmo na conversa
        // unificada, em que varios numeros do setor coexistem).
        instancia: nomeInstancia,
        instanciaId: instancia?.id ?? null,
        ...(transcricao ? { transcricao } : {}),
        ...(mediaUrlOriginal ? { mediaUrl: mediaUrlOriginal } : {}),
        raw: payload as unknown as Prisma.InputJsonValue,
        ...(hora ? { hora } : {}),
      },
    });

    console.log(`[ingest] ${telefone} ${tipo} ${externalId}`);

    // Midia: baixa da Evolution e persiste no R2 (best-effort, em background).
    if (ehMidia(tipo)) {
      agendarMidia(
        mensagem.id,
        conversa.id,
        externalId,
        telefone,
        nomeInstancia,
        data,
        io,
      );
    }

    // Atualiza a conversa: ultima atividade sempre; nao lidas so na ENTRADA.
    // (mensagens OUT vindas do proprio celular nao contam como nao lidas.)
    const conversaAtualizada = await prisma.conversa.update({
      where: { id: conversa.id },
      data: {
        ultimaMensagemEm: mensagem.hora,
        // Mensagem de ENTRADA define o numero padrao de resposta da conversa
        // (responde-se por padrao pelo numero que o cliente usou por ultimo).
        ...(direcao === DirecaoMsg.IN
          ? {
              naoLidas: { increment: 1 },
              instancia: nomeInstancia,
              instanciaId: instancia?.id ?? null,
            }
          : {}),
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
      mediaUrl: mensagem.mediaUrl,
      statusEnvio: mensagem.statusEnvio,
      hora: mensagem.hora,
      naoLidas: conversaAtualizada.naoLidas,
      ultimaMensagemEm: mensagem.hora,
    });

    // Garante um negocio aberto para o lead NAQUELA finalidade (idempotente).
    // Registra HistoricoNegocio(CRIACAO) e emite evento.
    await garantirNegocioParaLead(lead.id, finalidade);
    // Roteia o negocio da finalidade para a equipe correta (sticky/round-robin).
    // Idempotente: nao mexe em negocio ja atribuido. (Roda independentemente do
    // horario — o lead e atribuido mesmo fora do expediente.)
    await rotearLeadNovo(lead.id, finalidade);

    // Auto-resposta de FORA DO HORARIO: apenas em mensagens de ENTRADA, uma vez
    // (nao repete a cada mensagem; reenvia apos ~8h). Nao bloqueia o roteamento.
    if (direcao === DirecaoMsg.IN) {
      await responderForaHorarioSePreciso(
        { id: conversa.id, instancia: conversa.instancia, instanciaId: conversa.instanciaId, foraHorarioAvisadoEm: conversa.foraHorarioAvisadoEm },
        telefone,
        lead,
        io,
      );
    }
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
