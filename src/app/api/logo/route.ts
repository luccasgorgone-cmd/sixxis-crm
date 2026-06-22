// Rota PUBLICA da logo da empresa (identidade do app, nao e dado sensivel).
// Serve a imagem guardada em ConfiguracaoCRM com Content-Type correto, ETag
// baseado em logoEm e cache curto. 404 quando nao ha logo configurada.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const config = await prisma.configuracaoCRM.findFirst({
    select: { logoData: true, logoMime: true, logoEm: true },
  });

  if (!config?.logoData || !config.logoMime) {
    return new NextResponse(null, { status: 404 });
  }

  // ETag estavel pela versao (logoEm); permite 304 entre trocas.
  const versao = config.logoEm?.getTime()?.toString(36) ?? "0";
  const etag = `"logo-${versao}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  // logoData pode ser um data URL (raster base64) ou SVG cru (texto).
  let corpo: Buffer | string;
  if (config.logoData.startsWith("data:")) {
    const base64 = config.logoData.split(",")[1] ?? "";
    corpo = Buffer.from(base64, "base64");
  } else {
    corpo = config.logoData; // SVG sanitizado, servido como texto
  }

  return new NextResponse(corpo as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": config.logoMime,
      // Cache curto + revalidacao por ETag. Como o src usa ?v=logoEm, a troca
      // muda a URL e o browser busca a nova versao imediatamente.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      ETag: etag,
    },
  });
}
