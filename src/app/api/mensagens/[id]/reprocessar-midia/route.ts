// Reprocessa a midia de uma mensagem cujo mediaUrl ficou vazio (download/upload
// falhou na ingestao). Apenas ADMIN. Re-executa download na Evolution + upload
// no R2 e grava o mediaUrl exibivel, emitindo "mensagem:midia" ao vivo.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { persistirMidia } from "@/lib/midia";
import { TipoMsg } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ehMidia(tipo: TipoMsg): boolean {
  return (
    tipo === TipoMsg.IMAGEM ||
    tipo === TipoMsg.VIDEO ||
    tipo === TipoMsg.AUDIO ||
    tipo === TipoMsg.DOCUMENTO
  );
}

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const msg = await prisma.mensagem.findUnique({
    where: { id },
    select: {
      id: true,
      externalId: true,
      tipo: true,
      mediaUrl: true,
      raw: true,
      conversa: {
        select: {
          id: true,
          instancia: true,
          instanciaRef: { select: { instanciaEvolution: true } },
          lead: { select: { telefone: true } },
        },
      },
    },
  });
  if (!msg) {
    return NextResponse.json({ erro: "nao encontrada" }, { status: 404 });
  }
  if (!ehMidia(msg.tipo)) {
    return NextResponse.json(
      { erro: "esta mensagem nao e de midia" },
      { status: 422 },
    );
  }
  if (msg.mediaUrl) {
    return NextResponse.json({ ok: true, mediaUrl: msg.mediaUrl, jaTinha: true });
  }

  // O `data` que a Evolution espera (com key + message) esta dentro do raw
  // (payload do webhook). Pode ter sido podado (NULL) pela retencao.
  const raw = msg.raw as { data?: unknown } | null;
  const data = (raw?.data ?? null) as { key?: unknown; message?: unknown } | null;
  if (!data) {
    return NextResponse.json(
      { erro: "payload original indisponivel (mensagem antiga / podada)" },
      { status: 422 },
    );
  }

  const instancia =
    msg.conversa.instanciaRef?.instanciaEvolution ?? msg.conversa.instancia;
  const telefone = msg.conversa.lead.telefone.replace(/\D/g, "");

  // Reprocesso manual: tenta imediatamente e, se falhar, mais uma vez apos 3s.
  const resultado = await persistirMidia({
    mensagemId: msg.id,
    conversaId: msg.conversa.id,
    externalId: msg.externalId,
    telefone,
    instancia,
    data,
    atrasos: [0, 3000],
  });

  if (!resultado.ok) {
    const motivos: Record<string, string> = {
      r2: "armazenamento (R2) nao configurado",
      download: "nao foi possivel baixar a midia na Evolution",
      upload: "falha ao subir a midia no armazenamento",
    };
    return NextResponse.json(
      { erro: motivos[resultado.motivo] ?? "falha ao reprocessar a midia" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, mediaUrl: resultado.url });
}
