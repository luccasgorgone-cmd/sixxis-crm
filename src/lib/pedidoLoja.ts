// Contrato do pedido que a Loja devolve em POST /api/interno/crm/pedidos-por-telefone
// + normalizadores PUROS usados pelo Ganho ("Puxar do site").
//
// Fica separado de lib/loja.ts (que le process.env e so roda no servidor) para
// que a tela do Ganho possa importar os normalizadores sem arrastar nada de
// servidor para o bundle do navegador.
//
// PRINCIPIO: campo ausente/null NUNCA quebra o Ganho — vira campo vazio e o
// vendedor preenche. Por isso tudo aqui e opcional e tolerante.
import type { MetodoPagamentoCode } from "./pagamento";

export type ItemPedidoCrmLoja = {
  nome?: string | null;
  modelo?: string | null;
  voltagem?: string | null;
  cor?: string | null;
  // Aliases aceitos para a mesma coisa (o contrato da Loja usa mais de um nome).
  quantidade?: number | null;
  qtd?: number | null;
  valorUnitario?: number | null;
  precoUnitario?: number | null;
  preco?: number | null;
};

export type PedidoCrmLoja = {
  id?: string | null;
  numero?: string | null;
  status?: string | null;
  total?: number | null;
  criadoEm?: string | null;
  itens?: ItemPedidoCrmLoja[] | null;
  frete?: { valor?: number | null; pagoPelaEmpresa?: boolean | null } | null;
  // Texto livre da Loja: "PIX" | "Cartão de crédito" | "Cartão de débito".
  formaPagamento?: string | null;
  nf?: { numero?: string | null; data?: string | null } | null;
  rastreio?: { codigo?: string | null; transportadora?: string | null } | null;
};

export type ItemNormalizado = {
  nome: string;
  modelo: string;
  voltagem: string;
  cor: string;
  quantidade: number;
  valorUnitario: number;
};

function num(...vs: (number | null | undefined)[]): number | null {
  for (const v of vs) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}
function txt(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

// Achata os aliases do item da Loja num shape unico. Quantidade minima 1.
export function normalizarItemLoja(it: ItemPedidoCrmLoja): ItemNormalizado {
  const q = num(it.quantidade, it.qtd) ?? 1;
  return {
    nome: txt(it.nome),
    modelo: txt(it.modelo),
    voltagem: txt(it.voltagem).toUpperCase(),
    cor: txt(it.cor),
    quantidade: Math.max(1, Math.floor(q)),
    valorUnitario: Math.max(0, num(it.valorUnitario, it.precoUnitario, it.preco) ?? 0),
  };
}

// "Cartão de crédito" -> CREDITO. Sem acento, sem caixa, sem depender da grafia
// exata. Nao reconhecido => null (o vendedor escolhe a forma na mao).
export function metodoDaFormaPagamento(
  forma: string | null | undefined,
): MetodoPagamentoCode | null {
  const s = txt(forma)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!s) return null;
  if (s.includes("pix")) return "PIX";
  if (s.includes("debito")) return "DEBITO";
  if (s.includes("credito")) return "CREDITO";
  if (s.includes("boleto")) return "BOLETO";
  if (s.includes("dinheiro") || s.includes("especie")) return "DINHEIRO";
  return null;
}

// Data da Loja -> "YYYY-MM-DD" para o <input type="date">. Aceita dia puro ou
// ISO com hora (usa o dia em UTC — a gravacao ancora ao meio-dia UTC depois).
// Invalido/ausente => "" (campo fica vazio).
export function dataParaInput(valor: string | null | undefined): string {
  const s = txt(valor);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

// Rotulo do pedido na lista de escolha (quando o cliente tem mais de um).
export function rotuloPedidoLoja(p: PedidoCrmLoja): string {
  const numero = txt(p.numero) || txt(p.id) || "sem numero";
  const dia = dataParaInput(p.criadoEm);
  const data = dia ? dia.split("-").reverse().join("/") : "";
  return [`Pedido ${numero}`, data, txt(p.status)].filter(Boolean).join(" · ");
}
