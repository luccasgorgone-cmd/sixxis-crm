"use client";

// Bloco de dados do CLIENTE no painel/supervisao: avatar (com refresh da foto),
// nome efetivo + telefone, e edicao inline de nome, email, empresa, CPF e
// anotacoes. CTA "Adicionar nome" em destaque quando so ha o numero.
import { useState } from "react";
import {
  Pencil,
  RefreshCw,
  Check,
  X,
  Loader2,
  UserPlus,
  Building2,
  Mail,
  IdCard,
  StickyNote,
  BellOff,
  BellRing,
  Cake,
  Briefcase,
} from "lucide-react";
import { AvatarCliente } from "@/components/AvatarCliente";
import { useToast } from "@/components/ui/Toast";
import {
  formatarTelefone,
  formatarDataNasc,
  dataNascParaInput,
  mascararCpf,
  mascararCnpj,
} from "@/lib/format";
import { Enderecos } from "@/components/cliente/Enderecos";

export type ClientePainel = {
  id: string;
  nome: string | null;
  pushName: string | null;
  nomeManual: string | null;
  nomeEfetivo: string;
  fotoUrl: string | null;
  telefone: string;
  email: string | null;
  empresa: string | null;
  cpf: string | null;
  cnpj?: string | null;
  dataNascimento?: string | null;
  anotacoes: string | null;
  aceitaContato?: boolean;
  origem: string | null;
};

export function BlocoCliente({
  cliente,
  podeEditar = true,
  onAtualizado,
}: {
  cliente: ClientePainel;
  podeEditar?: boolean;
  onAtualizado?: () => void;
}) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [foto, setFoto] = useState(cliente.fotoUrl);
  const [atualizandoFoto, setAtualizandoFoto] = useState(false);

  // Sem nome real (so o numero): nome efetivo == telefone.
  const semNome = cliente.nomeEfetivo.trim() === cliente.telefone;

  async function atualizarFoto() {
    setAtualizandoFoto(true);
    try {
      const r = await fetch(`/api/leads/${cliente.id}/atualizar-foto`, {
        method: "POST",
      });
      if (r.ok) {
        const d = await r.json();
        setFoto(d.fotoUrl ?? foto);
        onAtualizado?.();
        toast.sucesso(
          d.encontrada ? "Foto atualizada." : "Nenhuma foto encontrada no WhatsApp.",
        );
      } else {
        toast.erro("Nao foi possivel atualizar a foto.");
      }
    } catch {
      toast.erro("Falha ao atualizar a foto.");
    } finally {
      setAtualizandoFoto(false);
    }
  }

  return (
    <>
    <section className="rounded-xl border border-black/5 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="group relative">
          <AvatarCliente
            nome={cliente.nomeEfetivo}
            telefone={cliente.telefone}
            fotoUrl={foto}
            tamanho={52}
          />
          {podeEditar && (
            <button
              onClick={() => void atualizarFoto()}
              disabled={atualizandoFoto}
              title="Atualizar foto do WhatsApp"
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-black/10 bg-white text-medio/70 shadow-sm hover:text-tiffany disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3 w-3 ${atualizandoFoto ? "animate-spin" : ""}`}
              />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-escuro">
            {cliente.nomeEfetivo}
          </p>
          <p className="text-xs text-medio/60">
            {formatarTelefone(cliente.telefone)}
          </p>
          {cliente.pushName && cliente.nomeManual && (
            <p className="mt-0.5 text-[11px] text-medio/40">
              WhatsApp: {cliente.pushName}
            </p>
          )}
        </div>

        {podeEditar && !editando && (
          <button
            onClick={() => setEditando(true)}
            className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* CTA destacado quando falta nome */}
      {semNome && !editando && podeEditar && (
        <button
          onClick={() => setEditando(true)}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-tiffany/40 bg-tiffany/5 px-3 py-2 text-sm font-medium text-tiffany hover:bg-tiffany/10"
        >
          <UserPlus className="h-4 w-4" /> Adicionar nome
        </button>
      )}

      {editando ? (
        <Formulario
          cliente={cliente}
          onCancelar={() => setEditando(false)}
          onSalvo={() => {
            setEditando(false);
            onAtualizado?.();
          }}
        />
      ) : (
        <div className="mt-3 space-y-1.5">
          <Linha icone={Mail} valor={cliente.email} placeholder="Sem email" />
          <Linha
            icone={Building2}
            valor={cliente.empresa}
            placeholder="Sem empresa"
          />
          <Linha
            icone={IdCard}
            valor={cliente.cpf ? mascararCpf(cliente.cpf) : null}
            placeholder="Sem CPF"
          />
          {cliente.cnpj && (
            <Linha icone={Briefcase} valor={mascararCnpj(cliente.cnpj)} placeholder="" />
          )}
          {cliente.dataNascimento && (
            <Linha
              icone={Cake}
              valor={formatarDataNasc(cliente.dataNascimento)}
              placeholder=""
            />
          )}
          {cliente.anotacoes && (
            <div className="mt-2 flex gap-2 rounded-lg bg-fundo px-3 py-2">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-medio/50" />
              <p className="whitespace-pre-wrap text-xs text-medio/80">
                {cliente.anotacoes}
              </p>
            </div>
          )}
          {podeEditar && cliente.aceitaContato !== undefined && (
            <OptOut
              leadId={cliente.id}
              aceita={cliente.aceitaContato}
              onMudou={onAtualizado}
            />
          )}
        </div>
      )}
    </section>

    <Enderecos leadId={cliente.id} podeEditar={podeEditar} />
    </>
  );
}

// Opt-out de comunicacoes em massa (campanhas). Toggle otimista.
function OptOut({
  leadId,
  aceita,
  onMudou,
}: {
  leadId: string;
  aceita: boolean;
  onMudou?: () => void;
}) {
  const toast = useToast();
  const [valor, setValor] = useState(aceita);
  const [salvando, setSalvando] = useState(false);

  async function alternar() {
    const novo = !valor;
    setValor(novo);
    setSalvando(true);
    try {
      const r = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aceitaContato: novo }),
      });
      if (r.ok) {
        toast.sucesso(novo ? "Cliente aceita campanhas." : "Cliente em opt-out.");
        onMudou?.();
      } else {
        setValor(!novo);
        toast.erro("Nao foi possivel alterar.");
      }
    } catch {
      setValor(!novo);
      toast.erro("Falha de conexao.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <button
      onClick={() => void alternar()}
      disabled={salvando}
      title="Inclui/exclui o cliente de campanhas em massa"
      className={`mt-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
        valor
          ? "border-black/5 bg-fundo text-medio/70 hover:bg-black/5"
          : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
      }`}
    >
      {valor ? (
        <BellRing className="h-3.5 w-3.5" />
      ) : (
        <BellOff className="h-3.5 w-3.5" />
      )}
      {valor ? "Aceita comunicacoes em massa" : "Opt-out: fora de campanhas"}
    </button>
  );
}

function Linha({
  icone: Icone,
  valor,
  placeholder,
}: {
  icone: typeof Mail;
  valor: string | null;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icone className="h-3.5 w-3.5 shrink-0 text-medio/40" />
      <span className={valor ? "text-escuro" : "text-medio/40"}>
        {valor || placeholder}
      </span>
    </div>
  );
}

function Formulario({
  cliente,
  onCancelar,
  onSalvo,
}: {
  cliente: ClientePainel;
  onCancelar: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const [nomeManual, setNomeManual] = useState(cliente.nomeManual ?? "");
  const [email, setEmail] = useState(cliente.email ?? "");
  const [empresa, setEmpresa] = useState(cliente.empresa ?? "");
  const [cpf, setCpf] = useState(cliente.cpf ? mascararCpf(cliente.cpf) : "");
  const [cnpj, setCnpj] = useState(
    cliente.cnpj ? mascararCnpj(cliente.cnpj) : "",
  );
  const [dataNascimento, setDataNascimento] = useState(
    dataNascParaInput(cliente.dataNascimento),
  );
  const [anotacoes, setAnotacoes] = useState(cliente.anotacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/leads/${cliente.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeManual,
          email,
          empresa,
          cpf,
          cnpj,
          dataNascimento,
          anotacoes,
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        // "nada a atualizar" tambem fecha (nao houve mudanca).
        if (r.status === 400 && d?.erro === "nada a atualizar") {
          onSalvo();
          return;
        }
        setErro(d?.erro ?? "Nao foi possivel salvar.");
        setSalvando(false);
        return;
      }
      toast.sucesso("Dados do cliente salvos.");
      onSalvo();
    } catch {
      setErro("Falha ao salvar.");
      setSalvando(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <Campo
        rotulo="Nome"
        valor={nomeManual}
        onChange={setNomeManual}
        placeholder={cliente.pushName ?? "Nome do cliente"}
      />
      <Campo rotulo="Email" valor={email} onChange={setEmail} tipo="email" />
      <Campo rotulo="Empresa" valor={empresa} onChange={setEmpresa} />
      <div className="grid grid-cols-2 gap-2">
        <Campo
          rotulo="CPF"
          valor={cpf}
          onChange={(v) => setCpf(mascararCpf(v))}
          placeholder="000.000.000-00"
        />
        <Campo
          rotulo="CNPJ"
          valor={cnpj}
          onChange={(v) => setCnpj(mascararCnpj(v))}
          placeholder="00.000.000/0000-00"
        />
      </div>
      <Campo
        rotulo="Data de nascimento"
        valor={dataNascimento}
        onChange={setDataNascimento}
        tipo="date"
      />
      <div>
        <label className="mb-1 block text-xs font-medium text-medio/70">
          Anotacoes
        </label>
        <textarea
          value={anotacoes}
          onChange={(e) => setAnotacoes(e.target.value)}
          rows={3}
          placeholder="Observacoes internas sobre o cliente"
          className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
        />
      </div>
      {erro && <p className="text-xs text-erro">{erro}</p>}
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancelar}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-medio hover:bg-black/5"
        >
          <X className="h-4 w-4" /> Cancelar
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
  );
}

function Campo({
  rotulo,
  valor,
  onChange,
  tipo = "text",
  placeholder,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  tipo?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-medio/70">
        {rotulo}
      </label>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
      />
    </div>
  );
}
