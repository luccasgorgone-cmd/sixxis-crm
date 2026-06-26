// Rota PUBLICA da logo da empresa (identidade do app, nao e dado sensivel).
// Serve a imagem guardada em ConfiguracaoCRM com Content-Type correto, ETag
// baseado em logoEm e cache curto. 404 quando nao ha logo configurada.
//
// CACHE EM MEMORIA (modulo): evita consultar o banco a cada load (e o 503
// intermitente). Serve da memoria por uma janela curta; reconsulta o banco
// quando o cache expira OU quando o ?v requerido difere da versao em cache
// (a troca de logo no admin usa ?v=logoEm, entao a nova versao busca na hora).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LogoCache = {
  exp: number;
  existe: boolean;
  versao: string;
  etag: string;
  mime: string;
  corpo: Buffer | string;
};

// Estado de modulo (sobrevive entre requests no mesmo processo).
let cache: LogoCache | null = null;
const TTL_MS = 60_000;

async function carregarCache(): Promise<LogoCache> {
  const config = await prisma.configuracaoCRM.findFirst({
    select: { logoData: true, logoMime: true, logoEm: true },
  });
  const versao = config?.logoEm?.getTime()?.toString(36) ?? "0";
  if (!config?.logoData || !config.logoMime) {
    cache = {
      exp: Date.now() + TTL_MS,
      existe: false,
      versao,
      etag: `"logo-none"`,
      mime: "",
      corpo: "",
    };
    return cache;
  }
  // logoData pode ser um data URL (raster base64) ou SVG cru (texto).
  let corpo: Buffer | string;
  if (config.logoData.startsWith("data:")) {
    corpo = Buffer.from(config.logoData.split(",")[1] ?? "", "base64");
  } else {
    corpo = config.logoData; // SVG sanitizado, servido como texto
  }
  cache = {
    exp: Date.now() + TTL_MS,
    existe: true,
    versao,
    etag: `"logo-${versao}"`,
    mime: config.logoMime,
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

  // ETag estavel pela versao (logoEm); permite 304 entre trocas.
  if (req.headers.get("if-none-match") === atual.etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: atual.etag } });
  }

  return new NextResponse(atual.corpo as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": atual.mime,
      // Cache curto + revalidacao por ETag. Como o src usa ?v=logoEm, a troca
      // muda a URL e o browser busca a nova versao imediatamente.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      ETag: atual.etag,
    },
  });
}
