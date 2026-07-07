// Geracao do PDF do ORCAMENTO (Fatia 3.13 -> redesenhado na 3.15). pdf-lib (puro
// JS, sem Chromium) roda no runtime nodejs do Railway. Layout A4 pensado para
// LEITURA NO CELULAR: uma coluna, fontes >=10pt, respiro generoso, hierarquia
// clara e cores da marca com sobriedade. Sem emoji. Funcao pura: recebe os dados
// ja montados (+ a logo opcional em bytes) e devolve os bytes do PDF (Uint8Array).
// A montagem dos dados e a leitura da logo (Prisma) ficam em orcamentoDados.ts.
import crypto from "node:crypto";
import sharp from "sharp";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import { labelMetodo, ehParcelavel, type LinhaPagamento } from "@/lib/pagamento";

// Cores da marca + superficies.
const TIFFANY = rgb(0.235, 0.749, 0.702); // #3cbfb3
const ESCURO = rgb(0.059, 0.18, 0.169); // #0f2e2b
const CINZA = rgb(0.42, 0.42, 0.42);
const CINZA_CLARO = rgb(0.62, 0.62, 0.62);
const LINHA = rgb(0.85, 0.85, 0.85);
const VERDE = rgb(0.16, 0.55, 0.32);
const BRANCO = rgb(1, 1, 1);
const TIFFANY_SUAVE = rgb(0.886, 0.963, 0.955); // fundo do cabecalho da tabela
const ZEBRA = rgb(0.969, 0.975, 0.974); // linha zebrada leve
const CARD = rgb(0.963, 0.971, 0.97); // preenchimento do card do cliente

// Dados da marca (cabecalho/rodape).
const MARCA = {
  nome: "Sixxis",
  endereco: "R. Anhanguera, 1711 - Icaray, Araçatuba/SP",
  email: "sac@sixxis.com.br",
  site: "www.sixxis.com.br",
};

export type ItemPdfOrcamento = {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  garantia: boolean;
};

export type DadosPdfOrcamento = {
  numeroFormatado: string; // "PED-000123"
  dataFormatada: string; // "06/07/2026"
  cliente: {
    nome: string;
    telefone: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    cidade?: string | null;
    uf?: string | null;
  };
  itens: ItemPdfOrcamento[];
  subtotal: number; // soma dos cobraveis (sem garantia)
  cupom: string | null;
  descontoPct: number | null;
  descontoValor: number;
  frete: number | null;
  fretePagoPelaEmpresa: boolean;
  totalFinal: number;
  totalGarantia: number;
  // Formas de pagamento (Fatia 3.18): rascunho (preview) ou snapshot (decidido).
  // Vazio -> o bloco e omitido no PDF.
  pagamentos: LinhaPagamento[];
};

// Logo embutivel. pdf-lib so aceita PNG/JPEG nativamente; WEBP e convertido para
// PNG em memoria (sharp) antes de embutir (Fatia 3.16). SVG segue sem suporte ->
// wordmark textual. Os bytes vem do ConfiguracaoCRM (orcamentoDados).
export type LogoEmbed = { bytes: Uint8Array; formato: "png" | "jpg" | "webp" };

// Cache (modulo) da conversao webp -> PNG: a logo muda raramente, entao evitamos
// reconverter a cada PDF. Chave = hash sha1 dos bytes webp.
const cachePngLogo = new Map<string, Uint8Array>();

async function webpParaPng(bytes: Uint8Array): Promise<Uint8Array> {
  const chave = crypto.createHash("sha1").update(bytes).digest("hex");
  const emCache = cachePngLogo.get(chave);
  if (emCache) return emCache;
  const png = await sharp(Buffer.from(bytes)).png().toBuffer();
  const out = new Uint8Array(png);
  cachePngLogo.set(chave, out);
  return out;
}

// A fonte Helvetica usa encoding WinAnsi (CP1252) e LANCA em caracteres fora dele
// (emoji, CJK, control chars). Texto dinamico (nome do cliente, descricao) pode
// conter qualquer coisa — sanitizamos: mantemos letras acentuadas Latin-1 e
// removemos o resto (control chars 0x80-0x9F e code points > 0xFF).
function sanitizar(texto: string): string {
  let out = "";
  for (const ch of texto.normalize("NFC")) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 9 || cp === 10 || cp === 32) {
      out += " ";
    } else if (cp >= 32 && cp <= 0x7e) {
      out += ch;
    } else if (cp >= 0xa0 && cp <= 0xff) {
      out += ch;
    }
    // demais (control chars e fora do Latin-1) sao descartados.
  }
  return out.replace(/\s+/g, " ").trim();
}

// "R$ 1.234,56" sem depender de Intl (robusto em qualquer runtime).
function brl(valor: number): string {
  const n = Math.round((valor + Number.EPSILON) * 100) / 100;
  const [inteiro, dec] = n.toFixed(2).split(".");
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${agrupado},${dec}`;
}

// Quebra `texto` em linhas que cabem em `larguraMax` (pt), respeitando palavras.
function quebrarTexto(
  texto: string,
  font: PDFFont,
  tamanho: number,
  larguraMax: number,
): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (font.widthOfTextAtSize(tentativa, tamanho) <= larguraMax || !atual) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas.length ? linhas : [""];
}

export async function gerarPdfOrcamento(
  dados: DadosPdfOrcamento,
  logo?: LogoEmbed | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Orçamento ${dados.numeroFormatado}`);
  doc.setProducer("Sixxis CRM");
  doc.setCreator("Sixxis CRM");

  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const fonteBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Logo. PNG/JPEG embutem direto; WEBP e convertido para PNG (sharp, cacheado).
  // Qualquer falha real de conversao/embed -> wordmark textual "Sixxis".
  let logoImg: PDFImage | null = null;
  if (logo) {
    try {
      if (logo.formato === "jpg") {
        logoImg = await doc.embedJpg(logo.bytes);
      } else if (logo.formato === "png") {
        logoImg = await doc.embedPng(logo.bytes);
      } else {
        logoImg = await doc.embedPng(await webpParaPng(logo.bytes));
      }
    } catch {
      logoImg = null;
    }
  }

  const LARGURA = 595.28;
  const ALTURA = 841.89;
  const MARGEM = 46;
  const xEsq = MARGEM;
  const xDir = LARGURA - MARGEM;
  const larguraUtil = xDir - xEsq;
  // Reserva na base para o rodape/paginacao (quebra de pagina respeita isto).
  const RESERVA_BASE = MARGEM + 72;

  let page = doc.addPage([LARGURA, ALTURA]);
  let y = ALTURA - MARGEM;

  const textoDir = (
    p: PDFPage,
    texto: string,
    xRight: number,
    yPos: number,
    tamanho: number,
    font: PDFFont,
    color = ESCURO,
  ) => {
    const w = font.widthOfTextAtSize(texto, tamanho);
    p.drawText(texto, { x: xRight - w, y: yPos, size: tamanho, font, color });
  };

  const linhaFina = (yPos: number, cor = LINHA) => {
    page.drawLine({
      start: { x: xEsq, y: yPos },
      end: { x: xDir, y: yPos },
      thickness: 0.7,
      color: cor,
    });
  };

  // ---- CABECALHO: logo (ou wordmark) + numero/data + faixa tiffany ----
  const logoH = 42;
  if (logoImg) {
    const escala = logoH / logoImg.height;
    let w = logoImg.width * escala;
    let h = logoH;
    const maxW = 220;
    if (w > maxW) {
      const k = maxW / w;
      w = maxW;
      h = logoH * k;
    }
    page.drawImage(logoImg, { x: xEsq, y: y - h, width: w, height: h });
  } else {
    // Wordmark textual (fallback quando a logo nao e PNG/JPEG embutivel).
    page.drawText(MARCA.nome, { x: xEsq, y: y - 30, size: 30, font: fonteBold, color: TIFFANY });
  }
  textoDir(page, "ORÇAMENTO", xDir, y - 8, 8, fonteBold, TIFFANY);
  textoDir(page, dados.numeroFormatado, xDir, y - 24, 15, fonteBold, ESCURO);
  textoDir(page, `Emitido em ${dados.dataFormatada}`, xDir, y - 38, 9, fonte, CINZA);
  y -= 52;

  page.drawText(MARCA.endereco, { x: xEsq, y, size: 9, font: fonte, color: CINZA });
  y -= 12;
  page.drawText(`${MARCA.email}   ${MARCA.site}`, { x: xEsq, y, size: 9, font: fonte, color: CINZA });
  y -= 12;
  y -= 6;
  page.drawRectangle({ x: xEsq, y, width: larguraUtil, height: 3, color: TIFFANY });
  y -= 26;

  // ---- TITULO ----
  page.drawText("Orçamento", { x: xEsq, y: y - 4, size: 24, font: fonteBold, color: ESCURO });
  y -= 28;

  // ---- CARD DO CLIENTE ----
  page.drawText("CLIENTE", { x: xEsq, y, size: 8.5, font: fonteBold, color: TIFFANY });
  y -= 14;
  const partesInfo: string[] = [];
  if (dados.cliente.telefone) partesInfo.push(dados.cliente.telefone);
  const docTxt = dados.cliente.cnpj
    ? `CNPJ ${dados.cliente.cnpj}`
    : dados.cliente.cpf
      ? `CPF ${dados.cliente.cpf}`
      : null;
  if (docTxt) partesInfo.push(docTxt);
  const local =
    dados.cliente.cidade && dados.cliente.uf
      ? `${dados.cliente.cidade}/${dados.cliente.uf}`
      : dados.cliente.cidade || dados.cliente.uf || null;
  if (local) partesInfo.push(local);
  const nomeCliente = sanitizar(dados.cliente.nome) || "Cliente";
  const infoLinha = sanitizar(partesInfo.join("     "));
  const temInfo = infoLinha.length > 0;
  const padY = 11;
  const cardH = padY * 2 + 13 + (temInfo ? 15 : 0);
  const cardTop = y;
  const cardBottom = cardTop - cardH;
  page.drawRectangle({
    x: xEsq,
    y: cardBottom,
    width: larguraUtil,
    height: cardH,
    color: CARD,
    borderColor: LINHA,
    borderWidth: 0.7,
  });
  let yc = cardTop - padY - 11;
  page.drawText(nomeCliente, { x: xEsq + 14, y: yc, size: 13, font: fonteBold, color: ESCURO });
  if (temInfo) {
    yc -= 15;
    page.drawText(infoLinha, { x: xEsq + 14, y: yc, size: 9.5, font: fonte, color: CINZA });
  }
  y = cardBottom - 26;

  // ---- TABELA DE ITENS ----
  const colSubR = xDir; // Subtotal (direita)
  const colUnitR = xDir - 92; // Valor unit. (direita)
  const colQtdR = xDir - 178; // Qtd (direita)
  const descL = xEsq + 12; // Descricao (esquerda, com padding)
  const descMaxW = colQtdR - 34 - descL;

  const cabecalhoTabela = () => {
    const hH = 22;
    page.drawRectangle({ x: xEsq, y: y - hH, width: larguraUtil, height: hH, color: TIFFANY_SUAVE });
    const base = y - hH + 7;
    page.drawText("Descrição", { x: descL, y: base, size: 9, font: fonteBold, color: ESCURO });
    textoDir(page, "Qtd", colQtdR, base, 9, fonteBold, ESCURO);
    textoDir(page, "Valor unit.", colUnitR, base, 9, fonteBold, ESCURO);
    textoDir(page, "Subtotal", colSubR, base, 9, fonteBold, ESCURO);
    y -= hH + 2;
  };

  page.drawText("ITENS", { x: xEsq, y, size: 8.5, font: fonteBold, color: TIFFANY });
  y -= 16;
  cabecalhoTabela();

  const topPad = 12;
  const lineStep = 13;
  const bottomPad = 8;
  dados.itens.forEach((it, i) => {
    const linhasDesc = quebrarTexto(sanitizar(it.descricao) || "Item", fonte, 10, descMaxW);
    const rowH = topPad + (linhasDesc.length - 1) * lineStep + (it.garantia ? 12 : 0) + bottomPad;

    // Quebra de pagina: preserva a reserva do rodape e redesenha o cabecalho.
    if (y - rowH < RESERVA_BASE) {
      page = doc.addPage([LARGURA, ALTURA]);
      y = ALTURA - MARGEM;
      cabecalhoTabela();
    }

    if (i % 2 === 1) {
      page.drawRectangle({ x: xEsq, y: y - rowH, width: larguraUtil, height: rowH, color: ZEBRA });
    }

    const b1 = y - topPad;
    let yl = b1;
    for (const ln of linhasDesc) {
      page.drawText(ln, { x: descL, y: yl, size: 10, font: fonte, color: ESCURO });
      yl -= lineStep;
    }
    textoDir(page, String(it.quantidade), colQtdR, b1, 10, fonte, ESCURO);

    if (it.garantia) {
      textoDir(page, brl(it.valorUnitario), colUnitR, b1, 10, fonte, CINZA_CLARO);
      const sub = brl(it.quantidade * it.valorUnitario);
      const wSub = fonte.widthOfTextAtSize(sub, 10);
      page.drawText(sub, { x: colSubR - wSub, y: b1, size: 10, font: fonte, color: CINZA_CLARO });
      // Risco sobre o subtotal (cortesia).
      page.drawLine({
        start: { x: colSubR - wSub, y: b1 + 3 },
        end: { x: colSubR, y: b1 + 3 },
        thickness: 0.7,
        color: CINZA_CLARO,
      });
      page.drawText("Garantia - sem custo", {
        x: descL,
        y: yl + lineStep - 12,
        size: 8.5,
        font: fonteBold,
        color: TIFFANY,
      });
    } else {
      textoDir(page, brl(it.valorUnitario), colUnitR, b1, 10, fonte, ESCURO);
      textoDir(page, brl(it.quantidade * it.valorUnitario), colSubR, b1, 10, fonteBold, ESCURO);
    }
    y -= rowH;
  });

  linhaFina(y);
  y -= 20;

  // ---- BLOCO DE TOTAIS (direita) ----
  if (y - 130 < RESERVA_BASE) {
    page = doc.addPage([LARGURA, ALTURA]);
    y = ALTURA - MARGEM;
  }
  const totLabelX = xDir - 250;
  const linhaTot = (
    label: string,
    valor: string,
    valorCor = ESCURO,
    labelCor = CINZA,
  ) => {
    page.drawText(label, { x: totLabelX, y, size: 10, font: fonte, color: labelCor });
    textoDir(page, valor, xDir, y, 10, fonte, valorCor);
    y -= 17;
  };

  linhaTot("Subtotal", brl(dados.subtotal));
  if (dados.descontoValor > 0) {
    const cupomSan = dados.cupom ? sanitizar(dados.cupom) : "";
    const rot = cupomSan
      ? `Desconto  Cupom ${cupomSan}${dados.descontoPct ? ` - ${dados.descontoPct}%` : ""}`
      : `Desconto${dados.descontoPct ? ` (${dados.descontoPct}%)` : ""}`;
    linhaTot(rot, `- ${brl(dados.descontoValor)}`, VERDE, VERDE);
  }
  if (dados.fretePagoPelaEmpresa) {
    linhaTot("Frete", "Cortesia Sixxis", TIFFANY, CINZA);
  } else {
    linhaTot("Frete", dados.frete && dados.frete > 0 ? brl(dados.frete) : "Grátis");
  }

  // Caixa TIFFANY do TOTAL.
  y -= 4;
  const boxH = 34;
  const boxX = totLabelX - 6;
  const boxY = y - boxH;
  page.drawRectangle({ x: boxX, y: boxY, width: xDir - boxX, height: boxH, color: TIFFANY });
  const baseBox = boxY + (boxH - 15) / 2 + 3;
  page.drawText("TOTAL", { x: totLabelX + 4, y: baseBox, size: 13, font: fonteBold, color: BRANCO });
  textoDir(page, brl(dados.totalFinal), xDir - 8, baseBox, 16, fonteBold, BRANCO);
  y = boxY - 18;

  if (dados.totalGarantia > 0) {
    page.drawText(`Itens em garantia - cortesia (não cobrado): ${brl(dados.totalGarantia)}`, {
      x: totLabelX,
      y,
      size: 8.5,
      font: fonte,
      color: CINZA_CLARO,
    });
    y -= 14;
  }

  // ---- FORMA(S) DE PAGAMENTO (Fatia 3.18) — omitido com elegancia se vazio ----
  if (dados.pagamentos.length > 0) {
    // Espaco do bloco: titulo + linhas. Quebra de pagina se nao couber.
    const alturaBloco = 20 + dados.pagamentos.length * 14 + 8;
    if (y - alturaBloco < RESERVA_BASE) {
      page = doc.addPage([LARGURA, ALTURA]);
      y = ALTURA - MARGEM;
    }
    y -= 10;
    page.drawText("FORMA DE PAGAMENTO", { x: xEsq, y, size: 8.5, font: fonteBold, color: TIFFANY });
    y -= 16;
    for (const p of dados.pagamentos) {
      const label = labelMetodo(p.metodo);
      const parcelas = Math.max(1, Math.floor(p.parcelas || 1));
      const texto =
        ehParcelavel(p.metodo) && parcelas > 1
          ? `${label} - ${parcelas}x de ${brl(p.valor / parcelas)} (total ${brl(p.valor)})`
          : `${label} - ${brl(p.valor)}`;
      page.drawText(sanitizar(texto), { x: xEsq + 12, y, size: 10, font: fonte, color: ESCURO });
      y -= 14;
    }
    y -= 4;
  }

  // ---- RODAPE (na base da ultima pagina) ----
  const yF = MARGEM + 28;
  linhaFina(yF + 16);
  page.drawText("Orçamento válido por 7 dias   Dúvidas? Chame no WhatsApp", {
    x: xEsq,
    y: yF,
    size: 9,
    font: fonteBold,
    color: ESCURO,
  });
  textoDir(page, MARCA.site, xDir, yF, 9.5, fonteBold, TIFFANY);

  // ---- Numeracao de pagina (so quando passa de 1) ----
  const pages = doc.getPages();
  if (pages.length > 1) {
    pages.forEach((p, i) => {
      const t = `Página ${i + 1} de ${pages.length}`;
      const w = fonte.widthOfTextAtSize(t, 8);
      p.drawText(t, { x: (LARGURA - w) / 2, y: 24, size: 8, font: fonte, color: CINZA_CLARO });
    });
  }

  return doc.save();
}
