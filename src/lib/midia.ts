// Download + persistencia de midia das mensagens recebidas. Centraliza o fluxo
// "baixa base64 na Evolution -> sobe no R2 -> grava mediaUrl exibivel -> emite
// socket". Usado pelo worker de ingestao (best-effort, em background, com retry)
// e pelo endpoint admin de reprocessamento. Logs sempre com prefixo [midia].
//
// IMPORTANTE: a URL .enc original da Evolution NUNCA serve como mediaUrl
// exibivel (nao renderiza no browser). O mediaUrl exibivel vem SO do R2.
import type { Server } from "socket.io";
import { prisma } from "./prisma";
import { getIO } from "./socket";
import { baixarMidiaBase64 } from "./evolution";
import { r2Configurado, enviarParaR2, extensaoDoMime } from "./r2";

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Objeto `data` do evento (com key + message) que a Evolution espera de volta no
// getBase64FromMediaMessage.
type DadoMensagem = { key?: unknown; message?: unknown } | null | undefined;

export type ResultadoMidia =
  | { ok: true; url: string; chave: string }
  | { ok: false; motivo: "r2" | "download" | "upload" };

// NUCLEO COMPARTILHADO: baixa a midia (com backoff) e sobe no R2, retornando a
// URL exibivel. Usado tanto pelo inbox de CLIENTES (persistirMidia) quanto pelos
// GRUPOS (persistirMidiaGrupo) — mesma mecanica, sem duplicar. `namespace` e a
// pasta no R2 (telefone p/ cliente, jid do grupo p/ grupo). Nunca lanca.
async function baixarESubirMidia(opts: {
  externalId: string;
  namespace: string;
  instancia: string;
  data: DadoMensagem;
  atrasos: number[];
}): Promise<ResultadoMidia> {
  const { externalId, namespace, instancia, data, atrasos } = opts;

  if (!r2Configurado()) {
    console.warn(`[midia] R2 nao configurado; ${externalId} fica sem mediaUrl`);
    return { ok: false, motivo: "r2" };
  }

  let midia: { base64: string; mimetype: string | null } | null = null;
  for (let i = 0; i < atrasos.length; i++) {
    if (atrasos[i] > 0) await dormir(atrasos[i]);
    midia = await baixarMidiaBase64(instancia, data ?? {});
    if (midia) break;
    console.warn(
      `[midia] download falhou ${externalId} (tentativa ${i + 1}/${atrasos.length})`,
    );
  }
  if (!midia) {
    console.warn(`[midia] download desistiu ${externalId} apos ${atrasos.length} tentativas`);
    return { ok: false, motivo: "download" };
  }

  const buffer = Buffer.from(midia.base64, "base64");
  const ext = extensaoDoMime(midia.mimetype);
  const idSeguro = externalId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const nsSeguro = namespace.replace(/[^a-zA-Z0-9_-]/g, "_");
  const chave = `whatsapp/${nsSeguro}/${idSeguro}.${ext}`;
  const url = await enviarParaR2(
    chave,
    buffer,
    midia.mimetype ?? "application/octet-stream",
  );
  if (!url) {
    console.warn(`[midia] upload R2 falhou ${externalId} (chave ${chave})`);
    return { ok: false, motivo: "upload" };
  }
  return { ok: true, url, chave };
}

// Baixa a midia (com ate N tentativas espacadas) e sobe no R2, gravando o
// mediaUrl da mensagem e emitindo "mensagem:midia". A midia da Evolution as
// vezes nao esta pronta no 1o evento; por isso o backoff. Nunca lanca.
export async function persistirMidia(opts: {
  mensagemId: string;
  conversaId: string;
  externalId: string;
  telefone: string;
  instancia: string;
  data: DadoMensagem;
  io?: Server | null;
  // Atrasos (ms) ANTES de cada tentativa de download. Default: 2s, 5s, 12s.
  atrasos?: number[];
}): Promise<ResultadoMidia> {
  const { mensagemId, conversaId, externalId, telefone, instancia, data, io = null } = opts;
  const atrasos = opts.atrasos ?? [2000, 5000, 12000];

  const res = await baixarESubirMidia({ externalId, namespace: telefone, instancia, data, atrasos });
  if (!res.ok) return res;

  await prisma.mensagem.update({
    where: { id: mensagemId },
    data: { mediaUrl: res.url },
  });
  (io ?? getIO())?.emit("mensagem:midia", { conversaId, mensagemId, mediaUrl: res.url });
  console.log(`[midia] ok ${externalId} -> ${res.chave} (${res.url})`);
  return res;
}

// Igual ao persistirMidia, mas para GRUPOS internos (MensagemGrupo). Reusa o
// mesmo nucleo de download+R2; grava mediaUrl na MensagemGrupo e emite
// "grupo:atualizado" para a UI trocar o placeholder pela midia. Nunca lanca.
export async function persistirMidiaGrupo(opts: {
  mensagemId: string;
  grupoId: string;
  externalId: string;
  jid: string;
  instancia: string;
  data: DadoMensagem;
  io?: Server | null;
  atrasos?: number[];
}): Promise<ResultadoMidia> {
  const { mensagemId, grupoId, externalId, jid, instancia, data, io = null } = opts;
  const atrasos = opts.atrasos ?? [2000, 5000, 12000];

  const res = await baixarESubirMidia({ externalId, namespace: jid, instancia, data, atrasos });
  if (!res.ok) return res;

  await prisma.mensagemGrupo.update({
    where: { id: mensagemId },
    data: { mediaUrl: res.url },
  });
  (io ?? getIO())?.emit("grupo:atualizado", {
    grupoId,
    mensagemId,
    mediaUrl: res.url,
  });
  console.log(`[midia][grupo] ok ${externalId} -> ${res.chave} (${res.url})`);
  return res;
}
