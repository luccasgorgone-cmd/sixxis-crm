"use client";

// Admin > Respostas rapidas: CRUD + reordenar (drag). Modal para titulo, atalho,
// texto e ativo.
import { useState, useEffect, useCallback, useRef } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, GripVertical, Trash2, Pencil, X, Loader2 } from "lucide-react";
import { Cabecalho, SkeletonTabela, CampoTexto } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";
import { BadgeFinalidade } from "@/components/BadgeFinalidade";
import {
  CATEGORIAS_MODELO,
  rotuloCategoria,
  detectarVariaveis,
  aplicarModelo,
  sortearRedacao,
  INFO_VARIAVEL,
  VARIAVEIS_AUTOMATICAS,
  VARIAVEIS_DIGITADAS,
} from "@/lib/modelos";

type Resposta = {
  id: string;
  titulo: string;
  atalho: string | null;
  texto: string;
  ativo: boolean;
  ordem: number;
  categoria: string;
  finalidade: "VENDA" | "POS_VENDA" | null;
  variacoes: string[];
};

export function RespostasAdmin() {
  const [respostas, setRespostas] = useState<Resposta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [editando, setEditando] = useState<Resposta | null>(null);
  const [criando, setCriando] = useState(false);
  const toast = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/respostas");
      if (r.ok) {
        setRespostas((await r.json()).respostas);
        setErro(false);
      } else {
        setErro(true);
      }
    } catch {
      setErro(true);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function patch(id: string, body: Record<string, unknown>) {
    const r = await fetch(`/api/admin/respostas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      toast.sucesso("Resposta atualizada");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel salvar.");
    }
    await carregar();
  }

  async function remover(id: string) {
    const r = await fetch(`/api/admin/respostas/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.sucesso("Resposta removida");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel remover.");
    }
    await carregar();
  }

  async function aoFinalizar(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = respostas.map((x) => x.id);
    const novo = arrayMove(
      respostas,
      ids.indexOf(String(active.id)),
      ids.indexOf(String(over.id)),
    );
    setRespostas(novo);
    const r = await fetch("/api/admin/respostas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordem: novo.map((x) => x.id) }),
    });
    if (r.ok) {
      toast.sucesso("Ordem atualizada");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel reordenar.");
    }
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Modelos de mensagem"
        subtitulo="Atalhos e modelos (aniversario, cupom, retomada...) com variaveis. Use / no inbox."
        acao={
          <button
            onClick={() => setCriando(true)}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Novo modelo
          </button>
        }
      />

      {carregando ? (
        <SkeletonTabela />
      ) : erro ? (
        <EstadoErro
          mensagem="Nao foi possivel carregar."
          onRetry={() => void carregar()}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={aoFinalizar}
        >
          <SortableContext
            items={respostas.map((r) => r.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {respostas.map((r) => (
                <Linha
                  key={r.id}
                  resposta={r}
                  onAtivo={() => void patch(r.id, { ativo: !r.ativo })}
                  onEditar={() => setEditando(r)}
                  onRemover={() => void remover(r.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {(criando || editando) && (
        <Modal
          resposta={editando}
          onFechar={() => {
            setCriando(false);
            setEditando(null);
          }}
          onSalvo={async () => {
            setCriando(false);
            setEditando(null);
            await carregar();
          }}
        />
      )}
    </div>
  );
}

function Linha({
  resposta,
  onAtivo,
  onEditar,
  onRemover,
}: {
  resposta: Resposta;
  onAtivo: () => void;
  onEditar: () => void;
  onRemover: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: resposta.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-medio/40 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-escuro">{resposta.titulo}</p>
          <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/70">
            {rotuloCategoria(resposta.categoria)}
          </span>
          {resposta.finalidade ? (
            <BadgeFinalidade finalidade={resposta.finalidade} />
          ) : (
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-medio/60">
              Ambas
            </span>
          )}
          {resposta.atalho && (
            <span className="rounded bg-tiffany/10 px-1.5 py-0.5 text-[10px] font-medium text-tiffany">
              {resposta.atalho}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-medio/60">{resposta.texto}</p>
      </div>
      <button
        onClick={onAtivo}
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          resposta.ativo
            ? "bg-green-100 text-green-700"
            : "bg-black/10 text-medio/60"
        }`}
      >
        {resposta.ativo ? "Ativa" : "Inativa"}
      </button>
      <button
        onClick={onEditar}
        className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        onClick={onRemover}
        className="rounded-lg p-1.5 text-medio/50 hover:bg-black/5 hover:text-erro"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function Modal({
  resposta,
  onFechar,
  onSalvo,
}: {
  resposta: Resposta | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const edicao = Boolean(resposta);
  const [titulo, setTitulo] = useState(resposta?.titulo ?? "");
  const [atalho, setAtalho] = useState(resposta?.atalho ?? "");
  const [texto, setTexto] = useState(resposta?.texto ?? "");
  const [categoria, setCategoria] = useState(resposta?.categoria ?? "geral");
  const [finalidade, setFinalidade] = useState<string>(
    resposta?.finalidade ?? "AMBAS",
  );
  const [variacoes, setVariacoes] = useState<string[]>(resposta?.variacoes ?? []);
  const [sorteio, setSorteio] = useState(0); // re-roll do preview
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const toast = useToast();
  const refTexto = useRef<HTMLTextAreaElement>(null);

  // Insere uma variavel na posicao do cursor do textarea.
  function inserirVar(nome: string) {
    const el = refTexto.current;
    const token = `{${nome}}`;
    if (!el) {
      setTexto((t) => t + token);
      return;
    }
    const ini = el.selectionStart ?? texto.length;
    const fim = el.selectionEnd ?? texto.length;
    const novo = texto.slice(0, ini) + token + texto.slice(fim);
    setTexto(novo);
    setTimeout(() => {
      el.focus();
      const pos = ini + token.length;
      el.setSelectionRange(pos, pos);
    }, 0);
  }

  // Preview com dados de exemplo. Quando ha variacoes, sorteia uma redacao
  // (re-rola via botao "variar"); senao usa o texto principal.
  const redacoes = [texto, ...variacoes].filter((t) => t.trim());
  // sorteio entra como dependencia implicita (muda a cada clique no botao).
  void sorteio;
  const baseRedacao =
    redacoes.length > 1 ? sortearRedacao(redacoes) : texto;
  const preview = aplicarModelo(baseRedacao, {
    lead: { nomeEfetivo: "Maria Silva", empresa: "Acme" },
    valoresDigitados: Object.fromEntries(
      VARIAVEIS_DIGITADAS.map((v) => [v, INFO_VARIAVEL[v].exemplo]),
    ),
  });
  const usadas = detectarVariaveis(redacoes.join(" "));

  async function salvar() {
    setErro(null);
    if (!titulo.trim() || !texto.trim()) {
      setErro("Preencha titulo e texto.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch(
        edicao ? `/api/admin/respostas/${resposta!.id}` : "/api/admin/respostas",
        {
          method: edicao ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo,
            atalho,
            texto,
            categoria,
            finalidade: finalidade === "AMBAS" ? null : finalidade,
            variacoes: variacoes.map((v) => v.trim()).filter(Boolean),
          }),
        },
      );
      if (!r.ok) {
        setErro("Nao foi possivel salvar.");
        setSalvando(false);
        return;
      }
      toast.sucesso("Modelo salvo");
      onSalvo();
    } catch {
      setErro("Falha ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in scroll-fino max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-escuro">
            {edicao ? "Editar modelo" : "Novo modelo"}
          </h3>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          <CampoTexto rotulo="Titulo" valor={titulo} onChange={setTitulo} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-escuro">
                Categoria
              </label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
              >
                {CATEGORIAS_MODELO.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-escuro">
                Finalidade
              </label>
              <select
                value={finalidade}
                onChange={(e) => setFinalidade(e.target.value)}
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
              >
                <option value="VENDA">Venda</option>
                <option value="POS_VENDA">Pos-venda</option>
                <option value="AMBAS">Ambas</option>
              </select>
            </div>
          </div>
          <CampoTexto
            rotulo="Atalho (ex.: /saudacao)"
            valor={atalho}
            onChange={setAtalho}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-escuro">
              Texto
            </label>
            <textarea
              ref={refTexto}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={4}
              className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...VARIAVEIS_AUTOMATICAS, ...VARIAVEIS_DIGITADAS].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => inserirVar(v)}
                  title={
                    INFO_VARIAVEL[v].tipo === "auto"
                      ? "Automatica (do cliente)"
                      : "Digitada (na hora)"
                  }
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    INFO_VARIAVEL[v].tipo === "auto"
                      ? "border-tiffany/30 bg-tiffany/5 text-tiffany hover:bg-tiffany/10"
                      : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
                  }`}
                >
                  {`{${v}}`}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-medio/50">
              <span className="text-tiffany">Tiffany</span> = automaticas (vem do
              cliente). <span className="text-violet-700">Roxas</span> = digitadas
              no envio.
            </p>
          </div>

          {/* Variacoes (redacoes alternativas da mesma intencao) */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm font-medium text-escuro">
                Variacoes de redacao
              </label>
              <button
                type="button"
                onClick={() => setVariacoes((v) => [...v, ""])}
                className="flex items-center gap-1 rounded-lg border border-black/10 px-2 py-1 text-xs font-medium text-medio hover:bg-black/5"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </button>
            </div>
            <p className="mb-2 text-[11px] text-medio/50">
              Redacoes diferentes da mesma mensagem; cada destinatario recebe uma
              sorteada. Use as mesmas variaveis.
            </p>
            <div className="space-y-2">
              {variacoes.map((vtxt, idx) => (
                <div key={idx} className="flex gap-2">
                  <textarea
                    value={vtxt}
                    onChange={(e) =>
                      setVariacoes((arr) =>
                        arr.map((x, i) => (i === idx ? e.target.value : x)),
                      )
                    }
                    rows={2}
                    placeholder={`Variacao ${idx + 1}`}
                    className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setVariacoes((arr) => arr.filter((_, i) => i !== idx))
                    }
                    aria-label="Remover variacao"
                    className="shrink-0 rounded-lg p-1.5 text-medio/50 hover:bg-black/5 hover:text-erro"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-black/5 bg-fundo p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-medio/50">
                Preview (dados de exemplo)
              </p>
              {redacoes.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSorteio((n) => n + 1)}
                  className="rounded-lg border border-black/10 px-2 py-0.5 text-[11px] font-medium text-medio hover:bg-black/5"
                >
                  Variar
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm text-escuro">
              {preview || "Escreva o texto para ver o preview."}
            </p>
            {usadas.digitadas.length > 0 && (
              <p className="mt-2 text-[11px] text-medio/60">
                Pedira ao enviar: {usadas.digitadas.join(", ")}
              </p>
            )}
            {redacoes.length > 1 && (
              <p className="mt-1 text-[11px] text-medio/50">
                {redacoes.length} redacoes — uma e sorteada por destinatario.
              </p>
            )}
          </div>
        </div>
        {erro && <p className="mt-3 text-xs text-erro">{erro}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onFechar}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
