"use client";

// Modal de criar/editar Tarefa da agenda. Cliente opcional (datalist com os
// clientes do usuario). "Lembrar antes" gera o alerta antecipado no sino.
import { useState, useEffect } from "react";
import { X, Check, Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { paraInputLocal } from "./datas";

export type TarefaEdicao = {
  id: string;
  titulo: string;
  descricao: string | null;
  dataHora: string;
  duracaoMin: number | null;
  leadId: string | null;
  lembrarAntesMin: number | null;
};

const ALERTAS: { valor: number | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Sem alerta" },
  { valor: 5, rotulo: "5 min antes" },
  { valor: 15, rotulo: "15 min antes" },
  { valor: 30, rotulo: "30 min antes" },
  { valor: 60, rotulo: "1 hora antes" },
  { valor: 1440, rotulo: "1 dia antes" },
];

type ClienteOpcao = { leadId: string; nome: string; telefone: string };

export function ModalTarefa({
  tarefa,
  dataInicial,
  onFechar,
  onSalvo,
}: {
  tarefa?: TarefaEdicao | null;
  dataInicial?: Date;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const edicao = !!tarefa;

  const [titulo, setTitulo] = useState(tarefa?.titulo ?? "");
  const [descricao, setDescricao] = useState(tarefa?.descricao ?? "");
  const [dataHora, setDataHora] = useState(
    paraInputLocal(
      tarefa ? new Date(tarefa.dataHora) : (dataInicial ?? proximaHora()),
    ),
  );
  const [duracao, setDuracao] = useState(
    tarefa?.duracaoMin ? String(tarefa.duracaoMin) : "",
  );
  const [alerta, setAlerta] = useState<number | "">(
    tarefa?.lembrarAntesMin ?? "",
  );
  const [clienteNome, setClienteNome] = useState("");
  const [leadId, setLeadId] = useState<string | null>(tarefa?.leadId ?? null);
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Clientes do usuario para o datalist (uma vez).
  useEffect(() => {
    fetch("/api/clientes?periodo=ano")
      .then((r) => (r.ok ? r.json() : { clientes: [] }))
      .then((d) => {
        const lista: ClienteOpcao[] = (d.clientes ?? []).map(
          (c: { leadId: string; nome: string; telefone: string }) => ({
            leadId: c.leadId,
            nome: c.nome,
            telefone: c.telefone,
          }),
        );
        setClientes(lista);
        if (tarefa?.leadId) {
          const atual = lista.find((c) => c.leadId === tarefa.leadId);
          if (atual) setClienteNome(atual.nome);
        }
      })
      .catch(() => undefined);
  }, [tarefa?.leadId]);

  // Resolve o leadId pelo nome digitado (match exato no datalist).
  function aoMudarCliente(v: string) {
    setClienteNome(v);
    const achado = clientes.find((c) => c.nome === v);
    setLeadId(achado?.leadId ?? null);
  }

  async function salvar() {
    if (!titulo.trim()) {
      setErro("Informe um titulo.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const body = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      dataHora: new Date(dataHora).toISOString(),
      duracaoMin: duracao ? Number(duracao) : null,
      leadId,
      lembrarAntesMin: alerta === "" ? null : alerta,
    };
    try {
      const r = await fetch(
        edicao ? `/api/tarefas/${tarefa!.id}` : "/api/tarefas",
        {
          method: edicao ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (r.ok) {
        toast.sucesso(edicao ? "Tarefa atualizada." : "Tarefa criada.");
        onSalvo();
      } else {
        const d = await r.json().catch(() => null);
        setErro(d?.erro ?? "Nao foi possivel salvar.");
        setSalvando(false);
      }
    } catch {
      setErro("Falha de conexao.");
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!tarefa) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/tarefas/${tarefa.id}`, { method: "DELETE" });
      if (r.ok) {
        toast.sucesso("Tarefa excluida.");
        onSalvo();
      } else {
        toast.erro("Nao foi possivel excluir.");
        setSalvando(false);
      }
    } catch {
      toast.erro("Falha de conexao.");
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-escuro">
            {edicao ? "Editar tarefa" : "Nova tarefa"}
          </h3>
          <button
            onClick={onFechar}
            className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          <Campo rotulo="Titulo">
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Ligar para o cliente"
              className="campo w-full"
              autoFocus
            />
          </Campo>

          <Campo rotulo="Descricao">
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              placeholder="Detalhes (opcional)"
              className="campo scroll-fino w-full resize-none"
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Data e hora">
              <input
                type="datetime-local"
                value={dataHora}
                onChange={(e) => setDataHora(e.target.value)}
                className="campo w-full"
              />
            </Campo>
            <Campo rotulo="Duracao (min)">
              <input
                type="number"
                min={0}
                value={duracao}
                onChange={(e) => setDuracao(e.target.value)}
                placeholder="Opcional"
                className="campo w-full"
              />
            </Campo>
          </div>

          <Campo rotulo="Cliente (opcional)">
            <input
              list="agenda-clientes"
              value={clienteNome}
              onChange={(e) => aoMudarCliente(e.target.value)}
              placeholder="Vincular a um cliente"
              className="campo w-full"
            />
            <datalist id="agenda-clientes">
              {clientes.map((c) => (
                <option key={c.leadId} value={c.nome} />
              ))}
            </datalist>
          </Campo>

          <Campo rotulo="Lembrar antes">
            <select
              value={alerta}
              onChange={(e) =>
                setAlerta(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="campo w-full"
            >
              {ALERTAS.map((a) => (
                <option key={String(a.valor)} value={a.valor}>
                  {a.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          {erro && <p className="text-xs text-erro">{erro}</p>}

          <div className="flex items-center justify-between pt-1">
            {edicao ? (
              <button
                onClick={() => void excluir()}
                disabled={salvando}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-medio/60 hover:bg-red-50 hover:text-erro disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" /> Excluir
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                onClick={onFechar}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-medio hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => void salvar()}
                disabled={salvando}
                className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Salvar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-medio/70">
        {rotulo}
      </label>
      {children}
    </div>
  );
}

// Proxima hora cheia a partir de agora (default do datetime ao criar).
function proximaHora(): Date {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}
