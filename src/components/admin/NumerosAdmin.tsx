"use client";

// Admin > Numeros WhatsApp: CRUD de instancias Evolution, status de conexao e
// botao para apontar o webhook da instancia para este CRM.
import { useState, useEffect, useCallback } from "react";
import { Plus, Loader2, X, Pencil, RefreshCw, Webhook } from "lucide-react";
import {
  Cabecalho,
  SkeletonTabela,
  CampoTexto,
} from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";

type Numero = {
  id: string;
  nome: string;
  instanciaEvolution: string;
  numero: string | null;
  finalidade: string;
  ativo: boolean;
  statusConexao: string | null;
};

const COR_STATUS: Record<string, string> = {
  open: "bg-green-100 text-green-700",
  connecting: "bg-amber-100 text-amber-700",
  close: "bg-red-100 text-red-700",
};

export function NumerosAdmin() {
  const [numeros, setNumeros] = useState<Numero[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [statusCarregado, setStatusCarregado] = useState(false);
  const [editando, setEditando] = useState<Numero | null>(null);
  const [criando, setCriando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const toast = useToast();

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/numeros");
      if (r.ok) {
        setNumeros((await r.json()).numeros);
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

  // A2: carrega o status de conexao automaticamente ao montar (uma vez).
  useEffect(() => {
    if (carregando || statusCarregado || numeros.length === 0) return;
    setStatusCarregado(true);
    void (async () => {
      await Promise.all(
        numeros.map((n) =>
          fetch(`/api/admin/numeros/${n.id}/status`).catch(() => undefined),
        ),
      );
      await carregar();
    })();
  }, [carregando, statusCarregado, numeros, carregar]);

  async function patch(id: string, body: Record<string, unknown>) {
    const r = await fetch(`/api/admin/numeros/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) {
      toast.sucesso("Numero atualizado");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel salvar.");
    }
    await carregar();
  }

  async function remover(id: string) {
    const r = await fetch(`/api/admin/numeros/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.sucesso("Numero removido");
    } else {
      const d = await r.json().catch(() => null);
      toast.erro(d?.erro ?? "Nao foi possivel remover.");
    }
    await carregar();
  }

  async function atualizarStatus(id: string) {
    await fetch(`/api/admin/numeros/${id}/status`);
    await carregar();
  }

  async function apontarWebhook(id: string) {
    setAviso(null);
    const r = await fetch(`/api/admin/numeros/${id}/webhook`, {
      method: "POST",
    });
    const d = await r.json().catch(() => null);
    setAviso(
      r.ok
        ? `Webhook apontado para ${d?.url}`
        : `Falha ao apontar webhook: ${d?.erro ?? "erro"}`,
    );
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Numeros WhatsApp"
        subtitulo="Instancias Evolution e suas finalidades (venda / pos-venda)"
        acao={
          <button
            onClick={() => setCriando(true)}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <Plus className="h-4 w-4" /> Novo numero
          </button>
        }
      />

      {aviso && (
        <p className="mb-3 rounded-lg bg-tiffany/10 px-3 py-2 text-sm text-escuro">
          {aviso}
        </p>
      )}

      {carregando ? (
        <SkeletonTabela />
      ) : erro ? (
        <EstadoErro
          mensagem="Nao foi possivel carregar."
          onRetry={() => void carregar()}
        />
      ) : (
        <div className="space-y-2">
          {numeros.map((n) => (
            <div
              key={n.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-white p-3"
            >
              <div className="min-w-40 flex-1">
                <p className="text-sm font-semibold text-escuro">{n.nome}</p>
                <p className="text-xs text-medio/60">
                  {n.instanciaEvolution}
                  {n.numero ? ` · ${n.numero}` : ""}
                </p>
              </div>

              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  n.finalidade === "POS_VENDA"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-tiffany/10 text-tiffany"
                }`}
              >
                {n.finalidade === "POS_VENDA" ? "Pos-venda" : "Venda"}
              </span>

              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  COR_STATUS[n.statusConexao ?? ""] ?? "bg-black/10 text-medio/60"
                }`}
              >
                {n.statusConexao ?? "desconhecido"}
              </span>

              <button
                onClick={() => void atualizarStatus(n.id)}
                title="Atualizar status"
                className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={() => void apontarWebhook(n.id)}
                title="Apontar webhook pra ca"
                className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-tiffany"
              >
                <Webhook className="h-4 w-4" />
              </button>
              <button
                onClick={() => void patch(n.id, { ativo: !n.ativo })}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  n.ativo
                    ? "bg-green-100 text-green-700"
                    : "bg-black/10 text-medio/60"
                }`}
              >
                {n.ativo ? "Ativo" : "Inativo"}
              </button>
              <button
                onClick={() => setEditando(n)}
                className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ))}
          {numeros.length === 0 && (
            <p className="py-6 text-center text-sm text-medio/50">
              Nenhum numero cadastrado.
            </p>
          )}
        </div>
      )}

      {(criando || editando) && (
        <ModalNumero
          numero={editando}
          onFechar={() => {
            setCriando(false);
            setEditando(null);
          }}
          onSalvo={async () => {
            setCriando(false);
            setEditando(null);
            await carregar();
          }}
          onRemover={
            editando
              ? async () => {
                  await remover(editando.id);
                  setEditando(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function ModalNumero({
  numero,
  onFechar,
  onSalvo,
  onRemover,
}: {
  numero: Numero | null;
  onFechar: () => void;
  onSalvo: () => void;
  onRemover?: () => void;
}) {
  const edicao = Boolean(numero);
  const [nome, setNome] = useState(numero?.nome ?? "");
  const [instancia, setInstancia] = useState(numero?.instanciaEvolution ?? "");
  const [num, setNum] = useState(numero?.numero ?? "");
  const [finalidade, setFinalidade] = useState(numero?.finalidade ?? "VENDA");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const toast = useToast();

  async function salvar() {
    setErro(null);
    if (!nome.trim() || !instancia.trim()) {
      setErro("Preencha nome e instancia.");
      return;
    }
    setSalvando(true);
    try {
      const corpo = {
        nome,
        instanciaEvolution: instancia,
        numero: num,
        finalidade,
      };
      const r = await fetch(
        edicao ? `/api/admin/numeros/${numero!.id}` : "/api/admin/numeros",
        {
          method: edicao ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        },
      );
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setErro(d?.erro ?? "Nao foi possivel salvar.");
        setSalvando(false);
        return;
      }
      toast.sucesso(edicao ? "Numero salvo" : "Numero adicionado");
      onSalvo();
    } catch {
      setErro("Falha ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-escuro">
            {edicao ? "Editar numero" : "Novo numero"}
          </h3>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <CampoTexto rotulo="Nome" valor={nome} onChange={setNome} />
          <CampoTexto
            rotulo="Instancia Evolution"
            valor={instancia}
            onChange={setInstancia}
          />
          <CampoTexto
            rotulo="Numero (com DDI)"
            valor={num}
            onChange={setNum}
          />
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
            </select>
          </div>
        </div>

        {erro && <p className="mt-3 text-xs text-erro">{erro}</p>}

        <div className="mt-5 flex items-center justify-between">
          {onRemover ? (
            <button
              onClick={onRemover}
              className="text-sm font-medium text-erro hover:underline"
            >
              Remover
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
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
    </div>
  );
}
