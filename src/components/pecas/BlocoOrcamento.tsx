"use client";

// Seccao ORCAMENTO v2 (Fatia 3.09). Dois modos de selecao + resumo com cupom/
// desconto/frete e total ao vivo. Reutilizado como "Pecas aplicadas" na aba Local.
// - VENDA: produtos do SITE (fonte viva da loja), chips de categoria + busca,
//   lista imediata; clicar -> stepper de qtd -> entra no orcamento.
// - POS_VENDA: ao escolher o "Produto do cliente" (modelo), as pecas do modelo +
//   gerais aparecem para clicar (stepper + garantia).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Wrench,
  ShoppingCart,
  Loader2,
  Plus,
  Minus,
  X,
  ShieldCheck,
  ChevronRight,
  ReceiptText,
  Send,
  CreditCard,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { InputBusca } from "@/components/ui/InputBusca";
import { formatarBRL, calcularTotalFinal } from "@/lib/format";
import type { MensagemItem } from "@/components/inbox/tipos";
import {
  SecaoPagamento,
  paraUI,
  paraPersistir,
  type LinhaPagamentoUI,
} from "@/components/pecas/SecaoPagamento";
import { lerPagamentos, formatarLinhaPagamento, type LinhaPagamento } from "@/lib/pagamento";

// ---- Tipos ----
type ProdutoLoja = {
  slug: string;
  nome: string;
  categoria: string | null;
  preco: number;
  precoPromo: number | null;
  url: string;
};
type PecaCat = {
  id: string;
  nome: string;
  categoria: string | null;
  modelo: string | null;
  // Voltagem da peca eletrica (Fatia 3.19): "110V" | "220V" | null (sem voltagem).
  voltagem: string | null;
  precoSugerido: number | null;
  estoque?: number;
  ativo?: boolean;
};
type Uso = {
  id: string;
  quantidade: number;
  garantia: boolean;
  pecaId: string;
  nome: string;
  modelo: string | null;
  voltagem: string | null;
  precoSugerido: number | null;
  estoque: number;
};

// Categoria dos modelos ANTIGOS (assistencia pos-venda). O agrupamento no select
// vem daqui (sem flag booleana). Fatia 3.19.
const CATEGORIA_ANTIGOS = "Climatizadores (Antigos)";
type OrcDraft = {
  cupom: string | null;
  descontoPct: number | null;
  frete: number | null;
  fretePagoPelaEmpresa: boolean;
};
type Modo = "VENDA" | "POS_VENDA" | "LOCAL";

type EditorProps = {
  titulo: string;
  icone: "peca" | "carrinho";
  modo: Modo;
  listUrl: string;
  addUrl: string;
  removeUrl: (usoId: string) => string;
  // Quando presente, habilita o stepper de quantidade na lista (PATCH staging).
  // Ausente (ex.: Pecas aplicadas do Local) -> sem stepper. Fatia 3.16.
  qtdUrl?: (usoId: string) => string;
  modeloEditavel: boolean;
  modeloFixo?: string | null;
  salvarModelo?: (modelo: string | null) => Promise<boolean>;
  mostrarGarantia: boolean;
  mostrarEstoque: boolean;
  movimentaEstoque: boolean;
  mostrarResumo: boolean;
  negocioId?: string;
  // Envio do orcamento em PDF (so no orcamento do negocio). Nome/telefone do
  // cliente sao usados apenas no texto da confirmacao. Fatia 3.13.
  permitirEnvio?: boolean;
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  // Injeta na thread a Mensagem OUT (documento) retornada pelo envio do orcamento,
  // para a bolha do PDF aparecer NA HORA (sem refresh). Fatia 3.15.
  onMensagemEnviada?: (msg: MensagemItem) => void;
  onMudou?: () => void;
};

function precoLoja(p: ProdutoLoja): number {
  return p.precoPromo != null && p.precoPromo > 0 ? p.precoPromo : p.preco;
}

function Stepper({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center rounded-lg border border-black/10">
      <button
        onClick={() => onChange(Math.max(1, valor - 1))}
        className="flex h-8 w-8 items-center justify-center text-medio/70 hover:bg-black/5"
        aria-label="Menos"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-8 text-center text-sm font-semibold text-escuro">{valor}</span>
      <button
        onClick={() => onChange(Math.min(99, valor + 1))}
        className="flex h-8 w-8 items-center justify-center text-medio/70 hover:bg-black/5"
        aria-label="Mais"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EditorOrcamento(props: EditorProps) {
  const {
    titulo,
    icone,
    modo,
    listUrl,
    addUrl,
    removeUrl,
    qtdUrl,
    modeloEditavel,
    modeloFixo = null,
    salvarModelo,
    mostrarGarantia,
    mostrarEstoque,
    movimentaEstoque,
    mostrarResumo,
    negocioId,
    permitirEnvio = false,
    clienteNome,
    clienteTelefone,
    onMensagemEnviada,
    onMudou,
  } = props;
  const ehVenda = modo === "VENDA";
  const toast = useToast();

  const [usos, setUsos] = useState<Uso[] | null>(null);
  const [modelo, setModelo] = useState<string>(modeloFixo ?? "");
  const [salvandoModelo, setSalvandoModelo] = useState(false);
  const [destacado, setDestacado] = useState<string | null>(null);

  const [produtos, setProdutos] = useState<ProdutoLoja[]>([]);
  const [categoriasLoja, setCategoriasLoja] = useState<string[]>([]);
  const [pecas, setPecas] = useState<PecaCat[]>([]);

  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState("");
  // Voltagem escolhida no pos-venda (Fatia 3.19). "" = nenhuma ainda.
  const [voltagem, setVoltagem] = useState("");
  const [sel, setSel] = useState<{ nome: string; modelo: string | null; voltagem?: string | null; estoque?: number } | null>(null);
  const [selPayload, setSelPayload] = useState<Record<string, unknown> | null>(null);
  const [qtd, setQtd] = useState(1);
  const [garantia, setGarantia] = useState(false);
  const [salvandoAdd, setSalvandoAdd] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const [orc, setOrc] = useState<OrcDraft>({
    cupom: null,
    descontoPct: null,
    frete: null,
    fretePagoPelaEmpresa: false,
  });
  // Cupom via SELECT com presets (SIXXIS05=5% / SIXXIS10=10%) + "Outro" (campos
  // livres). cupomOutro lembra que o usuario escolheu "Outro" mesmo com os campos
  // ainda vazios (senao o select voltaria a "Sem cupom"). Fatia 3.13.
  const [cupomOutro, setCupomOutro] = useState(false);
  // Formas de pagamento do rascunho (Fatia 3.18). null = ainda carregando.
  const [pagamentos, setPagamentos] = useState<LinhaPagamentoUI[]>([]);
  // Envio do orcamento em PDF: confirmacao leve (2 passos) + estado de envio.
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false);
  const [enviandoOrc, setEnviandoOrc] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (ehVenda) {
      fetch("/api/orcamento/produtos")
        .then((r) => (r.ok ? r.json() : { produtos: [], categorias: [] }))
        .then((d) => {
          if (!vivo) return;
          setProdutos(d.produtos ?? []);
          setCategoriasLoja(d.categorias ?? []);
        })
        .catch(() => undefined);
    } else {
      fetch("/api/pecas")
        .then((r) => (r.ok ? r.json() : { itens: [] }))
        .then((d) => {
          if (vivo) setPecas(d.itens ?? []);
        })
        .catch(() => undefined);
    }
    return () => {
      vivo = false;
    };
  }, [ehVenda]);

  const carregarLista = useCallback(async () => {
    try {
      const r = await fetch(listUrl);
      if (r.ok) {
        const d = await r.json();
        setUsos(d.pecas ?? []);
        if (modeloEditavel && typeof d.modeloProdutoCliente !== "undefined") {
          setModelo(d.modeloProdutoCliente ?? "");
        }
        if (d.orc) setOrc(d.orc);
        if (Array.isArray(d.pagamentos)) setPagamentos(paraUI(lerPagamentos(d.pagamentos)));
      } else {
        setUsos([]);
      }
    } catch {
      setUsos([]);
    }
  }, [listUrl, modeloEditavel]);

  useEffect(() => {
    void carregarLista();
  }, [carregarLista]);

  // Modelos agrupados: "Atuais" e "Antigos" (categoria "Climatizadores (Antigos)"),
  // Antigos DEPOIS. Cada modelo herda a categoria da 1a peca vista. Fatia 3.19.
  const modelosAgrupados = useMemo(() => {
    const catDe = new Map<string, string | null>();
    for (const p of pecas) {
      const m = p.modelo?.trim();
      if (m && !catDe.has(m)) catDe.set(m, p.categoria ?? null);
    }
    const atuais: string[] = [];
    const antigos: string[] = [];
    for (const [m, cat] of catDe) {
      if ((cat ?? "") === CATEGORIA_ANTIGOS) antigos.push(m);
      else atuais.push(m);
    }
    const ord = (a: string, b: string) => a.localeCompare(b, "pt-BR");
    return { atuais: atuais.sort(ord), antigos: antigos.sort(ord) };
  }, [pecas]);

  const modeloFiltro = modeloEditavel ? modelo : (modeloFixo ?? "");

  // Voltagens disponiveis do modelo escolhido (pecas eletricas ativas). Vazio =>
  // modelo sem peca eletrica (nao exige voltagem). Fatia 3.19.
  const voltagensModelo = useMemo(() => {
    if (!modeloFiltro) return [] as string[];
    const set = new Set<string>();
    for (const p of pecas) {
      if (p.ativo !== false && p.modelo?.trim() === modeloFiltro && p.voltagem) {
        set.add(p.voltagem);
      }
    }
    return [...set].sort(); // ["110V","220V"] ou ["220V"]
  }, [pecas, modeloFiltro]);
  const exigeVoltagem = voltagensModelo.length > 0;
  const voltagensKey = voltagensModelo.join(",");

  // Ao trocar de modelo/voltagens: fixa a unica opcao (so-220V), ou limpa (pede
  // escolha quando ha 110V e 220V).
  useEffect(() => {
    if (voltagensModelo.length === 1) setVoltagem(voltagensModelo[0]);
    else setVoltagem("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeloFiltro, voltagensKey]);

  const { doModelo, gerais } = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const ativas = pecas.filter((p) => p.ativo !== false);
    const casaBusca = (p: PecaCat) =>
      !termo ||
      p.nome.toLowerCase().includes(termo) ||
      (p.modelo ?? "").toLowerCase().includes(termo);
    const dm: PecaCat[] = [];
    const ge: PecaCat[] = [];
    for (const p of ativas) {
      if (!casaBusca(p)) continue;
      if (modeloFiltro && p.modelo && p.modelo.trim() === modeloFiltro) {
        // Peca do modelo: nao-eletrica (voltagem null) sempre entra; eletrica so na
        // voltagem selecionada (se nenhuma selecionada, a UI pede a escolha).
        if (!p.voltagem) dm.push(p);
        else if (voltagem && p.voltagem === voltagem) dm.push(p);
      } else if (!p.modelo) {
        ge.push(p);
      }
    }
    return { doModelo: dm, gerais: ge };
  }, [pecas, modeloFiltro, busca, voltagem]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (catFiltro && (p.categoria ?? "") !== catFiltro) return false;
      if (termo && !p.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [produtos, catFiltro, busca]);

  async function aoSalvarModelo(novo: string) {
    if (!salvarModelo) return;
    setModelo(novo);
    setSalvandoModelo(true);
    const ok = await salvarModelo(novo || null);
    setSalvandoModelo(false);
    if (ok) toast.sucesso("Modelo salvo.");
    else toast.erro("Não foi possível salvar o modelo.");
  }

  function escolherProduto(p: ProdutoLoja) {
    setSel({ nome: p.nome, modelo: null });
    setSelPayload({
      produtoLoja: {
        slug: p.slug,
        nome: p.nome,
        categoria: p.categoria,
        preco: p.preco,
        precoPromo: p.precoPromo,
      },
    });
    setQtd(1);
    setGarantia(false);
  }
  function escolherPeca(p: PecaCat) {
    setSel({ nome: p.nome, modelo: p.modelo, voltagem: p.voltagem, estoque: p.estoque });
    setSelPayload({ pecaId: p.id });
    setQtd(1);
    setGarantia(false);
  }

  async function adicionar() {
    if (!selPayload) return;
    setSalvandoAdd(true);
    try {
      const r = await fetch(addUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...selPayload, quantidade: qtd, garantia: mostrarGarantia && garantia }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        toast.erro(d?.erro ?? "Não foi possível adicionar o item.");
        return;
      }
      setSel(null);
      setSelPayload(null);
      setQtd(1);
      setGarantia(false);
      const novoId = d?.peca?.id as string | undefined;
      if (novoId) {
        setDestacado(novoId);
        setTimeout(() => setDestacado((x) => (x === novoId ? null : x)), 1000);
      }
      await carregarLista();
      onMudou?.();
      if (d?.limitado) toast.sucesso("Quantidade somada (máximo de 99 atingido).");
      else toast.sucesso(ehVenda ? "Produto adicionado." : "Peça adicionada.");
    } catch {
      toast.erro("Falha de conexão.");
    } finally {
      setSalvandoAdd(false);
    }
  }

  async function remover(usoId: string) {
    setRemovendo(usoId);
    setUsos((prev) => (prev ? prev.filter((u) => u.id !== usoId) : prev));
    try {
      const r = await fetch(removeUrl(usoId), { method: "DELETE" });
      if (!r.ok) throw new Error();
      onMudou?.();
      if (movimentaEstoque) await carregarLista();
      toast.sucesso("Item removido.");
    } catch {
      toast.erro("Não foi possível remover.");
      await carregarLista();
    } finally {
      setRemovendo(null);
    }
  }

  // Ajuste de quantidade na lista (Fatia 3.16): otimista + PATCH com debounce por
  // item. O total/resumo recalculam ao vivo (derivam de `usos`). Só ativo quando
  // qtdUrl e fornecido (orcamento do negocio; staging, sem mexer em estoque).
  const qtdDebounceRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  function salvarQtd(usoId: string, quantidade: number) {
    if (!qtdUrl) return;
    const timers = qtdDebounceRef.current;
    const anterior = timers.get(usoId);
    if (anterior) clearTimeout(anterior);
    timers.set(
      usoId,
      setTimeout(async () => {
        try {
          const r = await fetch(qtdUrl(usoId), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quantidade }),
          });
          if (r.ok) onMudou?.();
          else {
            toast.erro("Não foi possível ajustar a quantidade.");
            await carregarLista();
          }
        } catch {
          await carregarLista();
        }
      }, 400),
    );
  }
  function ajustarQtd(u: Uso, delta: number) {
    const nova = Math.min(99, Math.max(1, u.quantidade + delta));
    if (nova === u.quantidade) return;
    setUsos((prev) => (prev ? prev.map((x) => (x.id === u.id ? { ...x, quantidade: nova } : x)) : prev));
    salvarQtd(u.id, nova);
  }

  // Envia o orcamento em PDF ao cliente (acao real). Gera+envia no servidor; a
  // mensagem aparece na thread (OUT). Confirmacao leve de 2 passos no botao.
  async function enviarOrcamento() {
    if (!negocioId || enviandoOrc) return;
    setEnviandoOrc(true);
    setConfirmandoEnvio(false);
    try {
      const r = await fetch(`/api/negocios/${negocioId}/enviar-orcamento`, {
        method: "POST",
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.ok) {
        toast.erro(d?.erro ?? "Não foi possível enviar o orçamento.");
        return;
      }
      // Injeta a bolha do PDF na thread NA HORA (dedupe por id real com o socket).
      if (d.mensagem) onMensagemEnviada?.(d.mensagem as MensagemItem);
      toast.sucesso(`Orçamento ${d.numeroFormatado ?? ""} enviado ao cliente.`.trim());
    } catch {
      toast.erro("Falha de conexão ao enviar.");
    } finally {
      setEnviandoOrc(false);
    }
  }

  // Resumo: persistencia com debounce + toast discreto.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvarOrc = useCallback(
    (patch: Partial<OrcDraft>) => {
      if (!negocioId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          const body: Record<string, unknown> = {};
          if ("cupom" in patch) body.orcCupom = patch.cupom;
          if ("descontoPct" in patch) body.orcDescontoPct = patch.descontoPct;
          if ("frete" in patch) body.orcFrete = patch.frete;
          if ("fretePagoPelaEmpresa" in patch) body.orcFretePagoPelaEmpresa = patch.fretePagoPelaEmpresa;
          const r = await fetch(`/api/negocios/${negocioId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (r.ok) toast.sucesso("Salvo.");
        } catch {
          // silencioso
        }
      }, 600);
    },
    [negocioId, toast],
  );
  function mudarOrc(patch: Partial<OrcDraft>) {
    setOrc((prev) => ({ ...prev, ...patch }));
    salvarOrc(patch);
  }

  // Formas de pagamento (Fatia 3.18): persistencia com debounce + toast discreto.
  // Envia so as linhas com valor > 0 (paraPersistir); array vazio limpa.
  const pagDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mudarPagamentos = useCallback(
    (novas: LinhaPagamentoUI[]) => {
      setPagamentos(novas);
      if (!negocioId) return;
      if (pagDebounceRef.current) clearTimeout(pagDebounceRef.current);
      pagDebounceRef.current = setTimeout(async () => {
        try {
          const r = await fetch(`/api/negocios/${negocioId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orcPagamentos: paraPersistir(novas) }),
          });
          if (r.ok) toast.sucesso("Salvo.");
        } catch {
          // silencioso
        }
      }, 600);
    },
    [negocioId, toast],
  );

  // Cupons predefinidos (Fatia 3.13): escolher um preset preenche cupom + desconto
  // correspondente (ambos seguem editaveis). "Outro" libera os campos livres.
  const CUPONS_PRESET: Record<string, number> = { SIXXIS05: 5, SIXXIS10: 10 };
  const cupomPreset = orc.cupom && orc.cupom in CUPONS_PRESET ? orc.cupom : "";
  const modoCupom = cupomPreset
    ? cupomPreset
    : cupomOutro || orc.cupom || orc.descontoPct != null
      ? "OUTRO"
      : "";
  function aoMudarCupom(v: string) {
    if (v === "SIXXIS05" || v === "SIXXIS10") {
      setCupomOutro(false);
      mudarOrc({ cupom: v, descontoPct: CUPONS_PRESET[v] });
    } else if (v === "OUTRO") {
      setCupomOutro(true);
      // Vindo de um preset: limpa o codigo para o usuario digitar o proprio
      // (o desconto% fica como estava, editavel).
      if (cupomPreset) mudarOrc({ cupom: null });
    } else {
      setCupomOutro(false);
      mudarOrc({ cupom: null, descontoPct: null });
    }
  }

  const subtotal = (usos ?? [])
    .filter((u) => !u.garantia)
    .reduce((acc, u) => acc + u.quantidade * (u.precoSugerido ?? 0), 0);
  const totalGarantia = (usos ?? [])
    .filter((u) => u.garantia)
    .reduce((acc, u) => acc + u.quantidade * (u.precoSugerido ?? 0), 0);
  const descValor = subtotal * ((orc.descontoPct ?? 0) / 100);
  const freteAplicado = orc.fretePagoPelaEmpresa ? 0 : (orc.frete ?? 0);
  const totalFinal = calcularTotalFinal({
    totalCobravel: subtotal,
    descontoPct: orc.descontoPct,
    frete: orc.frete,
    fretePagoPelaEmpresa: orc.fretePagoPelaEmpresa,
  });

  const Icone = icone === "peca" ? Wrench : ShoppingCart;

  return (
    <section className="space-y-3 rounded-xl border border-black/5 bg-white p-4">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
        <Icone className="h-3.5 w-3.5" /> {titulo}
        {usos === null && <Loader2 className="h-3 w-3 animate-spin text-tiffany" />}
      </h4>

      {modeloEditavel && (
        <label className="flex items-center gap-2 text-xs text-medio/70">
          <span className="shrink-0">Produto do cliente</span>
          <select
            value={modelo}
            onChange={(e) => void aoSalvarModelo(e.target.value)}
            className="campo min-w-0 flex-1"
          >
            <option value="">Não informado</option>
            {/* Atuais primeiro; Antigos (assistencia) depois. Fatia 3.19. */}
            <optgroup label="Atuais">
              {modelosAgrupados.atuais.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </optgroup>
            {modelosAgrupados.antigos.length > 0 && (
              <optgroup label="Antigos">
                {modelosAgrupados.antigos.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {salvandoModelo && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-tiffany" />}
        </label>
      )}

      {/* Seletor de VOLTAGEM (Fatia 3.19): so quando o modelo tem pecas eletricas.
          So-220V (>100) ja fixado; com 110V e 220V, o atendente escolhe. */}
      {modeloEditavel && modeloFiltro && exigeVoltagem && (
        <label className="flex items-center gap-2 text-xs text-medio/70">
          <span className="shrink-0">Voltagem</span>
          <div className="flex gap-1.5">
            {voltagensModelo.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVoltagem(v)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  voltagem === v
                    ? "border-tiffany bg-tiffany/10 text-tiffany"
                    : "border-black/10 text-medio hover:bg-black/5"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </label>
      )}
      {!modeloEditavel && modeloFixo && (
        <p className="text-xs text-medio/60">
          Modelo do item: <span className="text-escuro">{modeloFixo}</span>
        </p>
      )}

      {movimentaEstoque && (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10">
          Adicionar aqui dá baixa no estoque na hora; remover devolve.
        </p>
      )}

      {/* 1. SELECAO de item (TOPO): chips/busca + lista de produtos/pecas. */}
      {sel ? (
        <div className="space-y-2 rounded-lg border border-tiffany/30 bg-tiffany/[0.03] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-escuro">
              {[sel.nome, sel.modelo].filter(Boolean).join(" ")}
              {sel.voltagem && (
                <span className="ml-1 rounded bg-tiffany/10 px-1 py-0.5 text-[10px] font-semibold text-tiffany">
                  {sel.voltagem}
                </span>
              )}
            </p>
            {mostrarEstoque && sel.estoque != null && (
              <span className="shrink-0 text-[11px] text-medio/50">estoque {sel.estoque}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Stepper valor={qtd} onChange={setQtd} />
            {mostrarGarantia && (
              <button
                type="button"
                onClick={() => setGarantia((g) => !g)}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                  garantia ? "bg-tiffany/10 text-tiffany" : "text-medio/60 hover:bg-black/5"
                }`}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> Garantia
              </button>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                onClick={() => {
                  setSel(null);
                  setSelPayload(null);
                }}
                className="rounded-lg px-2 py-1.5 text-xs font-medium text-medio hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => void adicionar()}
                disabled={salvandoAdd}
                className="flex items-center gap-1 rounded-lg bg-tiffany px-3 py-1.5 text-xs font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
              >
                {salvandoAdd ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Adicionar
              </button>
            </div>
          </div>
        </div>
      ) : ehVenda ? (
        <div className="space-y-2">
          {categoriasLoja.length > 0 && (
            <div className="scroll-fino flex gap-1 overflow-x-auto pb-1">
              <button
                onClick={() => setCatFiltro("")}
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  !catFiltro ? "bg-tiffany text-white" : "bg-fundo text-medio hover:bg-black/5"
                }`}
              >
                Todos
              </button>
              {categoriasLoja.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFiltro(c === catFiltro ? "" : c)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    catFiltro === c ? "bg-tiffany text-white" : "bg-fundo text-medio hover:bg-black/5"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <InputBusca valor={busca} onChange={setBusca} placeholder="Buscar produto" />
          <div className="scroll-fino max-h-56 space-y-1 overflow-y-auto">
            {produtosFiltrados.length === 0 ? (
              <p className="px-1 py-2 text-xs text-medio/50">Nenhum produto encontrado.</p>
            ) : (
              produtosFiltrados.map((p) => {
                const promo = p.precoPromo != null && p.precoPromo > 0;
                return (
                  <button
                    key={p.slug}
                    onClick={() => escolherProduto(p)}
                    className="flex w-full items-center gap-2 rounded-lg border border-black/5 px-2.5 py-1.5 text-left hover:border-tiffany/40 hover:bg-tiffany/[0.03]"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-escuro">{p.nome}</span>
                    <span className="shrink-0 text-xs">
                      {promo && <span className="mr-1 text-medio/40 line-through">{formatarBRL(p.preco)}</span>}
                      <span className="font-medium text-escuro">{formatarBRL(precoLoja(p))}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : !modeloFiltro && modeloEditavel ? (
        <p className="rounded-lg border border-dashed border-black/10 px-3 py-4 text-center text-xs text-medio/50">
          Selecione o produto do cliente para ver as peças.
        </p>
      ) : (
        <div className="space-y-2">
          <InputBusca valor={busca} onChange={setBusca} placeholder="Buscar peça" />
          {exigeVoltagem && !voltagem && (
            <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10">
              Selecione a voltagem para ver as peças elétricas.
            </p>
          )}
          <div className="scroll-fino max-h-56 space-y-2 overflow-y-auto">
            {doModelo.length === 0 && gerais.length === 0 && (
              <p className="px-1 py-2 text-xs text-medio/50">Nenhuma peça compatível.</p>
            )}
            {doModelo.length > 0 && (
              <GrupoPecas titulo="Do modelo" pecas={doModelo} mostrarEstoque={mostrarEstoque} onEscolher={escolherPeca} />
            )}
            {gerais.length > 0 && (
              <GrupoPecas titulo="Peças gerais" pecas={gerais} mostrarEstoque={mostrarEstoque} onEscolher={escolherPeca} />
            )}
          </div>
        </div>
      )}

      {/* 2. CARRINHO: itens ja adicionados ao orcamento. */}
      {mostrarResumo && usos && usos.length > 0 && (
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-medio/40">
          No orçamento
        </p>
      )}
      {usos && usos.length > 0 && (
        <ul className="space-y-1.5">
          {usos.map((u) => (
            <li
              key={u.id}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                destacado === u.id ? "border-tiffany bg-tiffany/5" : "border-black/5 bg-fundo"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-escuro">
                  {!qtdUrl && <span className="text-medio/60">{u.quantidade}x </span>}
                  {u.nome}
                  {u.modelo && <span className="text-medio/50"> {u.modelo}</span>}
                  {u.voltagem && (
                    <span className="ml-1 rounded bg-tiffany/10 px-1 py-0.5 text-[10px] font-semibold text-tiffany">
                      {u.voltagem}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {mostrarGarantia && u.garantia ? (
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-tiffany">
                      <ShieldCheck className="h-3 w-3" /> Garantia
                    </span>
                  ) : (
                    <span className="text-[11px] text-medio/50">
                      {u.precoSugerido != null ? formatarBRL(u.quantidade * u.precoSugerido) : "—"}
                    </span>
                  )}
                  {mostrarEstoque && u.quantidade > u.estoque && (
                    <span className="rounded bg-erro/10 px-1.5 py-0.5 text-[10px] font-semibold text-erro">
                      estoque insuficiente
                    </span>
                  )}
                </div>
              </div>
              {/* Stepper de quantidade (so no orcamento do negocio, via qtdUrl):
                  ajuste otimista + PATCH com debounce; total recalcula ao vivo. */}
              {qtdUrl && (
                <div className="flex shrink-0 items-center rounded-lg border border-black/10">
                  <button
                    onClick={() => ajustarQtd(u, -1)}
                    disabled={u.quantidade <= 1}
                    aria-label="Diminuir quantidade"
                    className="flex h-6 w-6 items-center justify-center text-medio/70 hover:bg-black/5 disabled:opacity-30"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-semibold text-escuro">{u.quantidade}</span>
                  <button
                    onClick={() => ajustarQtd(u, 1)}
                    disabled={u.quantidade >= 99}
                    aria-label="Aumentar quantidade"
                    className="flex h-6 w-6 items-center justify-center text-medio/70 hover:bg-black/5 disabled:opacity-30"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              )}
              <button
                onClick={() => void remover(u.id)}
                disabled={removendo === u.id}
                title="Remover"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-medio/50 hover:bg-black/5 hover:text-erro disabled:opacity-50"
              >
                {removendo === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {usos && usos.length === 0 && (
        <p className="text-xs text-medio/50">Nenhum item no orçamento ainda.</p>
      )}

      {/* RESUMO cupom/desconto/frete (so no orcamento do negocio) */}
      {mostrarResumo && usos && (
        <div className="space-y-2 rounded-lg border border-black/5 bg-fundo/50 p-2.5">
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-0.5 block text-[11px] text-medio/60">Cupom</span>
              <select
                value={modoCupom}
                onChange={(e) => aoMudarCupom(e.target.value)}
                className="campo w-full"
              >
                <option value="">Sem cupom</option>
                <option value="SIXXIS05">SIXXIS05 (5%)</option>
                <option value="SIXXIS10">SIXXIS10 (10%)</option>
                <option value="OUTRO">Outro</option>
              </select>
            </label>
            <label className="w-24 shrink-0">
              <span className="mb-0.5 block text-[11px] text-medio/60">Desconto %</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={orc.descontoPct ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value)));
                  mudarOrc({ descontoPct: v });
                }}
                placeholder="0"
                className="campo w-full text-right"
              />
            </label>
          </div>
          {modoCupom === "OUTRO" && (
            <label className="block">
              <span className="mb-0.5 block text-[11px] text-medio/60">Código do cupom</span>
              <input
                value={orc.cupom ?? ""}
                onChange={(e) => mudarOrc({ cupom: e.target.value.slice(0, 40) || null })}
                placeholder="Código"
                className="campo w-full"
              />
            </label>
          )}
          <div className="flex items-end gap-2">
            <label className="w-28 shrink-0">
              <span className="mb-0.5 block text-[11px] text-medio/60">Frete R$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={orc.frete ?? ""}
                onChange={(e) => {
                  const v = e.target.value === "" ? null : Math.max(0, Number(e.target.value));
                  mudarOrc({ frete: v });
                }}
                placeholder="0,00"
                className="campo w-full text-right"
              />
            </label>
            <label className="flex items-center gap-1.5 pb-2 text-xs text-medio/70">
              <input
                type="checkbox"
                checked={orc.fretePagoPelaEmpresa}
                onChange={(e) => mudarOrc({ fretePagoPelaEmpresa: e.target.checked })}
                className="h-3.5 w-3.5 accent-tiffany"
              />
              Pago pela empresa
            </label>
          </div>

          <div className="space-y-0.5 border-t border-black/5 pt-2 text-xs">
            <div className="flex justify-between text-medio/60">
              <span>Subtotal</span>
              <span>{formatarBRL(subtotal)}</span>
            </div>
            {descValor > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Desconto {orc.cupom ? `· cupom ${orc.cupom}` : ""}</span>
                <span>− {formatarBRL(descValor)}</span>
              </div>
            )}
            <div className="flex justify-between text-medio/60">
              <span>Frete</span>
              <span>{orc.fretePagoPelaEmpresa ? "empresa" : `+ ${formatarBRL(freteAplicado)}`}</span>
            </div>
            <div className="flex justify-between border-t border-black/10 pt-1 text-sm font-bold text-escuro">
              <span>Total</span>
              <span className="text-tiffany">{formatarBRL(totalFinal)}</span>
            </div>
            {mostrarGarantia && totalGarantia > 0 && (
              <div className="flex justify-between text-[11px] text-medio/50">
                <span>Garantia (não cobrado)</span>
                <span className="line-through">{formatarBRL(totalGarantia)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!mostrarResumo && usos && usos.length > 0 && subtotal > 0 && (
        <div className="flex items-center justify-between border-t border-black/5 pt-2 text-xs">
          <span className="text-medio/60">Total (cobrável)</span>
          <span className="font-semibold text-escuro">{formatarBRL(subtotal)}</span>
        </div>
      )}

      {/* 3. FORMA DE PAGAMENTO (Fatia 3.18): so no orcamento do negocio, abaixo do
          resumo e acima do envio. Metadado — nao altera o total. */}
      {mostrarResumo && negocioId && usos && (
        <SecaoPagamento
          linhas={pagamentos}
          onChange={mudarPagamentos}
          totalFinal={totalFinal}
        />
      )}

      {/* 4. ENVIAR orcamento ao cliente (PDF). As DECISOES (Pendente|Perdido +
          Ganho) ficam logo abaixo, no NegocioAcoes que segue este bloco. */}
      {permitirEnvio && negocioId && (
        <div className="border-t border-black/5 pt-3">
          {!confirmandoEnvio ? (
            <button
              onClick={() => setConfirmandoEnvio(true)}
              disabled={!usos || usos.length === 0 || enviandoOrc}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-tiffany bg-tiffany/5 px-3 py-2 text-sm font-semibold text-tiffany transition-colors hover:bg-tiffany/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviandoOrc ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar orçamento ao cliente
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-tiffany/30 bg-tiffany/[0.03] p-2.5">
              <p className="text-xs text-medio/70">
                Enviar o orçamento em PDF para{" "}
                <span className="font-semibold text-escuro">
                  {clienteNome || clienteTelefone || "o cliente"}
                </span>
                ?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmandoEnvio(false)}
                  disabled={enviandoOrc}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-medio hover:bg-black/5 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void enviarOrcamento()}
                  disabled={enviandoOrc}
                  className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
                >
                  {enviandoOrc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Enviar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function GrupoPecas({
  titulo,
  pecas,
  mostrarEstoque,
  onEscolher,
}: {
  titulo: string;
  pecas: PecaCat[];
  mostrarEstoque: boolean;
  onEscolher: (p: PecaCat) => void;
}) {
  return (
    <div>
      <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-medio/40">{titulo}</p>
      <div className="space-y-1">
        {pecas.map((p) => (
          <button
            key={p.id}
            onClick={() => onEscolher(p)}
            className="flex w-full items-center gap-2 rounded-lg border border-black/5 px-2.5 py-1.5 text-left hover:border-tiffany/40 hover:bg-tiffany/[0.03]"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-escuro">
              {p.nome}
              {p.modelo && <span className="text-medio/50"> {p.modelo}</span>}
            </span>
            {p.voltagem && (
              <span className="shrink-0 rounded bg-tiffany/10 px-1.5 py-0.5 text-[10px] font-semibold text-tiffany">
                {p.voltagem}
              </span>
            )}
            <span className="shrink-0 text-xs text-medio/60">
              {p.precoSugerido != null ? formatarBRL(p.precoSugerido) : "—"}
            </span>
            {mostrarEstoque && p.estoque != null && (
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  p.estoque <= 0 ? "bg-erro/10 text-erro" : "bg-black/5 text-medio/70"
                }`}
              >
                {p.estoque}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BlocoOrcamento({
  negocioId,
  finalidade,
  clienteNome,
  clienteTelefone,
  onMensagemEnviada,
}: {
  negocioId: string;
  finalidade: "VENDA" | "POS_VENDA";
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  onMensagemEnviada?: (msg: MensagemItem) => void;
}) {
  const ehPos = finalidade === "POS_VENDA";
  const salvarModelo = useCallback(
    async (modelo: string | null): Promise<boolean> => {
      try {
        const r = await fetch(`/api/negocios/${negocioId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modeloProdutoCliente: modelo }),
        });
        return r.ok;
      } catch {
        return false;
      }
    },
    [negocioId],
  );

  return (
    <EditorOrcamento
      titulo="Orçamento"
      icone={ehPos ? "peca" : "carrinho"}
      modo={ehPos ? "POS_VENDA" : "VENDA"}
      listUrl={`/api/negocios/${negocioId}/pecas-necessarias`}
      addUrl={`/api/negocios/${negocioId}/pecas-necessarias`}
      removeUrl={(usoId) => `/api/negocios/${negocioId}/pecas-necessarias/${usoId}`}
      qtdUrl={(usoId) => `/api/negocios/${negocioId}/pecas-necessarias/${usoId}`}
      modeloEditavel={ehPos}
      salvarModelo={ehPos ? salvarModelo : undefined}
      mostrarGarantia={ehPos}
      mostrarEstoque={ehPos}
      movimentaEstoque={false}
      mostrarResumo
      negocioId={negocioId}
      permitirEnvio
      clienteNome={clienteNome}
      clienteTelefone={clienteTelefone}
      onMensagemEnviada={onMensagemEnviada}
    />
  );
}

export function BlocoPecasLocal({
  itemLocalId,
  modelo,
  onMudou,
}: {
  itemLocalId: string;
  modelo?: string | null;
  onMudou?: () => void;
}) {
  return (
    <EditorOrcamento
      titulo="Peças aplicadas"
      icone="peca"
      modo="LOCAL"
      listUrl={`/api/local/${itemLocalId}/pecas`}
      addUrl={`/api/local/${itemLocalId}/pecas`}
      removeUrl={(usoId) => `/api/local/${itemLocalId}/pecas/${usoId}`}
      modeloEditavel={false}
      modeloFixo={modelo ?? null}
      mostrarGarantia
      mostrarEstoque
      movimentaEstoque
      mostrarResumo={false}
      onMudou={onMudou}
    />
  );
}

// ---------------------------------------------------------------------------
// "Orcamentos anteriores" (historico numerado do cliente). Colapsado por padrao.
// ---------------------------------------------------------------------------
type OrcamentoHist = {
  id: string;
  numeroFormatado: string;
  finalidade: string;
  decisao: string;
  total: number;
  totalGarantia: number | null;
  pagamentos: LinhaPagamento[];
  qtdItens: number;
  criadoEm: string;
  itens: {
    id: string;
    descricao: string;
    quantidade: number;
    valorUnitario: number;
    garantia: boolean;
  }[];
};

const DECISAO_META: Record<string, { rotulo: string; classe: string }> = {
  GANHO: { rotulo: "Ganho", classe: "text-green-600" },
  PENDENTE: { rotulo: "Pendente", classe: "text-amber-600" },
  PERDIDO: { rotulo: "Perdido", classe: "text-erro" },
};

export function OrcamentosAnteriores({ leadId }: { leadId: string }) {
  const [aberto, setAberto] = useState(false);
  const [orcs, setOrcs] = useState<OrcamentoHist[] | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto || orcs !== null) return;
    fetch(`/api/leads/${leadId}/orcamentos`)
      .then((r) => (r.ok ? r.json() : { orcamentos: [] }))
      .then((d) => setOrcs(d.orcamentos ?? []))
      .catch(() => setOrcs([]));
  }, [aberto, orcs, leadId]);

  return (
    <section className="rounded-xl border border-black/5 bg-white">
      <button
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <ReceiptText className="h-3.5 w-3.5 text-medio/50" />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-medio/50">
          Orçamentos anteriores
        </span>
        <ChevronRight className={`h-4 w-4 text-medio/40 transition-transform ${aberto ? "rotate-90" : ""}`} />
      </button>

      {aberto && (
        <div className="px-4 pb-4">
          {orcs === null ? (
            <div className="flex justify-center py-4 text-medio/40">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : orcs.length === 0 ? (
            <p className="py-2 text-xs text-medio/50">Nenhum orçamento registrado ainda.</p>
          ) : (
            <ul className="space-y-1.5">
              {orcs.map((o) => {
                const dec = DECISAO_META[o.decisao] ?? { rotulo: o.decisao, classe: "text-medio" };
                const exp = expandido === o.id;
                return (
                  <li key={o.id} className="overflow-hidden rounded-lg border border-black/5 bg-fundo">
                    <button
                      onClick={() => setExpandido(exp ? null : o.id)}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
                    >
                      <ChevronRight
                        className={`h-3.5 w-3.5 shrink-0 text-medio/40 transition-transform ${exp ? "rotate-90" : ""}`}
                      />
                      <span className="shrink-0 font-mono text-xs font-semibold text-escuro">
                        {o.numeroFormatado}
                      </span>
                      <span className="shrink-0 text-[11px] text-medio/50">
                        {new Date(o.criadoEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </span>
                      <span className={`shrink-0 text-[11px] font-semibold ${dec.classe}`}>{dec.rotulo}</span>
                      <span className="ml-auto shrink-0 text-xs font-medium text-escuro">
                        {formatarBRL(o.total)}
                      </span>
                    </button>
                    {exp && (
                      <div className="border-t border-black/5">
                        <ul className="space-y-1 px-2.5 py-2 pl-7">
                          {o.itens.map((it) => (
                            <li key={it.id} className="flex items-center gap-2 text-[11px]">
                              <span className="min-w-0 flex-1 truncate text-medio/70">
                                <span className="text-medio/50">{it.quantidade}x </span>
                                {it.descricao}
                              </span>
                              {it.garantia ? (
                                <span className="flex shrink-0 items-center gap-0.5 text-tiffany">
                                  <ShieldCheck className="h-3 w-3" /> Garantia
                                </span>
                              ) : (
                                <span className="shrink-0 text-medio/60">
                                  {formatarBRL(it.quantidade * it.valorUnitario)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {/* Forma(s) de pagamento do snapshot (Fatia 3.18). */}
                        {o.pagamentos.length > 0 && (
                          <div className="border-t border-black/5 px-2.5 py-2 pl-7">
                            <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-medio/40">
                              <CreditCard className="h-3 w-3" /> Pagamento
                            </p>
                            <ul className="space-y-0.5 text-[11px] text-medio/60">
                              {o.pagamentos.map((p, i) => (
                                <li key={i}>{formatarLinhaPagamento(p)}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
