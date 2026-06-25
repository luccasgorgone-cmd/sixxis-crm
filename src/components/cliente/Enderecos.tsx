"use client";

// Enderecos do cliente (multiplos): listar, adicionar, editar, remover e marcar
// principal. Ao digitar o CEP, busca no ViaCEP e auto-preenche logradouro/bairro/
// cidade/uf (com fallback manual quando o CEP nao existe). Auto-suficiente:
// busca os proprios dados em /api/leads/[id]/enderecos.
import { useState, useEffect, useCallback } from "react";
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Star,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { mascararCep } from "@/lib/format";

export type EnderecoItem = {
  id: string;
  apelido: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  principal: boolean;
};

type Rascunho = {
  apelido: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  principal: boolean;
};

const VAZIO: Rascunho = {
  apelido: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  principal: false,
};

function resumo(e: EnderecoItem): string {
  const linha1 = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const linha2 = [e.bairro, e.cidade && e.uf ? `${e.cidade}/${e.uf}` : e.cidade]
    .filter(Boolean)
    .join(" — ");
  return [linha1, e.complemento, linha2].filter(Boolean).join(" · ") || "Endereco";
}

export function Enderecos({
  leadId,
  podeEditar = true,
}: {
  leadId: string;
  podeEditar?: boolean;
}) {
  const toast = useToast();
  const [enderecos, setEnderecos] = useState<EnderecoItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  // null = nenhum form aberto; "novo" = criando; id = editando aquele.
  const [editando, setEditando] = useState<string | "novo" | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/leads/${leadId}/enderecos`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setEnderecos(d.enderecos ?? []);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [leadId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function remover(id: string) {
    const r = await fetch(`/api/enderecos/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.sucesso("Endereco removido.");
      void carregar();
    } else {
      toast.erro("Nao foi possivel remover.");
    }
  }

  async function marcarPrincipal(id: string) {
    const r = await fetch(`/api/enderecos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ principal: true }),
    });
    if (r.ok) {
      void carregar();
    } else {
      toast.erro("Nao foi possivel marcar como principal.");
    }
  }

  return (
    <section className="rounded-xl border border-black/5 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
          <MapPin className="h-3.5 w-3.5" /> Enderecos
        </h4>
        {podeEditar && editando !== "novo" && (
          <button
            onClick={() => setEditando("novo")}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-tiffany hover:bg-tiffany/10"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        )}
      </div>

      {carregando ? (
        <div className="space-y-2">
          <div className="skeleton h-12 w-full rounded-lg" />
        </div>
      ) : erro ? (
        <button
          onClick={() => {
            setCarregando(true);
            void carregar();
          }}
          className="text-xs text-medio/60 underline hover:text-escuro"
        >
          Erro ao carregar. Tentar de novo.
        </button>
      ) : (
        <div className="space-y-2">
          {editando === "novo" && (
            <FormEndereco
              leadId={leadId}
              inicial={{ ...VAZIO, principal: enderecos.length === 0 }}
              onSalvo={() => {
                setEditando(null);
                void carregar();
              }}
              onCancelar={() => setEditando(null)}
            />
          )}

          {enderecos.length === 0 && editando !== "novo" && (
            <p className="text-xs text-medio/50">Nenhum endereco cadastrado.</p>
          )}

          {enderecos.map((e) =>
            editando === e.id ? (
              <FormEndereco
                key={e.id}
                leadId={leadId}
                enderecoId={e.id}
                inicial={{
                  apelido: e.apelido ?? "",
                  cep: e.cep ?? "",
                  logradouro: e.logradouro ?? "",
                  numero: e.numero ?? "",
                  complemento: e.complemento ?? "",
                  bairro: e.bairro ?? "",
                  cidade: e.cidade ?? "",
                  uf: e.uf ?? "",
                  principal: e.principal,
                }}
                onSalvo={() => {
                  setEditando(null);
                  void carregar();
                }}
                onCancelar={() => setEditando(null)}
              />
            ) : (
              <div
                key={e.id}
                className="rounded-lg border border-black/5 bg-fundo px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {e.apelido && (
                        <span className="truncate text-sm font-medium text-escuro">
                          {e.apelido}
                        </span>
                      )}
                      {e.principal && (
                        <span className="flex items-center gap-0.5 rounded-full bg-tiffany/10 px-1.5 py-0.5 text-[10px] font-medium text-tiffany">
                          <Star className="h-2.5 w-2.5 fill-tiffany" /> Principal
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-medio/70">{resumo(e)}</p>
                    {e.cep && (
                      <p className="text-[11px] text-medio/50">
                        CEP {mascararCep(e.cep)}
                      </p>
                    )}
                  </div>
                  {podeEditar && (
                    <div className="flex shrink-0 items-center gap-0.5">
                      {!e.principal && (
                        <button
                          onClick={() => void marcarPrincipal(e.id)}
                          title="Marcar como principal"
                          className="rounded p-1 text-medio/50 hover:bg-black/5 hover:text-tiffany"
                        >
                          <Star className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setEditando(e.id)}
                        title="Editar"
                        className="rounded p-1 text-medio/50 hover:bg-black/5 hover:text-escuro"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => void remover(e.id)}
                        title="Remover"
                        className="rounded p-1 text-medio/50 hover:bg-black/5 hover:text-erro"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function FormEndereco({
  leadId,
  enderecoId,
  inicial,
  onSalvo,
  onCancelar,
}: {
  leadId: string;
  enderecoId?: string;
  inicial: Rascunho;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const toast = useToast();
  const [d, setD] = useState<Rascunho>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  function set<K extends keyof Rascunho>(chave: K, valor: Rascunho[K]) {
    setD((prev) => ({ ...prev, [chave]: valor }));
  }

  // Busca no ViaCEP quando ha 8 digitos. Fallback silencioso (deixa preencher
  // manualmente) quando o CEP nao existe ou a rede falha.
  async function buscarCep(cepBruto: string) {
    const digitos = cepBruto.replace(/\D/g, "");
    if (digitos.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      const j = await r.json();
      if (j.erro) {
        toast.erro("CEP nao encontrado. Preencha manualmente.");
        return;
      }
      setD((prev) => ({
        ...prev,
        logradouro: j.logradouro || prev.logradouro,
        bairro: j.bairro || prev.bairro,
        cidade: j.localidade || prev.cidade,
        uf: j.uf || prev.uf,
      }));
    } catch {
      // Rede indisponivel: segue com preenchimento manual.
    } finally {
      setBuscandoCep(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    try {
      const url = enderecoId
        ? `/api/enderecos/${enderecoId}`
        : `/api/leads/${leadId}/enderecos`;
      const r = await fetch(url, {
        method: enderecoId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      if (r.ok) {
        toast.sucesso(enderecoId ? "Endereco atualizado." : "Endereco adicionado.");
        onSalvo();
      } else {
        const j = await r.json().catch(() => null);
        toast.erro(j?.erro ?? "Nao foi possivel salvar.");
        setSalvando(false);
      }
    } catch {
      toast.erro("Falha de conexao.");
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-tiffany/30 bg-tiffany/[0.03] p-3">
      <Campo
        rotulo="Apelido"
        valor={d.apelido}
        onChange={(v) => set("apelido", v)}
        placeholder="Casa, Trabalho..."
      />
      <div className="grid grid-cols-3 gap-2">
        <div className="relative">
          <Campo
            rotulo="CEP"
            valor={d.cep}
            onChange={(v) => set("cep", mascararCep(v))}
            onBlur={() => void buscarCep(d.cep)}
            placeholder="00000-000"
          />
          {buscandoCep && (
            <Loader2 className="absolute right-2 top-7 h-3.5 w-3.5 animate-spin text-tiffany" />
          )}
        </div>
        <div className="col-span-2">
          <Campo
            rotulo="Logradouro"
            valor={d.logradouro}
            onChange={(v) => set("logradouro", v)}
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Campo
          rotulo="Numero"
          valor={d.numero}
          onChange={(v) => set("numero", v)}
        />
        <div className="col-span-2">
          <Campo
            rotulo="Complemento"
            valor={d.complemento}
            onChange={(v) => set("complemento", v)}
          />
        </div>
      </div>
      <Campo
        rotulo="Bairro"
        valor={d.bairro}
        onChange={(v) => set("bairro", v)}
      />
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <Campo
            rotulo="Cidade"
            valor={d.cidade}
            onChange={(v) => set("cidade", v)}
          />
        </div>
        <Campo
          rotulo="UF"
          valor={d.uf}
          onChange={(v) => set("uf", v.toUpperCase().slice(0, 2))}
        />
      </div>
      <label className="flex items-center gap-2 text-xs font-medium text-medio/80">
        <input
          type="checkbox"
          checked={d.principal}
          onChange={(e) => set("principal", e.target.checked)}
          className="h-3.5 w-3.5 accent-tiffany"
        />
        Endereco principal
      </label>
      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancelar}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-medio hover:bg-black/5"
        >
          <X className="h-3.5 w-3.5" /> Cancelar
        </button>
        <button
          onClick={() => void salvar()}
          disabled={salvando}
          className="flex items-center gap-1 rounded-lg bg-tiffany px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
        >
          {salvando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Salvar
        </button>
      </div>
    </div>
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  onBlur,
  placeholder,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-medio/70">
        {rotulo}
      </label>
      <input
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-tiffany"
      />
    </div>
  );
}
