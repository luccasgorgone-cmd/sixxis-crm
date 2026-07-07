// Diagnostico (admin) de INGESTAO de mensagens (Fatia 3.20 B4). SO LEITURA — conta,
// nos ultimos N dias, sinais do problema de JIDs "@lid" (contatos nao salvos que
// chegam com numero mascarado): distribuicao de mensagens IN por SUFIXO de jid
// (extraido do payload bruto `raw`), leads sem telefone valido, leads/conversas
// com telefone de TAMANHO anomalo (o LID gera digitos fora do padrao BR 12-13) e
// mensagens tipo OUTRO. Serve para o dono dimensionar antes de decidir a correcao.
// GET /api/admin/diagnostico/ingestao?dias=7   (nao-admin -> 403)
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { TipoMsg, DirecaoMsg } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "nao autorizado" }, { status: 403 });
  }

  const diasParam = Number(req.nextUrl.searchParams.get("dias") ?? "7");
  const dias = Number.isFinite(diasParam)
    ? Math.min(90, Math.max(1, Math.floor(diasParam)))
    : 7;
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  // Telefone BR normalizado = 55 + DDD(2) + numero(8|9) = 12 ou 13 digitos. Fora
  // disso e "anomalo" (o LID do @lid costuma ter 15+ digitos, sem casar com o real).
  const TAM_MIN = 12;
  const TAM_MAX = 13;

  // 1) Distribuicao de mensagens IN por SUFIXO de jid (do raw). raw podado -> 'sem-raw'.
  const porSufixo = await prisma.$queryRaw<{ sufixo: string; total: number }[]>`
    SELECT
      CASE
        WHEN j IS NULL THEN 'sem-raw'
        WHEN j LIKE '%@s.whatsapp.net' THEN 's.whatsapp.net'
        WHEN j LIKE '%@lid' THEN 'lid'
        WHEN j LIKE '%@g.us' THEN 'g.us'
        WHEN j LIKE '%@broadcast' THEN 'broadcast'
        WHEN j LIKE '%@newsletter' THEN 'newsletter'
        WHEN position('@' in j) > 0 THEN split_part(j, '@', 2)
        ELSE 'sem-sufixo'
      END AS sufixo,
      COUNT(*)::int AS total
    FROM "Mensagem" m,
      LATERAL (SELECT m.raw #>> '{data,key,remoteJid}' AS j) s
    WHERE m.direcao = 'IN' AND m.hora >= ${desde}
    GROUP BY 1
    ORDER BY 2 DESC
  `;

  // 2) Leads: total, sem telefone valido e com telefone de tamanho anomalo.
  const [leads] = await prisma.$queryRaw<
    { total: number; sem_telefone: number; anomalo: number }[]
  >`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE telefone IS NULL OR telefone = '')::int AS sem_telefone,
      COUNT(*) FILTER (
        WHERE telefone IS NOT NULL AND telefone <> ''
          AND (char_length(telefone) < ${TAM_MIN} OR char_length(telefone) > ${TAM_MAX})
      )::int AS anomalo
    FROM "Lead"
  `;

  // 3) Conversas cujo lead tem telefone de tamanho anomalo (proxy de leads-@lid).
  const [conversas] = await prisma.$queryRaw<{ anomalo: number }[]>`
    SELECT COUNT(*)::int AS anomalo
    FROM "Conversa" c
    JOIN "Lead" l ON l.id = c."leadId"
    WHERE l.telefone IS NOT NULL AND l.telefone <> ''
      AND (char_length(l.telefone) < ${TAM_MIN} OR char_length(l.telefone) > ${TAM_MAX})
  `;

  // 4) Mensagens tipo OUTRO (nao mapeadas) e total IN no periodo.
  const [msgOutro, msgInTotal] = await Promise.all([
    prisma.mensagem.count({ where: { tipo: TipoMsg.OUTRO, hora: { gte: desde } } }),
    prisma.mensagem.count({ where: { direcao: DirecaoMsg.IN, hora: { gte: desde } } }),
  ]);

  return NextResponse.json({
    periodoDias: dias,
    desde,
    mensagensIn: {
      total: msgInTotal,
      // Foco: 'lid' (e demais nao-'s.whatsapp.net') indicam entrada mascarada.
      porSufixoJid: porSufixo,
      tipoOutro: msgOutro,
    },
    leads: {
      total: leads?.total ?? 0,
      semTelefone: leads?.sem_telefone ?? 0,
      telefoneAnomalo: leads?.anomalo ?? 0,
    },
    conversas: {
      telefoneAnomalo: conversas?.anomalo ?? 0,
    },
    criterio: {
      tamanhoTelefoneValido: `${TAM_MIN}-${TAM_MAX} digitos (55+DDD+numero)`,
      nota:
        "porSufixoJid vem do payload bruto (raw); mensagens com raw podado contam como 'sem-raw'. Detalhe por mensagem: filtre '[ingest-diag]' nos logs do Railway.",
    },
  });
}
