"use client";

// Admin > Vendedores: CRUD de agentes (criar, editar, ativar/desativar, resetar
// senha). Restrito a ADMIN (API valida tambem).
import { useState, useEffect, useCallback } from "react";
import { UserPlus, Loader2, X, Pencil } from "lucide-react";

type Agente = {
  id: string;
  nome: string;
  email: string;
  papel: string;
  telefone: string | null;
  avatarUrl: string | null;
  ativo: boolean;
  ultimoLogin: string | null;
  criadoEm: string;
};

const PAPEIS = ["VENDEDOR", "POS_VENDA", "ADMIN"];
const ROTULO_PAPEL: Record<string, string> = {
  VENDEDOR: "Vendedor",
  POS_VENDA: "Pos-venda",
  ADMIN: "Administrador",
};

export function VendedoresAdmin() {
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState<Agente | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/admin/vendedores");
    if (r.ok) {
      const d = await r.json();
      setAgentes(d.agentes);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function alternarAtivo(a: Agente) {
    await fetch(`/api/admin/vendedores/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !a.ativo }),
    });
    await carregar();
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Vendedores"
        subtitulo="Crie e gerencie os agentes do CRM"
        acao={
          <button
            onClick={() => setCriando(true)}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro"
          >
            <UserPlus className="h-4 w-4" /> Novo vendedor
          </button>
        }
      />

      {carregando ? (
        <SkeletonTabela />
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/5 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-medio/50">
              <tr>
                <th className="px-4 py-2.5 font-medium">Nome</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Papel</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {agentes.map((a) => (
                <tr key={a.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3 font-medium text-escuro">{a.nome}</td>
                  <td className="px-4 py-3 text-medio/70">{a.email}</td>
                  <td className="px-4 py-3 text-medio/70">
                    {ROTULO_PAPEL[a.papel] ?? a.papel}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void alternarAtivo(a)}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.ativo
                          ? "bg-green-100 text-green-700"
                          : "bg-black/10 text-medio/60"
                      }`}
                    >
                      {a.ativo ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditando(a)}
                      className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(criando || editando) && (
        <ModalVendedor
          agente={editando}
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

function ModalVendedor({
  agente,
  onFechar,
  onSalvo,
}: {
  agente: Agente | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const edicao = Boolean(agente);
  const [nome, setNome] = useState(agente?.nome ?? "");
  const [email, setEmail] = useState(agente?.email ?? "");
  const [senha, setSenha] = useState("");
  const [papel, setPapel] = useState(agente?.papel ?? "VENDEDOR");
  const [telefone, setTelefone] = useState(agente?.telefone ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    if (!nome.trim() || !email.trim() || (!edicao && !senha)) {
      setErro("Preencha nome, email e senha.");
      return;
    }
    setSalvando(true);
    try {
      const corpo: Record<string, unknown> = {
        nome,
        email,
        papel,
        telefone,
      };
      if (senha) corpo.senha = senha;
      const r = await fetch(
        edicao
          ? `/api/admin/vendedores/${agente!.id}`
          : "/api/admin/vendedores",
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
      onSalvo();
    } catch {
      setErro("Falha ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-escuro">
            {edicao ? "Editar vendedor" : "Novo vendedor"}
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
            rotulo="Email"
            valor={email}
            onChange={setEmail}
            tipo="email"
          />
          <CampoTexto
            rotulo={edicao ? "Nova senha (opcional)" : "Senha"}
            valor={senha}
            onChange={setSenha}
            tipo="password"
          />
          <CampoTexto
            rotulo="Telefone"
            valor={telefone}
            onChange={setTelefone}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-escuro">
              Papel
            </label>
            <select
              value={papel}
              onChange={(e) => setPapel(e.target.value)}
              className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
            >
              {PAPEIS.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PAPEL[p]}
                </option>
              ))}
            </select>
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

export function CampoTexto({
  rotulo,
  valor,
  onChange,
  tipo = "text",
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  tipo?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-escuro">
        {rotulo}
      </label>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
      />
    </div>
  );
}

export function Cabecalho({
  titulo,
  subtitulo,
  acao,
}: {
  titulo: string;
  subtitulo?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-escuro">{titulo}</h2>
        {subtitulo && <p className="text-sm text-medio/60">{subtitulo}</p>}
      </div>
      {acao}
    </div>
  );
}

export function SkeletonTabela() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}
