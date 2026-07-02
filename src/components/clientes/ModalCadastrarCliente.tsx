"use client";

// Modal de cadastro MANUAL de cliente. Vincula ao dono (eu por padrao; admin
// escolhe o colaborador). Telefone duplicado -> oferece assumir/vincular.
import { useState } from "react";
import {
  X,
  Check,
  Loader2,
  UserPlus,
  Link2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { mascararCpf, mascararCnpj, mascararCep } from "@/lib/format";
import { buscarViaCep } from "@/lib/viacep";

type Vendedor = { id: string; nome: string };

export function ModalCadastrarCliente({
  ehAdmin,
  vendedores,
  onFechar,
  onCriado,
}: {
  ehAdmin: boolean;
  vendedores: Vendedor[];
  onFechar: () => void;
  onCriado: (leadId: string) => void;
}) {
  const toast = useToast();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [finalidade, setFinalidade] = useState<"VENDA" | "POS_VENDA">("VENDA");
  const [donoId, setDonoId] = useState(""); // "" = eu
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [cnpj, setCnpj] = useState("");
  // Dados adicionais (opcionais), recolhidos por padrao para o cadastro rapido.
  const [mostrarAdicionais, setMostrarAdicionais] = useState(false);
  const [dataNascimento, setDataNascimento] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // ViaCEP: ao completar 8 digitos, auto-preenche logradouro/bairro/cidade/uf.
  async function preencherPorCep(valor: string) {
    if (valor.replace(/\D/g, "").length !== 8) return;
    setBuscandoCep(true);
    try {
      const via = await buscarViaCep(valor);
      if (!via) {
        toast.erro("CEP nao encontrado. Preencha manualmente.");
        return;
      }
      if (via.logradouro) setLogradouro((p) => p || via.logradouro);
      if (via.bairro) setBairro((p) => p || via.bairro);
      if (via.cidade) setCidade(via.cidade);
      if (via.uf) setUf(via.uf);
    } finally {
      setBuscandoCep(false);
    }
  }
  // Duplicado: guarda o lead existente para oferecer assumir.
  const [duplicado, setDuplicado] = useState<{
    leadId: string;
    nome: string;
  } | null>(null);

  async function enviar(assumir: boolean) {
    if (!telefone.trim()) {
      setErro("Informe o telefone.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim() || null,
          telefone: telefone.trim(),
          finalidade,
          donoId: ehAdmin && donoId ? donoId : undefined,
          email: email.trim() || null,
          cpf: cpf.trim() || null,
          cnpj: cnpj.trim() || null,
          dataNascimento: dataNascimento || null,
          endereco: {
            cep: cep.trim() || null,
            logradouro: logradouro.trim() || null,
            numero: numero.trim() || null,
            bairro: bairro.trim() || null,
            cidade: cidade.trim() || null,
            uf: uf.trim() || null,
          },
          assumir,
        }),
      });
      const d = await r.json().catch(() => null);
      if (r.ok) {
        toast.sucesso(d?.vinculado ? "Cliente vinculado a voce." : "Cliente cadastrado.");
        onCriado(d.leadId);
        return;
      }
      if (r.status === 409 && d?.duplicado) {
        setDuplicado({ leadId: d.leadId, nome: d.nome });
        setSalvando(false);
        return;
      }
      setErro(d?.erro ?? "Nao foi possivel cadastrar.");
      setSalvando(false);
    } catch {
      setErro("Falha de conexao.");
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-escuro">
            <UserPlus className="h-5 w-5 text-tiffany" /> Cadastrar cliente
          </h3>
          <button
            onClick={onFechar}
            className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {duplicado ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Ja existe um cliente com este telefone:{" "}
              <strong>{duplicado.nome}</strong>. Em vez de duplicar, voce pode
              assumi-lo como seu (na finalidade selecionada).
            </div>
            {erro && <p className="text-xs text-erro">{erro}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDuplicado(null)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-medio hover:bg-black/5"
              >
                Voltar
              </button>
              <button
                onClick={() => void enviar(true)}
                disabled={salvando}
                className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Assumir cliente
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <Campo rotulo="Nome">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do cliente"
                className="campo w-full"
                autoFocus
              />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Telefone *">
                <input
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="campo w-full"
                />
              </Campo>
              <Campo rotulo="Finalidade">
                <select
                  value={finalidade}
                  onChange={(e) =>
                    setFinalidade(e.target.value as "VENDA" | "POS_VENDA")
                  }
                  className="campo w-full"
                >
                  <option value="VENDA">Venda</option>
                  <option value="POS_VENDA">Pos-venda</option>
                </select>
              </Campo>
            </div>
            {ehAdmin && (
              <Campo rotulo="Dono (colaborador)">
                <select
                  value={donoId}
                  onChange={(e) => setDonoId(e.target.value)}
                  className="campo w-full"
                >
                  <option value="">Eu mesmo</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo rotulo="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Opcional"
                className="campo w-full"
              />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="CPF">
                <input
                  value={cpf}
                  onChange={(e) => setCpf(mascararCpf(e.target.value))}
                  placeholder="Opcional"
                  className="campo w-full"
                />
              </Campo>
              <Campo rotulo="CNPJ">
                <input
                  value={cnpj}
                  onChange={(e) => setCnpj(mascararCnpj(e.target.value))}
                  placeholder="Opcional"
                  className="campo w-full"
                />
              </Campo>
            </div>

            {/* Dados adicionais (opcional): nascimento + endereco com ViaCEP. */}
            <div className="rounded-xl border border-black/5">
              <button
                type="button"
                onClick={() => setMostrarAdicionais((v) => !v)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-medio/70 hover:text-escuro"
              >
                {mostrarAdicionais ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Dados adicionais (opcional)
              </button>
              {mostrarAdicionais && (
                <div className="space-y-3 border-t border-black/5 p-3">
                  <Campo rotulo="Data de nascimento">
                    <input
                      type="date"
                      value={dataNascimento}
                      onChange={(e) => setDataNascimento(e.target.value)}
                      className="campo w-full"
                    />
                  </Campo>
                  <div className="grid grid-cols-3 gap-3">
                    <Campo rotulo="CEP">
                      <div className="relative">
                        <input
                          value={cep}
                          onChange={(e) => setCep(mascararCep(e.target.value))}
                          onBlur={() => void preencherPorCep(cep)}
                          placeholder="00000-000"
                          className="campo w-full"
                        />
                        {buscandoCep && (
                          <Loader2 className="absolute right-2 top-2.5 h-3.5 w-3.5 animate-spin text-tiffany" />
                        )}
                      </div>
                    </Campo>
                    <div className="col-span-2">
                      <Campo rotulo="Cidade">
                        <input
                          value={cidade}
                          onChange={(e) => setCidade(e.target.value)}
                          placeholder="Opcional"
                          className="campo w-full"
                        />
                      </Campo>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Campo rotulo="Logradouro">
                        <input
                          value={logradouro}
                          onChange={(e) => setLogradouro(e.target.value)}
                          placeholder="Opcional"
                          className="campo w-full"
                        />
                      </Campo>
                    </div>
                    <Campo rotulo="Numero">
                      <input
                        value={numero}
                        onChange={(e) => setNumero(e.target.value)}
                        placeholder="Opcional"
                        className="campo w-full"
                      />
                    </Campo>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <Campo rotulo="Bairro">
                        <input
                          value={bairro}
                          onChange={(e) => setBairro(e.target.value)}
                          placeholder="Opcional"
                          className="campo w-full"
                        />
                      </Campo>
                    </div>
                    <Campo rotulo="UF">
                      <input
                        value={uf}
                        onChange={(e) =>
                          setUf(e.target.value.toUpperCase().slice(0, 2))
                        }
                        placeholder="UF"
                        className="campo w-full"
                      />
                    </Campo>
                  </div>
                </div>
              )}
            </div>

            {erro && <p className="text-xs text-erro">{erro}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={onFechar}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-medio hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => void enviar(false)}
                disabled={salvando}
                className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
              >
                {salvando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Cadastrar
              </button>
            </div>
          </div>
        )}
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
