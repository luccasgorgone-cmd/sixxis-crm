// Render OTIMISTA de mensagens OUT de TEXTO (estilo WhatsApp). Fatia 3.11.
//
// Problema: o envio de texto era bloqueante — a bolha so aparecia depois do
// round-trip completo (API -> Evolution -> WhatsApp). Quando a Evolution esta
// lenta, o chat "trava" a percepcao.
//
// Solucao: ao clicar enviar, a bolha aparece na hora com estado "enviando"
// (id temporario "tmp-<uuid>", statusEnvio ENVIANDO) e o POST vai em background.
// Quando a API responde, a bolha temporaria e RECONCILIADA para a real (ou
// marcada como ERRO para reenviar). Nunca duplica.
//
// Anti-duplicacao com o socket ("mensagem:nova", emitido tambem para OUT): o
// clientId (o proprio id temporario) viaja no POST e volta no payload do socket.
// Assim o remetente casa o evento com a bolha otimista pelo clientId (campo
// idempotente); qualquer outra via casa pelo id REAL. Ordem POST vs socket nao
// importa: quem chegar primeiro reconcilia, o segundo vira no-op.

import type { MensagemItem } from "@/components/inbox/tipos";

// Via de render OTIMISTA: o dono da lista (Inbox/ConversaEmbed) expoe estas tres
// acoes; o compositor e o Reenviar do Thread apenas as disparam. `adicionar`
// injeta a bolha "enviando"; `reconciliar` troca tmp->real quando a API responde;
// `falhar` marca ERRO (remover=false) ou remove a bolha (remover=true).
export type ViaOtimista = {
  adicionar: (msg: MensagemItem) => void;
  reconciliar: (clientId: string, real: MensagemItem) => void;
  falhar: (clientId: string, remover: boolean) => void;
};

// Prefixo do id temporario. `ehTmp` distingue bolha otimista da real.
export const PREFIXO_TMP = "tmp-";

export function ehTmp(id: string): boolean {
  return id.startsWith(PREFIXO_TMP);
}

// Gera um clientId unico para o envio (id temporario da bolha + chave idempotente
// no socket). Usa crypto.randomUUID quando disponivel, com fallback simples.
export function novoClientId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const uuid =
    g.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${PREFIXO_TMP}${uuid}`;
}

// Cria a bolha OUT otimista (estado "enviando") exibida na hora do clique.
export function criarBolhaOtimista(opts: {
  clientId: string;
  texto: string;
  hora: string;
  respostaAId?: string | null;
  citada?: MensagemItem["citada"];
}): MensagemItem {
  return {
    id: opts.clientId,
    direcao: "OUT",
    tipo: "TEXTO",
    conteudo: opts.texto,
    statusEnvio: "ENVIANDO",
    hora: opts.hora,
    respostaAId: opts.respostaAId ?? null,
    citada: opts.citada ?? null,
  };
}

// Adiciona a bolha otimista ao fim (sem duplicar pelo clientId).
export function adicionarOtimista(
  prev: MensagemItem[],
  msg: MensagemItem,
): MensagemItem[] {
  return prev.some((m) => m.id === msg.id) ? prev : [...prev, msg];
}

// Preserva campos que so a bolha otimista tem (citada/respostaAId) quando a
// versao real/socket ainda nao os traz — evita o "flick" da citacao sumir.
function herdarDaTmp(real: MensagemItem, tmp?: MensagemItem): MensagemItem {
  if (!tmp) return real;
  return {
    ...real,
    citada: real.citada ?? tmp.citada ?? null,
    respostaAId: real.respostaAId ?? tmp.respostaAId ?? null,
  };
}

// Reconcilia a bolha temporaria (clientId) com a real. Se a real ja existe
// (chegou pelo socket antes do POST), apenas remove a temporaria; senao
// substitui a temporaria pela real no MESMO lugar (mantem a ordem/scroll).
export function reconciliarOtimista(
  prev: MensagemItem[],
  clientId: string,
  real: MensagemItem,
): MensagemItem[] {
  const tmp = prev.find((m) => m.id === clientId);
  if (prev.some((m) => m.id === real.id)) {
    return prev.filter((m) => m.id !== clientId);
  }
  const realCompleta = herdarDaTmp(real, tmp);
  return prev.some((m) => m.id === clientId)
    ? prev.map((m) => (m.id === clientId ? realCompleta : m))
    : [...prev, realCompleta];
}

// Marca a bolha temporaria como ERRO (mantem o id/conteudo para o Reenviar).
export function marcarErroOtimista(
  prev: MensagemItem[],
  clientId: string,
): MensagemItem[] {
  return prev.map((m) =>
    m.id === clientId ? { ...m, statusEnvio: "ERRO" } : m,
  );
}

// Remove a bolha temporaria (falha "dura" sem bolha persistida no servidor —
// ex.: sem numero valido; o texto volta ao compositor para reenviar).
export function removerOtimista(
  prev: MensagemItem[],
  clientId: string,
): MensagemItem[] {
  return prev.filter((m) => m.id !== clientId);
}

// Mescla um evento de socket com a lista, cobrindo a bolha otimista. Se o evento
// traz clientId e existe a bolha temporaria correspondente, reconcilia no lugar;
// senao faz dedup pelo id real. `montar` constroi a MensagemItem a partir do
// evento (cada tela monta com os campos que recebe).
export function mesclarSocket(
  prev: MensagemItem[],
  ev: { mensagemId: string; clientId?: string | null },
  montar: () => MensagemItem,
): MensagemItem[] {
  if (ev.clientId) {
    const tmp = prev.find((m) => m.id === ev.clientId);
    if (tmp) {
      if (prev.some((m) => m.id === ev.mensagemId)) {
        return prev.filter((m) => m.id !== ev.clientId);
      }
      return prev.map((m) => (m.id === ev.clientId ? herdarDaTmp(montar(), tmp) : m));
    }
  }
  return prev.some((m) => m.id === ev.mensagemId) ? prev : [...prev, montar()];
}

// Resultado do POST otimista, para o caller ajustar a UI (banner/texto/toast):
//  - "ok":             enviada; bolha real ENVIADA no lugar.
//  - "erro-persistido": Evolution falhou mas a bolha foi gravada (502 + mensagem);
//                       bolha real ERRO no lugar (mostra "Nao enviada"/Reenviar).
//  - "sem-bolha":      falha "dura" sem gravar (sem numero valido, 400/404/422);
//                       a bolha otimista foi REMOVIDA.
//  - "rede":           resposta perdida; bolha marcada ERRO (o socket com clientId
//                       pode reconciliar depois se o envio de fato ocorreu).
export type ResultadoEnvio =
  | { tipo: "ok" }
  | { tipo: "erro-persistido"; erro?: string }
  | { tipo: "sem-bolha"; erro?: string }
  | { tipo: "rede" };

// Dispara o POST /api/mensagens/enviar e reconcilia a bolha otimista, cobrindo
// todos os desfechos. Centraliza a logica compartilhada pelo Compositor (envio)
// e pelo Reenviar do Thread — o corpo (instancia/reply) vem do caller.
export async function enviarTextoOtimista(
  via: ViaOtimista,
  clientId: string,
  body: Record<string, unknown>,
): Promise<ResultadoEnvio> {
  try {
    const r = await fetch("/api/mensagens/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => null);
    if (d?.mensagem) {
      via.reconciliar(clientId, d.mensagem as MensagemItem);
      return r.ok
        ? { tipo: "ok" }
        : { tipo: "erro-persistido", erro: d?.erro };
    }
    via.falhar(clientId, true);
    return { tipo: "sem-bolha", erro: d?.erro };
  } catch {
    via.falhar(clientId, false);
    return { tipo: "rede" };
  }
}
