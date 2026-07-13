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
  cnpj: "54.978.947/0001-09",
  endereco: "R. Anhanguera, 1711 - Icaray, Araçatuba/SP",
  email: "sac@sixxis.com.br",
  site: "www.sixxis.com.br",
};

// Validade do orcamento em dias (regra do dono: 3 dias).
const VALIDADE_DIAS = 3;

// Escala de espacamento vertical (pt), unica e explicita. Respiro ENTRE blocos
// (secoes: cabecalho -> cliente -> itens -> totais...) e MAIOR que o respiro
// DENTRO de um bloco. Sem numeros magicos soltos para os saltos de secao.
const GAP_BLOCO = 24;
const GAP_INTERNO = 12;

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
    // Fatia N: dados completos do cliente (todos OPCIONAIS — campo ausente NAO
    // vira linha vazia no PDF, a linha simplesmente nao e desenhada).
    email?: string | null;
    empresa?: string | null;
    cpf?: string | null;
    cnpj?: string | null;
    cep?: string | null;
    logradouro?: string | null;
    numero?: string | null;
    complemento?: string | null;
    bairro?: string | null;
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
  // Transportadora da cotacao (Fase 2): exibida junto do frete quando houver.
  transportadora?: string | null;
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

// Trunca `texto` com reticencias para caber em `larguraMax` (pt). Usado em campos
// de UMA linha (nome do cliente) para nao estourar o layout (Bloco 2 robustez).
function truncar(
  texto: string,
  font: PDFFont,
  tamanho: number,
  larguraMax: number,
): string {
  if (font.widthOfTextAtSize(texto, tamanho) <= larguraMax) return texto;
  const retic = "…";
  let corte = texto;
  while (corte.length > 1 && font.widthOfTextAtSize(corte + retic, tamanho) > larguraMax) {
    corte = corte.slice(0, -1);
  }
  return corte.trimEnd() + retic;
}

// "dd/mm/aaaa" + N dias -> "dd/mm/aaaa". Retorna null se o formato nao casar
// (o PDF entao omite a data-limite sem quebrar).
function somarDiasFormatado(dataFormatada: string, dias: number): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dataFormatada.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const base = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(base.getDate())}/${p(base.getMonth() + 1)}/${base.getFullYear()}`;
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
  // Codigo anonimo do atendente (Fatia J): impresso discreto no rodape, permite
  // rastrear quem emitiu sem expor nome. Ausente -> linha omitida.
  codigoAtendente?: string | null,
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

  // ---- CABECALHO: logo/wordmark + bloco da marca (esq) | ORCAMENTO/PED (dir) ----
  const topo = y;
  const logoH = 40;
  if (logoImg) {
    const escala = logoH / logoImg.height;
    let w = logoImg.width * escala;
    let h = logoH;
    const maxW = 200;
    if (w > maxW) {
      const k = maxW / w;
      w = maxW;
      h = logoH * k;
    }
    page.drawImage(logoImg, { x: xEsq, y: topo - h, width: w, height: h });
  } else {
    // Wordmark textual (fallback quando a logo nao e PNG/JPEG embutivel).
    page.drawText(MARCA.nome, { x: xEsq, y: topo - 30, size: 30, font: fonteBold, color: TIFFANY });
  }

  // Validade (Fatia N): linha DISCRETA no cabecalho, nunca um bloco.
  const limite = somarDiasFormatado(dados.dataFormatada, VALIDADE_DIAS);

  // Bloco de identificacao do documento (direita): rotulo, PED em destaque,
  // emissao e validade (uma linha só).
  textoDir(page, "ORÇAMENTO", xDir, topo - 8, 8.5, fonteBold, TIFFANY);
  textoDir(page, dados.numeroFormatado, xDir, topo - 26, 18, fonteBold, ESCURO);
  textoDir(page, `Emissão  ${dados.dataFormatada}`, xDir, topo - 40, 9, fonte, CINZA);
  if (limite) {
    // "Válida até {data} (3 dias)" — cinza, com a DATA em tiffany. Alinhado a
    // direita por segmentos (uma cor por drawText).
    const s1 = "Válida até ";
    const s3 = ` (${VALIDADE_DIAS} dias)`;
    const w1 = fonte.widthOfTextAtSize(s1, 9);
    const w2 = fonte.widthOfTextAtSize(limite, 9);
    const w3 = fonte.widthOfTextAtSize(s3, 9);
    const x0 = xDir - (w1 + w2 + w3);
    const yv = topo - 53;
    page.drawText(s1, { x: x0, y: yv, size: 9, font: fonte, color: CINZA });
    page.drawText(limite, { x: x0 + w1, y: yv, size: 9, font: fonte, color: TIFFANY });
    page.drawText(s3, { x: x0 + w1 + w2, y: yv, size: 9, font: fonte, color: CINZA });
  } else {
    // Data inesperada: so a regra, sem quebrar o layout.
    textoDir(page, `Válida por ${VALIDADE_DIAS} dias`, xDir, topo - 53, 9, fonte, CINZA);
  }

  // Bloco da marca (esquerda), abaixo da logo: nome + CNPJ, endereco, contato.
  let yb = topo - logoH - 12;
  page.drawText(`${MARCA.nome}  ·  CNPJ ${MARCA.cnpj}`, {
    x: xEsq, y: yb, size: 9, font: fonteBold, color: ESCURO,
  });
  yb -= 12;
  page.drawText(MARCA.endereco, { x: xEsq, y: yb, size: 8.5, font: fonte, color: CINZA });
  yb -= 11;
  page.drawText(`${MARCA.email}   ·   ${MARCA.site}`, {
    x: xEsq, y: yb, size: 8.5, font: fonte, color: CINZA,
  });

  // Regua tiffany fecha o cabecalho.
  y = yb - GAP_INTERNO;
  page.drawRectangle({ x: xEsq, y, width: larguraUtil, height: 3, color: TIFFANY });
  y -= GAP_BLOCO;

  // ---- CARD DO CLIENTE (grade 2 colunas, ALTURA DINAMICA) ----
  page.drawText("CLIENTE", { x: xEsq, y, size: 8.5, font: fonteBold, color: TIFFANY });
  y -= 14;

  const cli = dados.cliente;
  const docTxt = cli.cnpj ?? cli.cpf ?? null;
  const docRot = cli.cnpj ? "CNPJ" : "CPF";
  const ruaParts = [cli.logradouro, cli.numero ? `nº ${cli.numero}` : null]
    .filter(Boolean)
    .join(", ");
  const rua = ruaParts
    ? cli.complemento
      ? `${ruaParts} — ${cli.complemento}`
      : ruaParts
    : cli.complemento ?? null;
  const cidadeUf =
    cli.cidade && cli.uf ? `${cli.cidade}/${cli.uf}` : cli.cidade || cli.uf || null;

  type CampoCard = { rot: string; val: string; wrap?: boolean };
  const colEsq: CampoCard[] = [];
  if (cli.empresa) colEsq.push({ rot: "EMPRESA", val: cli.empresa });
  if (docTxt) colEsq.push({ rot: docRot, val: docTxt });
  if (cli.telefone) colEsq.push({ rot: "TELEFONE", val: cli.telefone });
  if (cli.email) colEsq.push({ rot: "E-MAIL", val: cli.email });
  const colDir: CampoCard[] = [];
  if (rua) colDir.push({ rot: "ENDEREÇO", val: rua, wrap: true });
  if (cli.bairro) colDir.push({ rot: "BAIRRO", val: cli.bairro });
  if (cidadeUf) colDir.push({ rot: "CIDADE/UF", val: cidadeUf });
  if (cli.cep) colDir.push({ rot: "CEP", val: cli.cep });

  // Geometria do card. Escala explicita: padding, calha e larguras das colunas.
  const cardPadX = 14;
  const cardPadTop = 12;
  const cardPadBot = 12;
  const calha = 22;
  const colW = (larguraUtil - cardPadX * 2 - calha) / 2;
  const nomeBloco = 13 + 9; // linha do nome + respiro ate o corpo

  // Nº de linhas do valor (1, ou ate 2 quando wrap). Cada valor mede/quebra pela
  // largura DA SUA COLUNA — nunca pela pagina.
  const nLinhas = (c: CampoCard): number =>
    c.wrap ? Math.min(2, quebrarTexto(sanitizar(c.val), fonte, 9.5, colW).length || 1) : 1;
  const alturaCampo = (c: CampoCard): number => 11 + 12 * nLinhas(c) + 4;
  const alturaColuna = (campos: CampoCard[]): number =>
    campos.reduce((h, c) => h + alturaCampo(c), 0);
  const corpoH = Math.max(alturaColuna(colEsq), alturaColuna(colDir));

  const cardTop = y;
  const cardH = cardPadTop + nomeBloco + corpoH + cardPadBot;
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

  // Nome do cliente (destaque), truncado pela largura interna do card.
  page.drawText(truncar(sanitizar(cli.nome) || "Cliente", fonteBold, 13, larguraUtil - cardPadX * 2), {
    x: xEsq + cardPadX,
    y: cardTop - cardPadTop - 13,
    size: 13,
    font: fonteBold,
    color: ESCURO,
  });

  // Desenha uma coluna de pares rotulo/valor a partir de (x, yTopo).
  const drawColuna = (campos: CampoCard[], colX: number, yTopo: number): void => {
    let yy = yTopo;
    for (const c of campos) {
      page.drawText(sanitizar(c.rot), { x: colX, y: yy, size: 7.5, font: fonteBold, color: CINZA_CLARO });
      yy -= 11;
      const linhas = c.wrap
        ? quebrarTexto(sanitizar(c.val), fonte, 9.5, colW).slice(0, 2)
        : [truncar(sanitizar(c.val), fonte, 9.5, colW)];
      for (const ln of linhas) {
        page.drawText(ln, { x: colX, y: yy, size: 9.5, font: fonte, color: ESCURO });
        yy -= 12;
      }
      yy -= 4;
    }
  };
  const corpoTopo = cardTop - cardPadTop - nomeBloco;
  drawColuna(colEsq, xEsq + cardPadX, corpoTopo);
  drawColuna(colDir, xEsq + cardPadX + colW + calha, corpoTopo);

  y = cardBottom - GAP_BLOCO;

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
      // Robustez (Bloco 2): trunca a linha se uma palavra unica muito longa
      // estourar a coluna de descricao (nao invade Qtd/Valor).
      page.drawText(truncar(ln, fonte, 10, descMaxW), {
        x: descL, y: yl, size: 10, font: fonte, color: ESCURO,
      });
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
      page.drawText("GARANTIA - SEM CUSTO", {
        x: descL,
        y: yl + lineStep - 12,
        size: 8,
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
  // Rotulo do frete com a transportadora quando houver (ex.: "Frete - Braspress").
  const transp = dados.transportadora ? sanitizar(dados.transportadora) : "";
  const rotuloFrete = transp ? `Frete - ${transp}` : "Frete";
  if (dados.fretePagoPelaEmpresa) {
    linhaTot(rotuloFrete, "Por conta da empresa", TIFFANY, CINZA);
  } else {
    linhaTot(rotuloFrete, dados.frete && dados.frete > 0 ? brl(dados.frete) : "Grátis");
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
  const notaValidade = limite
    ? `Proposta válida por ${VALIDADE_DIAS} dias (até ${limite}).  Dúvidas? Fale no WhatsApp.`
    : `Proposta válida por ${VALIDADE_DIAS} dias.  Dúvidas? Fale no WhatsApp.`;
  page.drawText(notaValidade, {
    x: xEsq,
    y: yF,
    size: 9,
    font: fonteBold,
    color: ESCURO,
  });
  textoDir(page, MARCA.site, xDir, yF, 9.5, fonteBold, TIFFANY);
  // Codigo anonimo do atendente (Fatia J): discreto, abaixo da nota de validade.
  if (codigoAtendente) {
    page.drawText(`Atendimento: ${sanitizar(codigoAtendente)}`, {
      x: xEsq,
      y: yF - 12,
      size: 7.5,
      font: fonte,
      color: CINZA_CLARO,
    });
  }

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
