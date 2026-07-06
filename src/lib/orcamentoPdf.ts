// Geracao do PDF do ORCAMENTO (Fatia 3.13). pdf-lib (puro JS, sem Chromium) roda
// no runtime nodejs do Railway. Layout A4 pensado para LEITURA NO CELULAR: uma
// coluna, fontes >=10pt, margens generosas, hierarquia clara e cores da marca com
// sobriedade. Sem emoji. Funcao pura: recebe os dados ja montados e devolve os
// bytes do PDF (Uint8Array). A montagem dos dados (Prisma) fica em orcamentoDados.ts.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Cores da marca.
const TIFFANY = rgb(0.235, 0.749, 0.702); // #3cbfb3
const ESCURO = rgb(0.059, 0.18, 0.169); // #0f2e2b
const CINZA = rgb(0.42, 0.42, 0.42);
const CINZA_CLARO = rgb(0.6, 0.6, 0.6);
const LINHA = rgb(0.85, 0.85, 0.85);
const VERDE = rgb(0.16, 0.55, 0.32);

// Dados da marca (cabecalho/rodape).
const MARCA = {
  nome: "Sixxis",
  endereco: "R. Anhanguera, 1711 - Icaray, Aracatuba/SP",
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
};

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
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Orcamento ${dados.numeroFormatado}`);
  doc.setProducer("Sixxis CRM");
  doc.setCreator("Sixxis CRM");

  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const fonteBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const A4: [number, number] = [595.28, 841.89];
  const MARGEM = 50;
  const larguraUtil = A4[0] - MARGEM * 2;
  const xEsq = MARGEM;
  const xDir = A4[0] - MARGEM;

  let page = doc.addPage(A4);
  let y = A4[1] - MARGEM;

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

  const linhaFina = (p: PDFPage, yPos: number, cor = LINHA) => {
    p.drawLine({
      start: { x: xEsq, y: yPos },
      end: { x: xDir, y: yPos },
      thickness: 0.7,
      color: cor,
    });
  };

  // ---- Cabecalho ----
  page.drawText(MARCA.nome, { x: xEsq, y: y - 26, size: 30, font: fonteBold, color: TIFFANY });
  textoDir(page, dados.numeroFormatado, xDir, y - 10, 13, fonteBold, ESCURO);
  textoDir(page, dados.dataFormatada, xDir, y - 26, 10, fonte, CINZA);
  y -= 46;
  page.drawText(MARCA.endereco, { x: xEsq, y, size: 9, font: fonte, color: CINZA });
  y -= 13;
  page.drawText(`${MARCA.email}   ${MARCA.site}`, {
    x: xEsq,
    y,
    size: 9,
    font: fonte,
    color: CINZA,
  });
  y -= 16;
  linhaFina(page, y, TIFFANY);
  y -= 26;

  // ---- Cliente ----
  page.drawText("CLIENTE", { x: xEsq, y, size: 9, font: fonteBold, color: TIFFANY });
  y -= 18;
  page.drawText(sanitizar(dados.cliente.nome) || "Cliente", {
    x: xEsq,
    y,
    size: 14,
    font: fonteBold,
    color: ESCURO,
  });
  y -= 17;
  const linhasCliente: string[] = [];
  if (dados.cliente.telefone) linhasCliente.push(dados.cliente.telefone);
  const doc2 = dados.cliente.cnpj
    ? `CNPJ ${dados.cliente.cnpj}`
    : dados.cliente.cpf
      ? `CPF ${dados.cliente.cpf}`
      : null;
  if (doc2) linhasCliente.push(doc2);
  const local =
    dados.cliente.cidade && dados.cliente.uf
      ? `${dados.cliente.cidade}/${dados.cliente.uf}`
      : dados.cliente.cidade || dados.cliente.uf || null;
  if (local) linhasCliente.push(local);
  if (linhasCliente.length) {
    page.drawText(sanitizar(linhasCliente.join("    ")), {
      x: xEsq,
      y,
      size: 10,
      font: fonte,
      color: CINZA,
    });
    y -= 14;
  }
  y -= 16;

  // ---- Tabela de itens ----
  // Colunas: descricao (esq) | qtd (centro) | unit (dir) | subtotal (dir).
  const xQtd = xDir - 210;
  const xUnit = xDir - 110;
  const xSub = xDir;
  const larguraDesc = xQtd - xEsq - 12;

  page.drawText("ITENS", { x: xEsq, y, size: 9, font: fonteBold, color: TIFFANY });
  y -= 16;
  page.drawText("Descricao", { x: xEsq, y, size: 8.5, font: fonteBold, color: CINZA_CLARO });
  textoDir(page, "Qtd", xQtd + 16, y, 8.5, fonteBold, CINZA_CLARO);
  textoDir(page, "Valor unit.", xUnit + 40, y, 8.5, fonteBold, CINZA_CLARO);
  textoDir(page, "Subtotal", xSub, y, 8.5, fonteBold, CINZA_CLARO);
  y -= 6;
  linhaFina(page, y);
  y -= 16;

  const novaPaginaSePreciso = (alturaNecessaria: number) => {
    if (y - alturaNecessaria < MARGEM + 90) {
      page = doc.addPage(A4);
      y = A4[1] - MARGEM;
    }
  };

  for (const it of dados.itens) {
    const linhasDesc = quebrarTexto(sanitizar(it.descricao) || "Item", fonte, 10, larguraDesc);
    const alturaItem = Math.max(linhasDesc.length * 13, 13) + 6;
    novaPaginaSePreciso(alturaItem);

    let yLinha = y;
    for (const ln of linhasDesc) {
      page.drawText(ln, { x: xEsq, y: yLinha, size: 10, font: fonte, color: ESCURO });
      yLinha -= 13;
    }
    // Qtd / unit / subtotal alinhados a primeira linha da descricao.
    textoDir(page, String(it.quantidade), xQtd + 16, y, 10, fonte, ESCURO);
    if (it.garantia) {
      page.drawText("Garantia - sem custo", {
        x: xEsq,
        y: yLinha + 13 - 12,
        size: 8.5,
        font: fonteBold,
        color: TIFFANY,
      });
      yLinha -= 12;
      textoDir(page, "-", xUnit + 40, y, 10, fonte, CINZA_CLARO);
      textoDir(page, "-", xSub, y, 10, fonte, CINZA_CLARO);
    } else {
      textoDir(page, brl(it.valorUnitario), xUnit + 40, y, 10, fonte, ESCURO);
      textoDir(page, brl(it.quantidade * it.valorUnitario), xSub, y, 10, fonteBold, ESCURO);
    }
    y = Math.min(yLinha, y - 13) - 6;
  }

  y -= 4;
  linhaFina(page, y);
  y -= 22;

  // ---- Valores (bloco a direita) ----
  novaPaginaSePreciso(120);
  const xValLabel = xDir - 240;
  const linhaValor = (
    label: string,
    valor: string,
    opts?: { cor?: ReturnType<typeof rgb>; bold?: boolean; size?: number },
  ) => {
    const size = opts?.size ?? 10;
    const f = opts?.bold ? fonteBold : fonte;
    const cor = opts?.cor ?? CINZA;
    page.drawText(label, { x: xValLabel, y, size, font: f, color: cor });
    textoDir(page, valor, xDir, y, size, f, opts?.bold ? ESCURO : cor);
    y -= size + 6;
  };

  linhaValor("Subtotal", brl(dados.subtotal));
  if (dados.descontoValor > 0) {
    const cupomSan = dados.cupom ? sanitizar(dados.cupom) : "";
    const rot = cupomSan
      ? `Desconto (cupom ${cupomSan}${dados.descontoPct ? ` - ${dados.descontoPct}%` : ""})`
      : `Desconto${dados.descontoPct ? ` (${dados.descontoPct}%)` : ""}`;
    linhaValor(rot, `- ${brl(dados.descontoValor)}`, { cor: VERDE });
  }
  if (dados.fretePagoPelaEmpresa) {
    linhaValor("Frete", "por conta da Sixxis", { cor: TIFFANY });
  } else {
    linhaValor("Frete", dados.frete && dados.frete > 0 ? brl(dados.frete) : "gratis");
  }

  y -= 2;
  page.drawLine({
    start: { x: xValLabel, y: y + 6 },
    end: { x: xDir, y: y + 6 },
    thickness: 0.7,
    color: LINHA,
  });
  y -= 8;
  page.drawText("TOTAL", { x: xValLabel, y, size: 14, font: fonteBold, color: ESCURO });
  textoDir(page, brl(dados.totalFinal), xDir, y, 16, fonteBold, TIFFANY);
  y -= 24;

  if (dados.totalGarantia > 0) {
    page.drawText(
      `Itens em garantia (cortesia, sem custo): ${brl(dados.totalGarantia)}`,
      { x: xValLabel, y, size: 8.5, font: fonte, color: CINZA_CLARO },
    );
    y -= 16;
  }

  // ---- Rodape (fixo na base da ultima pagina) ----
  const yRodape = MARGEM + 30;
  linhaFina(page, yRodape + 26);
  page.drawText("Orcamento valido por 7 dias.", {
    x: xEsq,
    y: yRodape + 12,
    size: 9,
    font: fonteBold,
    color: ESCURO,
  });
  page.drawText("Obrigado pela preferencia. Qualquer duvida, estamos a disposicao.", {
    x: xEsq,
    y: yRodape,
    size: 9,
    font: fonte,
    color: CINZA,
  });
  textoDir(page, MARCA.site, xDir, yRodape + 6, 10, fonteBold, TIFFANY);

  return doc.save();
}
