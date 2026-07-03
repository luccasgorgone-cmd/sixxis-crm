// Rota PUBLICA do favicon do CRM (identidade do app, nao e dado sensivel).
// Serve o PNG guardado em ConfiguracaoCRM.faviconData com Content-Type correto e
// ETag baseado em faviconEm. 404 quando nao ha favicon configurado (o layout cai
// no favicon derivado da logo ou no padrao). Espelha /api/logo.
//
// CACHE EM MEMORIA (modulo): evita bater no banco a cada load. Reconsulta quando
// o cache expira OU quando o ?v requerido difere da versao em cache (a troca no
// admin usa ?v=faviconEm, entao a nova versao busca na hora).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FaviconCache = {
  exp: number;
  existe: boolean;
  versao: string;
  etag: string;
  mime: string;
  corpo: Buffer;
};

let cache: FaviconCache | null = null;
const TTL_MS = 60_000;

async function carregarCache(): Promise<FaviconCache> {
  const config = await prisma.configuracaoCRM.findFirst({
    select: { faviconData: true, faviconMime: true, faviconEm: true },
  });
  const versao = config?.faviconEm?.getTime()?.toString(36) ?? "0";
  if (!config?.faviconData || !config.faviconMime) {
    cache = {
      exp: Date.now() + TTL_MS,
      existe: false,
      versao,
      etag: `"favicon-none"`,
      mime: "",
      corpo: Buffer.alloc(0),
    };
    return cache;
  }
  // faviconData e sempre um data URL PNG (base64) — ver validarFavicon.
  const corpo = Buffer.from(config.faviconData.split(",")[1] ?? "", "base64");
  cache = {
    exp: Date.now() + TTL_MS,
    existe: true,
    versao,
    etag: `"favicon-${versao}"`,
    mime: config.faviconMime,
    corpo,
  };
  return cache;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const vReq = req.nextUrl.searchParams.get("v");
  const valido =
    cache !== null && cache.exp > Date.now() && (!vReq || vReq === cache.versao);
  const atual = valido ? cache! : await carregarCache();

  if (!atual.existe) {
    return new NextResponse(null, { status: 404 });
  }

  if (req.headers.get("if-none-match") === atual.etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: atual.etag } });
  }

  return new NextResponse(atual.corpo as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": atual.mime,
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      ETag: atual.etag,
    },
  });
}
