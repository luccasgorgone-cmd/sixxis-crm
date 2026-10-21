// Admin: baixa o CSV de conversoes offline do Google Ads (GANHOs de WhatsApp com
// gclid capturado). Mesma fonte do arquivo exports/google-offline-*.csv usado
// pelo pipe do Marketing; esta rota e so para download humano no painel. Somente
// ADMIN. Nao envia nada pro Google — so gera o CSV.
import { NextResponse } from "next/server";
import { obterAdmin } from "@/lib/autorizacao";
import {
  coletarLinhasGoogleOffline,
  montarCsvGoogleOffline,
} from "@/lib/relatorios/googleOffline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dataHojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function GET(): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }

  const linhas = await coletarLinhasGoogleOffline();
  const csv = montarCsvGoogleOffline(linhas);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="google-offline-${dataHojeSaoPaulo()}.csv"`,
    },
  });
}
