// Rota PUBLICA da logo da empresa (identidade do app, nao e dado sensivel).
// Serve a imagem guardada em ConfiguracaoCRM com Content-Type correto, ETag
// baseado no *Em e cache curto. 404 quando nao ha logo configurada.
//
// tipo (query ?tipo=): "sistema" (padrao) = a logo usada em todo o app;
// "orcamento" (Fatia 3.17) = a logo dedicada ao PDF de orcamento (campos
// logoOrcamento*). Cada tipo tem seu proprio cache em memoria.
//
// CACHE EM MEMORIA (modulo): evita consultar o banco a cada load (e o 503
// intermitente). Serve da memoria por uma janela curta; reconsulta o banco
// quando o cache expira OU quando o ?v requerido difere da versao em cache
// (a troca de logo no admin usa ?v=*Em, entao a nova versao busca na hora).
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TipoLogo = "sistema" | "orcamento";

type LogoCache = {
  exp: number;
  existe: boolean;
  versao: string;
  etag: string;
  mime: string;
  corpo: Buffer | string;
};

// Estado de modulo por tipo (sobrevive entre requests no mesmo processo).
const cache: Partial<Record<TipoLogo, LogoCache>> = {};
const TTL_MS = 60_000;

async function carregarCache(tipo: TipoLogo): Promise<LogoCache> {
  const config = await prisma.configuracaoCRM.findFirst({
    select: {
      logoData: true,
      logoMime: true,
      logoEm: true,
      logoOrcamentoData: true,
      logoOrcamentoMime: true,
      logoOrcamentoEm: true,
    },
  });
  const data = tipo === "orcamento" ? config?.logoOrcamentoData : config?.logoData;
  const mime = tipo === "orcamento" ? config?.logoOrcamentoMime : config?.logoMime;
  const em = tipo === "orcamento" ? config?.logoOrcamentoEm : config?.logoEm;
  const versao = em?.getTime()?.toString(36) ?? "0";
  if (!data || !mime) {
    cache[tipo] = {
      exp: Date.now() + TTL_MS,
      existe: false,
      versao,
      etag: `"logo-none"`,
      mime: "",
      corpo: "",
    };
    return cache[tipo]!;
  }
  // data pode ser um data URL (raster base64) ou SVG cru (texto).
  let corpo: Buffer | string;
  if (data.startsWith("data:")) {
    corpo = Buffer.from(data.split(",")[1] ?? "", "base64");
  } else {
    corpo = data; // SVG sanitizado, servido como texto
  }
  cache[tipo] = {
    exp: Date.now() + TTL_MS,
    existe: true,
    versao,
    etag: `"logo-${tipo}-${versao}"`,
    mime,
    corpo,
  };
  return cache[tipo]!;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tipo: TipoLogo =
    req.nextUrl.searchParams.get("tipo") === "orcamento" ? "orcamento" : "sistema";
  const vReq = req.nextUrl.searchParams.get("v");
  const atualCache = cache[tipo];
  const valido =
    !!atualCache && atualCache.exp > Date.now() && (!vReq || vReq === atualCache.versao);
  const atual = valido ? atualCache! : await carregarCache(tipo);

  if (!atual.existe) {
    return new NextResponse(null, { status: 404 });
  }

  // ETag estavel pela versao (*Em); permite 304 entre trocas.
  if (req.headers.get("if-none-match") === atual.etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: atual.etag } });
  }

  return new NextResponse(atual.corpo as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": atual.mime,
      // Cache curto + revalidacao por ETag. Como o src usa ?v=*Em, a troca muda a
      // URL e o browser busca a nova versao imediatamente.
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      ETag: atual.etag,
    },
  });
}
