"use client";

// Rodape da thread: textarea de envio + respostas rapidas (botao e atalho "/").
// Enter envia, Shift+Enter quebra linha. Digitar "/" abre a lista filtravel; ao
// escolher, o texto e inserido no compositor (editavel antes de enviar).
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Send, Loader2, Zap, X, Package } from "lucide-react";
import type { MensagemItem } from "./tipos";
import { SeletorProduto, mensagemProduto } from "@/components/loja/SeletorProduto";
import type { ProdutoLoja } from "@/components/loja/tipos";
import {
  detectarVariaveis,
  aplicarModelo,
  sortearRedacao,
  INFO_VARIAVEL,
  type LeadModelo,
} from "@/lib/modelos";
import { useAgente } from "@/components/shell/AgenteContext";

type Resposta = {
  id: string;
  titulo: string;
  atalho: string | null;
  texto: string;
  categoria?: string;
  finalidade?: "VENDA" | "POS_VENDA" | null;
  variacoes?: string[];
};

type Instancia = {
  id: string;
  nome: string;
  numero: string | null;
  finalidade: "VENDA" | "POS_VENDA";
};

export function Compositor({
  conversaId,
  onEnviada,
  ehAdmin = false,
  finalidade,
  instanciaIdAtual,
  lead,
}: {
  conversaId: string;
  onEnviada: (msg: MensagemItem) => void;
  ehAdmin?: boolean;
  finalidade?: "VENDA" | "POS_VENDA";
  instanciaIdAtual?: string | null;
  lead?: LeadModelo | null;
}) {
  const agente = useAgente();
  const ctxAgente = agente ? { nome: agente.nome } : null;
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Numero de envio: as instancias ativas da finalidade da conversa. O padrao e
  // o numero que o cliente usou por ultimo (instanciaIdAtual); o atendente pode
  // escolher outro. A resposta do cliente sempre cai na conversa unificada.
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [instanciaSel, setInstanciaSel] = useState<string | null>(
    instanciaIdAtual ?? null,
  );
  useEffect(() => {
    setInstanciaSel(instanciaIdAtual ?? null);
  }, [instanciaIdAtual, conversaId]);
  useEffect(() => {
    const qs = finalidade ? `?finalidade=${finalidade}` : "";
    fetch(`/api/instancias${qs}`)
      .then((r) => (r.ok ? r.json() : { instancias: [] }))
      .then((d) => setInstancias(d.instancias ?? []))
      .catch(() => undefined);
  }, [finalidade]);

  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [mostrar, setMostrar] = useState(false);
  const [busca, setBusca] = useState("");
  const [seletorProduto, setSeletorProduto] = useState(false);
  // Modelo escolhido que pede variaveis digitadas (cupom etc.). redacao = a
  // redacao sorteada (texto principal ou uma variacao).
  const [modeloPendente, setModeloPendente] = useState<{
    resposta: Resposta;
    redacao: string;
    digitadas: string[];
    valores: Record<string, string>;
  } | null>(null);

  function inserirTexto(novoTrecho: string) {
    const base = texto.trim();
    const novo =
      base === "" || base.startsWith("/") ? novoTrecho : `${base}\n${novoTrecho}`;
    setTexto(novo);
    setMostrar(false);
    setBusca("");
    setTimeout(() => ref.current?.focus(), 0);
  }

  function inserirProduto(p: ProdutoLoja) {
    const msg = mensagemProduto(p);
    const base = texto.trim();
    setTexto(base === "" || base.startsWith("/") ? msg : `${base}\n${msg}`);
    setSeletorProduto(false);
    setTimeout(() => ref.current?.focus(), 0);
  }

  useEffect(() => {
    fetch("/api/respostas")
      .then((r) => (r.ok ? r.json() : { respostas: [] }))
      .then((d) => setRespostas(d.respostas ?? []))
      .catch(() => undefined);
  }, []);

  const q = busca.toLowerCase().trim();
  const filtradas = q
    ? respostas.filter(
        (r) =>
          r.titulo.toLowerCase().includes(q) ||
          (r.atalho ?? "").toLowerCase().includes(q) ||
          r.texto.toLowerCase().includes(q),
      )
    : respostas;

  function aoMudar(v: string) {
    setTexto(v);
    if (v.startsWith("/")) {
      setMostrar(true);
      setBusca(v.slice(1));
    } else if (v === "") {
      setMostrar(false);
    }
  }

  function selecionar(r: Resposta) {
    // Sorteia uma redacao entre [texto, ...variacoes].
    const redacao = sortearRedacao([r.texto, ...(r.variacoes ?? [])]);
    const { digitadas } = detectarVariaveis(redacao);
    if (digitadas.length > 0) {
      // Abre mini-form para o usuario preencher cupom/desconto/etc.
      setModeloPendente({
        resposta: r,
        redacao,
        digitadas,
        valores: Object.fromEntries(digitadas.map((d) => [d, ""])),
      });
      setMostrar(false);
      setBusca("");
      return;
    }
    // So automaticas (ou nenhuma): aplica e insere direto.
    inserirTexto(aplicarModelo(redacao, { lead, agente: ctxAgente }));
  }

  function confirmarModelo() {
    if (!modeloPendente) return;
    const final = aplicarModelo(modeloPendente.redacao, {
      lead,
      agente: ctxAgente,
      valoresDigitados: modeloPendente.valores,
    });
    setModeloPendente(null);
    inserirTexto(final);
  }

  // Re-sorteia a redacao do modelo pendente (botao "variar").
  function variarRedacao() {
    setModeloPendente((m) => {
      if (!m) return m;
      const r = m.resposta;
      const nova = sortearRedacao([r.texto, ...(r.variacoes ?? [])]);
      const digitadas = detectarVariaveis(nova).digitadas;
      return {
        ...m,
        redacao: nova,
        digitadas,
        valores: Object.fromEntries(
          digitadas.map((d) => [d, m.valores[d] ?? ""]),
        ),
      };
    });
  }

  async function enviar() {
    const valor = texto.trim();
    if (!valor || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/mensagens/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversaId,
          texto: valor,
          ...(instanciaSel ? { instanciaId: instanciaSel } : {}),
        }),
      });
      const d = await r.json().catch(() => null);
      if (d?.mensagem) onEnviada(d.mensagem as MensagemItem);
      if (!r.ok) {
        setErro("Falha ao enviar. Verifique a conexao com o WhatsApp.");
      }
      setTexto("");
      ref.current?.focus();
    } catch {
      setErro("Nao foi possivel enviar agora.");
    } finally {
      setEnviando(false);
    }
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape" && mostrar) {
      setMostrar(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      // Lista aberta via "/": Enter escolhe a primeira opcao.
      if (mostrar && texto.startsWith("/") && filtradas.length > 0) {
        e.preventDefault();
        selecionar(filtradas[0]);
        return;
      }
      e.preventDefault();
      void enviar();
    }
  }

  return (
    <div className="relative border-t border-black/5 bg-white p-3">
      {erro && <p className="mb-2 px-1 text-xs text-erro">{erro}</p>}

      {mostrar && (
        <div className="absolute bottom-full left-3 right-3 mb-1 max-h-72 overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-black/5 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-medio/50">
              Respostas rapidas
            </p>
            <button
              onClick={() => setMostrar(false)}
              className="rounded p-0.5 text-medio/50 hover:bg-black/5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="scroll-fino max-h-60 overflow-y-auto">
            {filtradas.length === 0 ? (
              <p className="p-4 text-center text-sm text-medio/50">
                Nenhuma resposta.
              </p>
            ) : (
              filtradas.map((r) => (
                <button
                  key={r.id}
                  onClick={() => selecionar(r)}
                  className="flex w-full flex-col gap-0.5 border-b border-black/5 px-3 py-2 text-left last:border-0 hover:bg-fundo"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-escuro">
                      {r.titulo}
                    </span>
                    {r.atalho && (
                      <span className="rounded bg-tiffany/10 px-1.5 py-0.5 text-[10px] font-medium text-tiffany">
                        {r.atalho}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-medio/60">
                    {r.texto}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {modeloPendente && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="modal-in w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-escuro">
                {modeloPendente.resposta.titulo}
              </h3>
              <button
                onClick={() => setModeloPendente(null)}
                className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-2 text-xs text-medio/60">
              Preencha os campos para inserir a mensagem.
            </p>
            {(modeloPendente.resposta.variacoes?.length ?? 0) > 0 && (
              <button
                type="button"
                onClick={variarRedacao}
                className="mb-3 rounded-lg border border-black/10 px-2.5 py-1 text-xs font-medium text-medio hover:bg-black/5"
              >
                Variar redacao
              </button>
            )}
            <div className="space-y-2.5">
              {modeloPendente.digitadas.map((d) => (
                <div key={d}>
                  <label className="mb-1 block text-xs font-medium text-medio/70">
                    {INFO_VARIAVEL[d]?.rotulo ?? d}
                  </label>
                  <input
                    autoFocus={d === modeloPendente.digitadas[0]}
                    value={modeloPendente.valores[d]}
                    onChange={(e) =>
                      setModeloPendente((m) =>
                        m
                          ? {
                              ...m,
                              valores: { ...m.valores, [d]: e.target.value },
                            }
                          : m,
                      )
                    }
                    placeholder={INFO_VARIAVEL[d]?.exemplo ?? ""}
                    className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setModeloPendente(null)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-medio hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarModelo}
                className="rounded-lg bg-tiffany px-4 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro"
              >
                Inserir
              </button>
            </div>
          </div>
        </div>
      )}

      {seletorProduto && (
        <SeletorProduto
          ehAdmin={ehAdmin}
          onEscolher={inserirProduto}
          onFechar={() => setSeletorProduto(false)}
        />
      )}

      {instancias.length > 1 && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="text-[11px] font-medium text-medio/60">
            Responder por:
          </span>
          <select
            value={instanciaSel ?? ""}
            onChange={(e) => setInstanciaSel(e.target.value || null)}
            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-xs text-escuro outline-none focus:border-tiffany"
          >
            {!instanciaSel && <option value="">Numero padrao</option>}
            {instancias.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
                {i.numero ? ` (${i.numero})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          onClick={() => {
            setMostrar((v) => !v);
            setBusca("");
          }}
          title="Respostas rapidas"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors ${
            mostrar
              ? "border-tiffany bg-tiffany/10 text-tiffany"
              : "border-black/10 text-medio hover:bg-black/5"
          }`}
        >
          <Zap className="h-5 w-5" />
        </button>
        <button
          onClick={() => setSeletorProduto(true)}
          title="Enviar produto"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-black/10 text-medio transition-colors hover:bg-black/5"
        >
          <Package className="h-5 w-5" />
        </button>
        <textarea
          ref={ref}
          value={texto}
          onChange={(e) => aoMudar(e.target.value)}
          onKeyDown={aoTeclar}
          rows={1}
          placeholder='Escreva uma mensagem... ("/" para respostas rapidas)'
          className="scroll-fino max-h-32 min-h-[44px] flex-1 resize-none rounded-lg border border-black/10 bg-fundo px-3 py-2.5 text-sm outline-none transition-colors focus:border-tiffany"
        />
        <button
          onClick={() => void enviar()}
          disabled={enviando || !texto.trim()}
          title="Enviar (Enter)"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-tiffany text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-50"
        >
          {enviando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
