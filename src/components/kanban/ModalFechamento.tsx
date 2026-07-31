"use client";

// Modal de fechamento. GANHO vira um PEDIDO: escolhe produtos/pecas do catalogo
// (categoria + modelo), quantidade e valor unitario (pre-preenche o sugerido),
// com subtotal por item, TOTAL de produtos, FRETE e TOTAL geral automaticos.
// Sem itens, cai no modo simples (so valor). PERDIDO pede o motivo. O total do
// pedido vira o `valor` do negocio (usado inclusive pela conversao Meta).
import { useEffect, useRef, useState } from "react";
import { X, Loader2, Plus, Trash2, ShieldCheck, Info, DownloadCloud } from "lucide-react";
import { MOTIVOS_PERDA } from "@/lib/motivosPerda";
import { formatarBRL } from "@/lib/format";
import {
  SecaoPagamento,
  paraUI,
  paraPersistir,
  type LinhaPagamentoUI,
} from "@/components/pecas/SecaoPagamento";
import { lerPagamentos, type LinhaPagamento } from "@/lib/pagamento";
import {
  normalizarItemLoja,
  metodoDaFormaPagamento,
  dataParaInput,
  rotuloPedidoLoja,
  type PedidoCrmLoja,
} from "@/lib/pedidoLoja";

type CatalogoItem = {
  id: string;
  nome: string;
  categoria: string | null;
  modelo: string | null;
  // Referencia do catalogo: pre-preenchem o item quando o produto e escolhido.
  voltagem: string | null;
  cor: string | null;
  precoSugerido: number | null;
};

// Voltagens aceitas no item do Ganho. "" = nao informada (o campo e opcional).
const VOLTAGENS = ["110V", "220V"] as const;

// Rotulo do item do catalogo. Varios produtos ja tem o modelo dentro do proprio
// nome ("Climatizador M45 Trend" + modelo "M45 Trend"); concatenar cegamente
// gerava "Climatizador M45 Trend M45 Trend". Se o nome ja contem o modelo, usa
// so o nome; senao, mantem a concatenacao (produtos cujo nome nao traz o modelo).
function rotuloCatalogo(c: Pick<CatalogoItem, "nome" | "modelo">): string {
  if (c.modelo && c.nome.includes(c.modelo)) return c.nome;
  return [c.nome, c.modelo].filter(Boolean).join(" ");
}

type Linha = {
  key: string;
  produtoCatalogoId: string | null;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  // Garantia (so pos-venda): item nao soma no total cobrado.
  garantia: boolean;
  // Voltagem e cor do item (opcionais). Pre-preenchidos pelo catalogo quando o
  // produto e escolhido; o vendedor pode ajustar. "" = nao informado.
  // AINDA NAO PERSISTIDOS: ItemPedido nao tem onde guardar (ver comentario em
  // confirmar()); por ora servem para conferencia na hora do fechamento.
  voltagem: string;
  cor: string;
};

export type DadosFechamento = {
  valor?: number;
  motivoPerda?: string;
  motivoPerdaObs?: string;
  itens?: {
    produtoCatalogoId: string | null;
    descricao: string;
    quantidade: number;
    valorUnitario: number;
    garantia?: boolean;
  }[];
  frete?: number | null;
  // Frete pago pela empresa: quando true, o frete NAO soma ao total (vira despesa).
  fretePagoPelaEmpresa?: boolean;
  // Pos-venda: valor final cobrado quando difere do calculado (null = calculado).
  valorAjustado?: number | null;
  // Formas de pagamento congeladas no snapshot (Fatia 3.18): array validado.
  orcPagamentos?: LinhaPagamento[];
  // Fatia E (checkout no GANHO): NF e rastreio OPCIONAIS, criados na transacao da
  // decisao. Ausentes = comportamento atual.
  nf?: { numero: string; dataNF: string };
  rastreio?: { codigo: string; transportadora?: string | null };
};

export function ModalFechamento({
  tipo,
  valorInicial,
  finalidade = "VENDA",
  freteInicial,
  fretePagoPelaEmpresaInicial = false,
  valorFinalInicial,
  descontoInfo,
  itensIniciais,
  negocioId,
  pagamentosIniciais,
  onConfirmar,
  onCancelar,
}: {
  tipo: "ganho" | "perdido";
  valorInicial?: number | null;
  finalidade?: "VENDA" | "POS_VENDA";
  // Quando presente (ganho), carrega o rascunho de pagamentos do negocio.
  negocioId?: string;
  // Pre-carga direta das formas de pagamento (sobrepoe o fetch por negocioId).
  pagamentosIniciais?: LinhaPagamento[];
  freteInicial?: number | null;
  // Pre-carga do orcamento (Fatia 3.09): frete/empresa e o valor final (totalFinal).
  fretePagoPelaEmpresaInicial?: boolean;
  valorFinalInicial?: number | null;
  descontoInfo?: { cupom: string | null; descontoPct: number | null; descValor: number } | null;
  itensIniciais?: {
    produtoCatalogoId: string | null;
    descricao: string;
    quantidade: number;
    valorUnitario: number;
    garantia?: boolean;
  }[];
  onConfirmar: (dados: DadosFechamento) => Promise<void>;
  onCancelar: () => void;
}) {
  const ehGanho = tipo === "ganho";
  const ehPeca = finalidade === "POS_VENDA";
  const [valor, setValor] = useState(valorInicial != null ? String(valorInicial) : "");
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const contador = useRef(0);
  const [itens, setItens] = useState<Linha[]>(() =>
    (itensIniciais ?? []).map((it) => {
      contador.current += 1;
      return {
        key: `l${contador.current}`,
        produtoCatalogoId: it.produtoCatalogoId,
        descricao: it.descricao,
        quantidade: it.quantidade,
        valorUnitario: it.valorUnitario,
        garantia: it.garantia ?? false,
        voltagem: "",
        cor: "",
      };
    }),
  );
  // Valor final cobrado (editavel). Pre-carregado com o totalFinal do orcamento
  // (Fatia 3.09); editouFinal=true ja de inicio quando pre-carregado, para nao
  // ser sobrescrito pelo total calculado (mas o usuario ainda pode ajustar).
  const [valorFinalStr, setValorFinalStr] = useState(
    valorFinalInicial != null ? String(valorFinalInicial) : "",
  );
  const [editouFinal, setEditouFinal] = useState(valorFinalInicial != null);
  const [frete, setFrete] = useState(freteInicial != null ? String(freteInicial) : "");
  // Frete pago pela empresa: sai do total (vira despesa rastreavel).
  const [fretePagoPelaEmpresa, setFretePagoPelaEmpresa] = useState(fretePagoPelaEmpresaInicial);

  // Checkout no GANHO (Fatia E): NF (numero + data) e rastreio (codigo +
  // transportadora), todos OPCIONAIS.
  const [nfNumero, setNfNumero] = useState("");
  const [nfData, setNfData] = useState("");
  const [rastCodigo, setRastCodigo] = useState("");
  const [rastTransp, setRastTransp] = useState("");

  // Formas de pagamento (Fatia 3.18): editaveis no GANHO. Pre-carrega do rascunho
  // (prop direta ou fetch por negocioId). Congela no snapshot ao confirmar.
  const [pagamentos, setPagamentos] = useState<LinhaPagamentoUI[]>(
    pagamentosIniciais ? paraUI(pagamentosIniciais) : [],
  );

  useEffect(() => {
    if (!ehGanho) return;
    fetch(`/api/catalogo?tipo=${ehPeca ? "PECA" : "PRODUTO"}`)
      .then((r) => (r.ok ? r.json() : { itens: [] }))
      .then((d) => setCatalogo(d.itens ?? []))
      .catch(() => undefined);
  }, [ehGanho, ehPeca]);

  // Carrega o rascunho de pagamentos do negocio quando nao veio por prop.
  useEffect(() => {
    if (!ehGanho || !negocioId || pagamentosIniciais) return;
    let vivo = true;
    fetch(`/api/negocios/${negocioId}/pecas-necessarias`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d && Array.isArray(d.pagamentos)) {
          setPagamentos(paraUI(lerPagamentos(d.pagamentos)));
        }
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [ehGanho, negocioId, pagamentosIniciais]);

  // ---- "Puxar do site": traz o pedido da Loja para PRE-PREENCHER o Ganho ----
  // Nunca confirma nada: o vendedor confere e clica em Confirmar como sempre.
  // Disponivel so na VENDA e quando sabemos o negocio (a rota resolve o telefone
  // do cliente pelo negocio, server-side, com a chave da Loja).
  const podePuxar = ehGanho && !ehPeca && !!negocioId;
  const [puxando, setPuxando] = useState(false);
  const [avisoLoja, setAvisoLoja] = useState<string | null>(null);
  // Lista para escolher quando o cliente tem mais de um pedido no site.
  const [escolhaLoja, setEscolhaLoja] = useState<PedidoCrmLoja[] | null>(null);

  async function puxarDoSite() {
    if (!negocioId || puxando) return;
    setPuxando(true);
    setAvisoLoja(null);
    setEscolhaLoja(null);
    try {
      const r = await fetch(`/api/negocios/${negocioId}/puxar-loja`, { method: "POST" });
      const d = (await r.json()) as { ok?: boolean; mensagem?: string; pedidos?: PedidoCrmLoja[] };
      if (!r.ok || d.ok === false) {
        setAvisoLoja(d.mensagem ?? "Nao foi possivel consultar o site agora.");
      } else {
        const pedidos = d.pedidos ?? [];
        if (pedidos.length === 0) {
          setAvisoLoja("Nenhum pedido encontrado para este telefone.");
        } else if (pedidos.length === 1) {
          aplicarPedidoLoja(pedidos[0]);
        } else {
          setEscolhaLoja(pedidos);
        }
      }
    } catch {
      setAvisoLoja("Nao foi possivel consultar o site agora.");
    }
    setPuxando(false);
  }

  // Casa o item do pedido com o catalogo pelo MODELO, exato. "SX200 Prime" nunca
  // vira "SX200": sem casamento exato, o item cai em texto livre com o nome que
  // a Loja mandou (nao inventamos produtoCatalogoId).
  function casarPorModelo(modelo: string): CatalogoItem | null {
    if (!modelo) return null;
    return catalogo.find((c) => (c.modelo ?? "") === modelo) ?? null;
  }

  function aplicarPedidoLoja(p: PedidoCrmLoja) {
    setEscolhaLoja(null);
    setAvisoLoja(null);

    const linhas: Linha[] = (p.itens ?? []).map((cru) => {
      const it = normalizarItemLoja(cru);
      const c = casarPorModelo(it.modelo);
      contador.current += 1;
      return {
        key: `l${contador.current}`,
        produtoCatalogoId: c?.id ?? null,
        descricao: c ? rotuloCatalogo(c) : it.nome || it.modelo,
        quantidade: it.quantidade,
        valorUnitario: it.valorUnitario,
        garantia: false,
        voltagem: it.voltagem || c?.voltagem || "",
        cor: it.cor || c?.cor || "",
      };
    });
    setItens(linhas);

    // Frete: valor + quem paga. Ausente = zera (nao herda o que estava na tela).
    const freteValor = typeof p.frete?.valor === "number" ? p.frete.valor : 0;
    setFrete(freteValor > 0 ? String(freteValor) : "");
    setFretePagoPelaEmpresa(p.frete?.pagoPelaEmpresa === true);

    // Valor final: o total do pedido do site manda (pode ter desconto que a soma
    // dos itens nao reproduz). Sem total, volta a espelhar o calculado.
    const totalLoja = typeof p.total === "number" && p.total > 0 ? p.total : null;
    if (totalLoja != null) {
      setValorFinalStr(String(totalLoja));
      setEditouFinal(true);
    } else {
      setValorFinalStr("");
      setEditouFinal(false);
    }

    // Forma de pagamento: uma linha a vista com o total. Grafia nao reconhecida
    // => nao mexe (o vendedor escolhe na mao).
    const metodo = metodoDaFormaPagamento(p.formaPagamento);
    if (metodo) {
      const somaItens = linhas.reduce((a, l) => a + l.quantidade * l.valorUnitario, 0);
      const valorPago =
        totalLoja ?? somaItens + (p.frete?.pagoPelaEmpresa === true ? 0 : freteValor);
      setPagamentos(paraUI([{ metodo, valor: Math.max(0, valorPago), parcelas: 1 }]));
    }

    // NF e rastreio: so preenchem o que veio (a gravacao ancora a data ao
    // meio-dia UTC, como todo campo "so dia").
    setNfNumero(p.nf?.numero?.trim() ?? "");
    setNfData(dataParaInput(p.nf?.data));
    setRastCodigo(p.rastreio?.codigo?.trim() ?? "");
    setRastTransp(p.rastreio?.transportadora?.trim() ?? "");
  }

  // Catalogo agrupado por categoria (para os optgroups).
  const grupos = new Map<string, CatalogoItem[]>();
  for (const c of catalogo) {
    const g = c.categoria ?? "Outros";
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g)!.push(c);
  }

  function adicionar() {
    contador.current += 1;
    setItens((p) => [
      ...p,
      {
        key: `l${contador.current}`,
        produtoCatalogoId: null,
        descricao: "",
        quantidade: 1,
        valorUnitario: 0,
        garantia: false,
        voltagem: "",
        cor: "",
      },
    ]);
  }
  function alternarGarantia(key: string) {
    setItens((p) => p.map((i) => (i.key === key ? { ...i, garantia: !i.garantia } : i)));
  }
  function remover(key: string) {
    setItens((p) => p.filter((i) => i.key !== key));
  }
  function escolher(key: string, catalogoId: string) {
    const c = catalogo.find((x) => x.id === catalogoId);
    setItens((p) =>
      p.map((i) =>
        i.key === key
          ? {
              ...i,
              produtoCatalogoId: c?.id ?? null,
              descricao: c ? rotuloCatalogo(c) : "",
              valorUnitario:
                i.valorUnitario > 0 ? i.valorUnitario : c?.precoSugerido ?? 0,
              // Catalogo manda quando tem o dado; senao mantem o que o vendedor
              // digitou. (Na fase do endpoint da Loja, quem pre-preenche e o pedido.)
              voltagem: c?.voltagem ?? i.voltagem,
              cor: c?.cor ?? i.cor,
            }
          : i,
      ),
    );
  }

  const produtos = itens.reduce((acc, i) => acc + i.quantidade * i.valorUnitario, 0);
  // Cobraveis: exclui itens em garantia (so pos-venda). Em venda == produtos.
  const cobraveis = ehPeca
    ? itens.filter((i) => !i.garantia).reduce((acc, i) => acc + i.quantidade * i.valorUnitario, 0)
    : produtos;
  const garantiaTotal = ehPeca ? produtos - cobraveis : 0;
  const freteNum = Math.max(0, Number((frete || "0").replace(",", ".")) || 0);
  // Total calculado (cobrado do cliente): cobraveis + frete quando o cliente paga.
  const total = cobraveis + (fretePagoPelaEmpresa ? 0 : freteNum);

  // Valor final cobrado: espelha o total ate o usuario editar. Fatia 3.09: vale
  // para venda e pos-venda; quando pre-carregado (totalFinal do orcamento),
  // editouFinal ja e true e o campo mantem o valor com desconto.
  useEffect(() => {
    if (ehGanho && !editouFinal) {
      setValorFinalStr(total > 0 ? String(total) : "");
    }
  }, [total, ehGanho, editouFinal]);
  const valorFinal = Math.max(0, Number((valorFinalStr || "0").replace(",", ".")) || 0);
  const diferenca = total - valorFinal; // >0 desconto, <0 acrescimo
  const temAjuste = Math.abs(diferenca) > 0.005;
  // Total de referencia para o resumo "Pago vs Total" das formas de pagamento:
  // com itens, o valor final cobrado; sem itens (modo simples), o valor digitado.
  const totalPagamento =
    itens.length > 0 ? valorFinal : Math.max(0, Number((valor || "0").replace(",", ".")) || 0);
  const semPagamento = paraPersistir(pagamentos).length === 0;

  // Extras de checkout (Fatia E): NF/rastreio quando preenchidos. Vazio = {}.
  function checkoutExtras(): Pick<DadosFechamento, "nf" | "rastreio"> {
    const extras: Pick<DadosFechamento, "nf" | "rastreio"> = {};
    const num = nfNumero.trim();
    if (num && nfData) extras.nf = { numero: num, dataNF: nfData };
    const cod = rastCodigo.trim();
    if (cod) {
      extras.rastreio = { codigo: cod, transportadora: rastTransp.trim() || null };
    }
    return extras;
  }

  async function confirmar() {
    setErro(null);
    if (ehGanho) {
      if (itens.length > 0) {
        const validos = itens.filter((i) => i.descricao.trim() && i.valorUnitario >= 0);
        if (validos.length === 0) {
          setErro("Escolha ao menos um produto.");
          return;
        }
        // Peca pode fechar com total 0 (pedido inteiramente em garantia). Venda
        // continua exigindo total > 0.
        if (!ehPeca && total <= 0) {
          setErro("O total do pedido deve ser maior que zero.");
          return;
        }
        setSalvando(true);
        try {
          await onConfirmar({
            valor: total,
            frete: freteNum,
            fretePagoPelaEmpresa,
            // Valor final cobrado (com desconto/frete) -> valorAjustado, venda e
            // pos-venda. `valor` (base da conversao Meta) permanece o total calculado.
            valorAjustado: temAjuste ? valorFinal : null,
            // Formas de pagamento (opcional; congela no snapshot). Metadado.
            orcPagamentos: paraPersistir(pagamentos),
            // voltagem/cor NAO vao aqui: ItemPedido (schema.prisma) nao tem essas
            // colunas, entao nao ha onde guardar sem uma migracao aditiva propria.
            // Por ora sao so conferencia na tela; a persistencia entra na fatia
            // que ligar o endpoint da Loja (que manda voltagem e cor por item).
            itens: validos.map((i) => ({
              produtoCatalogoId: i.produtoCatalogoId,
              descricao: i.descricao.trim(),
              quantidade: i.quantidade,
              valorUnitario: i.valorUnitario,
              ...(ehPeca ? { garantia: i.garantia } : {}),
            })),
            ...checkoutExtras(),
          });
        } catch {
          setErro("Nao foi possivel concluir.");
          setSalvando(false);
        }
        return;
      }
      // Modo simples: so valor total.
      const v = Number(valor.replace(",", "."));
      if (!v || v <= 0) {
        setErro("Informe um valor ou adicione produtos.");
        return;
      }
      setSalvando(true);
      try {
        await onConfirmar({
          valor: v,
          orcPagamentos: paraPersistir(pagamentos),
          ...checkoutExtras(),
        });
      } catch {
        setErro("Nao foi possivel concluir.");
        setSalvando(false);
      }
      return;
    }
    // Perdido
    if (!motivo) {
      setErro("Selecione o motivo da perda.");
      return;
    }
    if (motivo === "OUTRO" && !obs.trim()) {
      setErro("Descreva o motivo no campo de observacao.");
      return;
    }
    setSalvando(true);
    try {
      await onConfirmar({ motivoPerda: motivo, motivoPerdaObs: obs.trim() || undefined });
    } catch {
      setErro("Nao foi possivel concluir.");
      setSalvando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`modal-in flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl ${
          ehGanho ? "max-w-lg" : "max-w-sm"
        }`}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3">
          <h3 className="text-base font-semibold text-escuro">
            {ehGanho ? "Fechar pedido" : "Marcar como perdido"}
          </h3>
          <button onClick={onCancelar} className="rounded-lg p-1 text-medio/60 hover:bg-black/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-fino flex-1 overflow-y-auto p-5">
          {ehGanho ? (
            <div className="space-y-3">
              {/* Puxar do site: pre-preenche a partir do pedido da Loja. */}
              {podePuxar && (
                <div className="space-y-2">
                  <button
                    onClick={() => void puxarDoSite()}
                    disabled={puxando}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-tiffany/40 bg-tiffany/5 py-2 text-sm font-semibold text-tiffany transition-colors hover:bg-tiffany/10 disabled:opacity-60"
                  >
                    {puxando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <DownloadCloud className="h-4 w-4" />
                    )}
                    Puxar do site
                  </button>
                  {avisoLoja && (
                    <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10">
                      <Info className="h-3.5 w-3.5 shrink-0" />
                      {avisoLoja}
                    </p>
                  )}
                  {/* Mais de um pedido: o vendedor escolhe qual pre-preenche. */}
                  {escolhaLoja && escolhaLoja.length > 0 && (
                    <div className="space-y-1 rounded-lg border border-black/5 bg-fundo p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-medio/50">
                          {escolhaLoja.length} pedidos no site — escolha um
                        </p>
                        <button
                          onClick={() => setEscolhaLoja(null)}
                          className="rounded p-0.5 text-medio/50 hover:bg-black/5"
                          title="Fechar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {escolhaLoja.map((p, i) => (
                        <button
                          key={p.id ?? p.numero ?? i}
                          onClick={() => aplicarPedidoLoja(p)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2 text-left text-sm text-escuro transition-colors hover:bg-tiffany/5"
                        >
                          <span className="min-w-0 truncate">{rotuloPedidoLoja(p)}</span>
                          <span className="shrink-0 whitespace-nowrap text-xs font-medium text-medio/70">
                            {typeof p.total === "number" ? formatarBRL(p.total) : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Itens do pedido */}
              <div className="space-y-2">
                {itens.map((it) => (
                  <div key={it.key} className="rounded-lg border border-black/5 bg-fundo p-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={it.produtoCatalogoId ?? ""}
                        onChange={(e) => escolher(it.key, e.target.value)}
                        className="campo min-w-0 flex-1"
                      >
                        <option value="">{ehPeca ? "Escolha a peca..." : "Escolha o produto..."}</option>
                        {Array.from(grupos.entries()).map(([g, lista]) => (
                          <optgroup key={g} label={g}>
                            {lista.map((c) => (
                              <option key={c.id} value={c.id}>
                                {rotuloCatalogo(c)}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <button
                        onClick={() => remover(it.key)}
                        title="Remover item"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-medio/60 hover:bg-black/5 hover:text-erro"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-end gap-2">
                      <label className="flex shrink-0 flex-col gap-0.5 text-xs text-medio/60">
                        Qtd
                        <input
                          type="number"
                          min="1"
                          value={it.quantidade}
                          onChange={(e) =>
                            setItens((p) =>
                              p.map((x) =>
                                x.key === it.key
                                  ? { ...x, quantidade: Math.max(1, Math.floor(Number(e.target.value) || 1)) }
                                  : x,
                              ),
                            )
                          }
                          className="campo w-14"
                        />
                      </label>
                      <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs text-medio/60">
                        Unitario
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={it.valorUnitario || ""}
                          onChange={(e) =>
                            setItens((p) =>
                              p.map((x) =>
                                x.key === it.key
                                  ? { ...x, valorUnitario: Math.max(0, Number(e.target.value) || 0) }
                                  : x,
                              ),
                            )
                          }
                          placeholder="0,00"
                          className="campo w-full"
                        />
                      </label>
                      <span
                        className={`shrink-0 whitespace-nowrap pb-2 text-right text-sm font-medium ${
                          ehPeca && it.garantia ? "text-medio/40 line-through" : "text-escuro"
                        }`}
                      >
                        {formatarBRL(it.quantidade * it.valorUnitario)}
                      </span>
                    </div>
                    {/* Voltagem e cor do item (opcionais). Pre-preenchidos pelo
                        catalogo; conferidos/ajustados pelo vendedor. */}
                    <div className="mt-2 flex items-end gap-2">
                      <label className="flex shrink-0 flex-col gap-0.5 text-xs text-medio/60">
                        Voltagem
                        <select
                          value={it.voltagem}
                          onChange={(e) =>
                            setItens((p) =>
                              p.map((x) => (x.key === it.key ? { ...x, voltagem: e.target.value } : x)),
                            )
                          }
                          className="campo w-24"
                        >
                          <option value="">—</option>
                          {/* Valor vindo do catalogo fora da lista: nao some do select. */}
                          {it.voltagem && !VOLTAGENS.includes(it.voltagem as (typeof VOLTAGENS)[number]) && (
                            <option value={it.voltagem}>{it.voltagem}</option>
                          )}
                          {VOLTAGENS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs text-medio/60">
                        Cor
                        <input
                          value={it.cor}
                          onChange={(e) =>
                            setItens((p) =>
                              p.map((x) => (x.key === it.key ? { ...x, cor: e.target.value } : x)),
                            )
                          }
                          placeholder="Opcional"
                          className="campo w-full"
                        />
                      </label>
                    </div>
                    {/* Garantia (so pos-venda): item nao soma no total cobrado. */}
                    {ehPeca && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => alternarGarantia(it.key)}
                          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                            it.garantia
                              ? "bg-tiffany/10 text-tiffany"
                              : "text-medio/60 hover:bg-black/5"
                          }`}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Garantia
                        </button>
                        {it.garantia && (
                          <span className="rounded bg-tiffany/10 px-1.5 py-0.5 text-[11px] font-semibold text-tiffany">
                            nao cobrado
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <button
                  onClick={adicionar}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-black/15 py-2 text-sm font-medium text-medio transition-colors hover:border-tiffany hover:text-tiffany"
                >
                  <Plus className="h-4 w-4" /> Adicionar {ehPeca ? "peca" : "produto"}
                </button>
              </div>

              {itens.length > 0 ? (
                <div className="space-y-2 rounded-lg border border-black/5 bg-fundo p-3">
                  <div className="flex items-center justify-between gap-2 text-sm text-medio/70">
                    <span>{ehPeca ? "Pecas" : "Produtos"}</span>
                    <span className="whitespace-nowrap font-medium text-escuro">
                      {formatarBRL(ehPeca ? cobraveis : produtos)}
                    </span>
                  </div>
                  {ehPeca && garantiaTotal > 0 && (
                    <div className="flex items-center justify-between gap-2 text-sm text-medio/70">
                      <span className="flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5 text-tiffany" /> Garantia
                        <span className="text-medio/40">(nao cobrado)</span>
                      </span>
                      <span className="whitespace-nowrap font-medium text-medio/40 line-through">
                        {formatarBRL(garantiaTotal)}
                      </span>
                    </div>
                  )}
                  <label className="flex items-center justify-between gap-2 text-sm text-medio/70">
                    <span className="shrink-0">Frete</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={frete}
                      onChange={(e) => setFrete(e.target.value)}
                      placeholder="0,00"
                      className="campo w-28 text-right"
                    />
                  </label>
                  {/* Frete pago pela empresa: sai do total e vira despesa. */}
                  <label className="flex items-start gap-2 text-xs text-medio/70">
                    <input
                      type="checkbox"
                      checked={fretePagoPelaEmpresa}
                      onChange={(e) => setFretePagoPelaEmpresa(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-tiffany"
                    />
                    <span>Frete pago pela empresa (despesa)</span>
                  </label>
                  {fretePagoPelaEmpresa && freteNum > 0 && (
                    <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10">
                      O frete de {formatarBRL(freteNum)} nao entra no total do
                      cliente e sera registrado como despesa da empresa.
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 border-t border-black/10 pt-2">
                    <span className="text-sm font-semibold text-escuro">
                      {ehPeca ? "Total calculado" : "Total"}
                    </span>
                    <span
                      className={`whitespace-nowrap font-bold text-tiffany ${
                        ehPeca ? "text-sm" : "text-base"
                      }`}
                    >
                      {formatarBRL(total)}
                    </span>
                  </div>
                  {/* Linha do desconto do orcamento (Fatia 3.09), quando houver. */}
                  {descontoInfo && (descontoInfo.descontoPct ?? 0) > 0 && (
                    <div className="flex items-center justify-between gap-2 text-xs text-green-700">
                      <span>
                        {descontoInfo.cupom ? `Cupom ${descontoInfo.cupom} · ` : ""}
                        −{descontoInfo.descontoPct}%
                      </span>
                      <span>− {formatarBRL(descontoInfo.descValor)}</span>
                    </div>
                  )}
                  {ehGanho && (
                    <>
                      <label className="flex items-center justify-between gap-2 pt-1 text-sm text-escuro">
                        <span className="shrink-0 font-semibold">Valor final cobrado</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={valorFinalStr}
                          onChange={(e) => {
                            setEditouFinal(true);
                            setValorFinalStr(e.target.value);
                          }}
                          placeholder="0,00"
                          className="campo w-28 text-right font-bold"
                        />
                      </label>
                      {temAjuste && (
                        <p
                          className={`rounded-md px-2 py-1 text-[11px] ${
                            diferenca > 0
                              ? "bg-green-50 text-green-700 dark:bg-green-500/10"
                              : "bg-amber-50 text-amber-800 dark:bg-amber-500/10"
                          }`}
                        >
                          {diferenca > 0
                            ? `Desconto aplicado: ${formatarBRL(diferenca)}`
                            : `Acrescimo aplicado: ${formatarBRL(-diferenca)}`}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium text-escuro">
                    Valor total (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="0,00"
                    className="campo w-full"
                  />
                  <p className="mt-1 text-xs text-medio/50">
                    Ou adicione produtos acima para montar o pedido item a item.
                  </p>
                </div>
              )}

              {/* Forma(s) de pagamento (Fatia 3.18): editaveis; congela no snapshot.
                  OPCIONAL — aviso nao-bloqueante quando vazio (nao trava o ganho). */}
              <SecaoPagamento
                linhas={pagamentos}
                onChange={setPagamentos}
                totalFinal={totalPagamento}
              />
              {semPagamento && (
                <p className="flex items-center gap-1.5 text-[11px] text-medio/50">
                  <Info className="h-3.5 w-3.5" />
                  Nenhuma forma de pagamento informada (opcional).
                </p>
              )}

              {/* Checkout (Fatia E): NF + rastreio, OPCIONAIS. Preenchidos, sao
                  criados na mesma transacao da decisao (NF vinculada ao pedido). */}
              <div className="space-y-2 rounded-lg border border-black/5 bg-fundo p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-medio/50">
                  Nota fiscal e rastreio (opcional)
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={nfNumero}
                    onChange={(e) => setNfNumero(e.target.value)}
                    placeholder="Numero da NF"
                    className="campo min-w-28 flex-1 text-sm"
                  />
                  <input
                    type="date"
                    value={nfData}
                    onChange={(e) => setNfData(e.target.value)}
                    className="campo min-w-32 text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={rastCodigo}
                    onChange={(e) => setRastCodigo(e.target.value)}
                    placeholder="Codigo de rastreio"
                    className="campo min-w-28 flex-1 text-sm"
                  />
                  <input
                    value={rastTransp}
                    onChange={(e) => setRastTransp(e.target.value)}
                    placeholder="Transportadora"
                    className="campo min-w-32 flex-1 text-sm"
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <label className="mb-1 block text-sm font-medium text-escuro">
                Motivo da perda
              </label>
              <select
                autoFocus
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="campo w-full"
              >
                <option value="">Selecione um motivo...</option>
                {MOTIVOS_PERDA.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label}
                  </option>
                ))}
              </select>
              <label className="mb-1 mt-3 block text-sm font-medium text-escuro">
                Observacao{" "}
                <span className="text-medio/50">
                  {motivo === "OUTRO" ? "(obrigatoria)" : "(opcional)"}
                </span>
              </label>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={2}
                placeholder="Detalhe o que aconteceu (opcional)"
                className="campo w-full resize-none"
              />
            </>
          )}

          {erro && <p className="mt-2 text-xs text-erro">{erro}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/5 px-5 py-3">
          <button
            onClick={onCancelar}
            disabled={salvando}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={salvando}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${
              ehGanho ? "bg-green-600 hover:bg-green-700" : "bg-erro hover:bg-red-700"
            }`}
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {ehGanho ? "Confirmar pedido" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}
