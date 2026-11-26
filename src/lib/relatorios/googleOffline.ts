// Gerador do CSV de conversoes offline do Google Ads.
//
// Fecha o mesmo furo do Purchase do Meta, mas no lane do Google: venda que fecha
// no WhatsApp (fora do checkout do Site) e devolvida ao Google como conversao
// offline, usando o gclid capturado na 1a mensagem (Lead.googleClickId).
//
// Contrato 1:1 com o CSV do Site (lido pelo pipe datamanager_upload do Marketing):
//   header: gclid,data,valor,moeda,transaction_id
//   data   = ISO com offset fixo -03:00 (Sao Paulo; Brasil sem horario de verao)
//   valor  = 2 casas decimais (valorAjustado quando nao nulo; senao valor)
//   moeda  = BRL
//   transaction_id = negocioId (1 linha por negocio)
// Dialeto: separador "," · UTF-8 SEM BOM · quebra LF. O BOM quebra a coluna gclid
// no DictReader do uploader — por isso nunca prefixar ﻿.

import { prisma } from "@/lib/prisma";
import { TipoHistorico } from "@/generated/prisma/enums";
import { whereGanhosGoogleOffline } from "@/lib/tracking/conversaoElegivel";

export const CABECALHO_GOOGLE_OFFLINE = "gclid,data,valor,moeda,transaction_id";

export interface LinhaGoogleOffline {
  gclid: string;
  data: string; // ISO -03:00
  valor: string; // "990.00"
  moeda: string; // "BRL"
  transactionId: string;
}

export function resolverValorGoogleOffline(n: {
  valor: unknown;
  valorAjustado: unknown;
}): number {
  const valor = Number(n.valorAjustado != null ? n.valorAjustado : n.valor);
  return Number.isFinite(valor) ? valor : 0;
}

export function formatarValorGoogleOffline(n: {
  valor: unknown;
  valorAjustado: unknown;
}): string {
  return resolverValorGoogleOffline(n).toFixed(2);
}

// Formata um Date (UTC no banco) no horario de Sao Paulo com offset fixo -03:00,
// identico ao CSV do Site (ex.: 2026-10-11T15:19:08-03:00). hourCycle h23 evita
// "24" na meia-noite; en-CA garante YYYY-MM-DD.
export function formatarDataGoogleAds(d: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}:${p("second")}-03:00`;
}

// PURO: monta o texto CSV (header + linhas). Sem BOM, quebra LF, termina com \n.
// As colunas nunca contem virgula (gclid validado por charset; data/valor/moeda
// fixos; transaction_id = cuid), entao nao ha aspas/escape.
export function montarCsvGoogleOffline(linhas: LinhaGoogleOffline[]): string {
  const corpo = linhas.map(
    (l) => `${l.gclid},${l.data},${l.valor},${l.moeda},${l.transactionId}`,
  );
  return [CABECALHO_GOOGLE_OFFLINE, ...corpo].join("\n") + "\n";
}

// Coleta os GANHOs de WhatsApp com gclid, prontos pro CSV. Filtro:
// finalidade=VENDA · status=GANHO · lead.googleClickId != null · valor oficial>0.
// A data e o criadoEm do HistoricoNegocio GANHO mais recente ("houve ganho").
// Negocio GANHO sem esse historico e pulado (sem data confiavel — nunca fabrica
// data).
export async function coletarLinhasGoogleOffline(): Promise<LinhaGoogleOffline[]> {
  const negocios = await prisma.negocio.findMany({
    where: whereGanhosGoogleOffline(),
    select: {
      id: true,
      valor: true,
      valorAjustado: true,
      lead: { select: { googleClickId: true } },
      historicos: {
        where: { tipo: TipoHistorico.GANHO },
        orderBy: { criadoEm: "desc" },
        take: 1,
        select: { criadoEm: true },
      },
    },
  });

  const linhas: LinhaGoogleOffline[] = [];
  for (const n of negocios) {
    const gclid = n.lead.googleClickId;
    const hist = n.historicos[0];
    if (!gclid || !hist) continue;
    const valorNum = resolverValorGoogleOffline(n);
    if (!(valorNum > 0)) continue;
    linhas.push({
      gclid,
      data: formatarDataGoogleAds(hist.criadoEm),
      valor: formatarValorGoogleOffline(n),
      moeda: "BRL",
      transactionId: n.id,
    });
  }
  return linhas;
}
