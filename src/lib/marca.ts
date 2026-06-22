// Identidade visual do app (marca). Centraliza a leitura no servidor (sem flash)
// e a validacao/sanitizacao da logo no envio.
import { prisma } from "@/lib/prisma";

export type Marca = {
  temLogo: boolean;
  // Versao p/ cache-busting do <img src="/api/logo?v=...">. 0 quando sem logo.
  logoEm: number;
  nomeEmpresa: string | null;
};

// Limite final aceito no servidor (defesa; o cliente ja otimiza antes).
export const LOGO_MAX_BYTES = 200 * 1024; // ~200KB (margem sobre a meta de 150KB)

const MIMES_RASTER = ["image/png", "image/jpeg", "image/webp"];

// Lida no layout raiz/area autenticada para prover a marca por props.
export async function obterMarca(): Promise<Marca> {
  try {
    const config = await prisma.configuracaoCRM.findFirst({
      select: { nomeEmpresa: true, logoData: true, logoEm: true },
    });
    return {
      temLogo: Boolean(config?.logoData),
      logoEm: config?.logoEm?.getTime() ?? 0,
      nomeEmpresa: config?.nomeEmpresa ?? null,
    };
  } catch {
    // Banco indisponivel (ex.: prerender sem DB): fallback para a marca Sixxis.
    return { temLogo: false, logoEm: 0, nomeEmpresa: null };
  }
}

// Remove vetores de XSS de um SVG: <script>, handlers on*, e URIs javascript:.
// Retorna o SVG sanitizado ou null se nao parecer um SVG valido.
export function sanitizarSvg(svg: string): string | null {
  if (!/<svg[\s>]/i.test(svg)) return null;
  let s = svg;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<\s*(?:foreignObject)[\s\S]*?<\/\s*foreignObject\s*>/gi, "");
  // Atributos de evento on*="..."
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // javascript: em href/xlink:href/src/style
  s = s.replace(/(href|src|xlink:href|style)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "");
  // <use href="javascript:..."> e afins ja cobertos acima.
  return s.trim();
}

export type LogoValidada = { data: string; mime: string };

// Valida o payload enviado pelo admin. Aceita data:image/{png,jpeg,webp} ou um
// SVG (sanitizado). Aplica limite de tamanho. Lanca Error com mensagem clara.
export function validarLogo(logoData: unknown, logoMime: unknown): LogoValidada {
  if (typeof logoData !== "string" || !logoData.trim()) {
    throw new Error("Imagem ausente.");
  }
  const mime = typeof logoMime === "string" ? logoMime.trim().toLowerCase() : "";

  // Caso SVG (mime image/svg+xml ou conteudo cru com <svg>).
  if (mime === "image/svg+xml" || /^\s*<\??(?:xml|svg)/i.test(logoData)) {
    const cru = logoData.startsWith("data:")
      ? decodeURIComponent(logoData.replace(/^data:[^,]*,/, ""))
      : logoData;
    const limpo = sanitizarSvg(cru);
    if (!limpo) throw new Error("SVG invalido.");
    if (Buffer.byteLength(limpo, "utf8") > LOGO_MAX_BYTES) {
      throw new Error("Logo muito grande (limite ~150KB).");
    }
    return { data: limpo, mime: "image/svg+xml" };
  }

  // Caso raster: precisa ser data URL de imagem permitida.
  const m = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/.exec(logoData);
  if (!m) throw new Error("Formato de imagem nao suportado.");
  const tipo = m[1].toLowerCase();
  if (!MIMES_RASTER.includes(tipo)) {
    throw new Error("Use PNG, JPG ou WEBP.");
  }
  const bytes = Buffer.byteLength(m[2], "base64");
  if (bytes > LOGO_MAX_BYTES) {
    throw new Error("Logo muito grande (limite ~150KB).");
  }
  return { data: logoData, mime: tipo };
}
