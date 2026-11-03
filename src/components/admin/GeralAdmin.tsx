"use client";

// Admin > Geral: nome da empresa, fuso, horario comercial (por dia da semana,
// com faixas) e mensagem de fora do horario. Indicador Aberto/Fechado agora.
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Cabecalho, SkeletonTabela, CampoTexto } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";
import { LogoUploader } from "./LogoUploader";
import { FaviconUploader } from "./FaviconUploader";

type Faixa = { inicio: string; fim: string };
type DiaHorario = { dia: number; aberto: boolean; faixas: Faixa[] };
type Config = {
  nomeEmpresa: string | null;
  fuso: string;
  horarios: DiaHorario[];
  mensagemForaHorario: string | null;
  avisoForaHorarioAtivo: boolean;
  mensagensAutomaticasAtivas: boolean;
  // Bloco 3 — esvaziar o Kanban por prazo. null/0 = aquele lado nao arquiva.
  diasArquivarPerdido: number | null;
  diasArquivarGanho: number | null;
  arquivamentoAtivo: boolean;
  temLogo: boolean;
  logoEm: number;
  temFavicon: boolean;
  faviconEm: number;
  temLogoOrcamento: boolean;
  logoOrcamentoEm: number;
};

const NOMES = [
  "Domingo",
  "Segunda",
  "Terca",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sabado",
];

export function GeralAdmin() {
  const toast = useToast();
  const router = useRouter();
  const [config, setConfig] = useState<Config | null>(null);
  const [abertoAgora, setAbertoAgora] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/admin/config");
      if (r.ok) {
        const d = await r.json();
        setConfig(d.config);
        setAbertoAgora(d.abertoAgora);
        setErro(false);
      } else {
        setErro(true);
      }
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function setDia(dia: number, patch: Partial<DiaHorario>) {
    setConfig((c) =>
      c
        ? {
            ...c,
            horarios: ordenar(c.horarios).map((h) =>
              h.dia === dia ? { ...h, ...patch } : h,
            ),
          }
        : c,
    );
  }

  function setFaixa(dia: number, i: number, patch: Partial<Faixa>) {
    setConfig((c) =>
      c
        ? {
            ...c,
            horarios: c.horarios.map((h) =>
              h.dia === dia
                ? {
                    ...h,
                    faixas: h.faixas.map((f, j) =>
                      j === i ? { ...f, ...patch } : f,
                    ),
                  }
                : h,
            ),
          }
        : c,
    );
  }

  function addFaixa(dia: number) {
    setConfig((c) =>
      c
        ? {
            ...c,
            horarios: c.horarios.map((h) =>
              h.dia === dia
                ? { ...h, faixas: [...h.faixas, { inicio: "09:00", fim: "18:00" }] }
                : h,
            ),
          }
        : c,
    );
  }

  function rmFaixa(dia: number, i: number) {
    setConfig((c) =>
      c
        ? {
            ...c,
            horarios: c.horarios.map((h) =>
              h.dia === dia
                ? { ...h, faixas: h.faixas.filter((_, j) => j !== i) }
                : h,
            ),
          }
        : c,
    );
  }

  async function salvar() {
    if (!config) return;
    setSalvando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (r.ok) {
        const d = await r.json();
        setConfig(d.config);
        setAbertoAgora(d.abertoAgora);
        setAviso("Configuracao salva.");
        toast.sucesso("Configuracao salva");
      } else {
        const d = await r.json().catch(() => null);
        setAviso(
          d?.erro ? `Erro: ${d.erro}` : "Nao foi possivel salvar a configuracao.",
        );
        toast.erro(d?.erro ?? "Nao foi possivel salvar.");
      }
    } catch {
      setAviso("Falha de rede ao salvar.");
      toast.erro("Nao foi possivel salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="p-6">
        <SkeletonTabela />
      </div>
    );
  }

  if (erro || !config) {
    return (
      <div className="p-6">
        <EstadoErro
          mensagem="Nao foi possivel carregar."
          onRetry={() => void carregar()}
        />
      </div>
    );
  }

  const horarios = ordenar(config.horarios);

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Configuracao geral"
        subtitulo="Dados da empresa e horario comercial"
        acao={
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              abertoAgora
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {abertoAgora ? "Aberto agora" : "Fechado agora"}
          </span>
        }
      />

      <div className="max-w-2xl space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CampoTexto
            rotulo="Nome da empresa"
            valor={config.nomeEmpresa ?? ""}
            onChange={(v) => setConfig({ ...config, nomeEmpresa: v })}
          />
          <CampoTexto
            rotulo="Fuso horario"
            valor={config.fuso}
            onChange={(v) => setConfig({ ...config, fuso: v })}
          />
        </div>

        <LogoUploader
          temLogo={config.temLogo}
          logoEm={config.logoEm}
          onChange={() => {
            // Recarrega o estado local e revalida os server components (sidebar,
            // login, favicon) para refletir a troca sem reload manual.
            void carregar();
            router.refresh();
          }}
        />

        {/* Logo DEDICADA ao PDF de orcamento (Fatia 3.17): fundo claro no preview
            (o PDF e claro); prefira uma versao escura/colorida. Fallback: se vazia,
            o PDF usa a logo do sistema. */}
        <LogoUploader
          temLogo={config.temLogoOrcamento}
          logoEm={config.logoOrcamentoEm}
          titulo="Logo do orçamento (PDF)"
          descricao="Usada no PDF de orçamento enviado ao cliente. Prefira uma versão escura/colorida sobre fundo claro. Se vazia, usa a logo do sistema."
          previewUrl={(v) => `/api/logo?tipo=orcamento&v=${v}`}
          fundoPreview="claro"
          corpoSalvar={(data, mime) => ({ logoOrcamentoData: data, logoOrcamentoMime: mime })}
          corpoRemover={() => ({ removerLogoOrcamento: true })}
          onChange={() => {
            void carregar();
            router.refresh();
          }}
        />

        <FaviconUploader
          temFavicon={config.temFavicon}
          faviconEm={config.faviconEm}
          onChange={() => {
            void carregar();
            router.refresh();
          }}
        />

        <div>
          <p className="mb-2 text-sm font-medium text-escuro">
            Horario comercial
          </p>
          <div className="space-y-2">
            {horarios.map((h) => (
              <div
                key={h.dia}
                className="rounded-xl border border-black/5 bg-white p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-escuro">
                    {NOMES[h.dia]}
                  </span>
                  <label className="flex items-center gap-2 text-sm text-medio">
                    <input
                      type="checkbox"
                      checked={h.aberto}
                      onChange={(e) =>
                        setDia(h.dia, { aberto: e.target.checked })
                      }
                      className="h-4 w-4 accent-tiffany"
                    />
                    Aberto
                  </label>
                </div>
                {h.aberto && (
                  <div className="mt-2 space-y-2">
                    {h.faixas.map((f, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={f.inicio}
                          onChange={(e) =>
                            setFaixa(h.dia, i, { inicio: e.target.value })
                          }
                          className="rounded-lg border border-black/10 px-2 py-1 text-sm outline-none focus:border-tiffany"
                        />
                        <span className="text-medio/50">ate</span>
                        <input
                          type="time"
                          value={f.fim}
                          onChange={(e) =>
                            setFaixa(h.dia, i, { fim: e.target.value })
                          }
                          className="rounded-lg border border-black/10 px-2 py-1 text-sm outline-none focus:border-tiffany"
                        />
                        <button
                          onClick={() => rmFaixa(h.dia, i)}
                          className="rounded-lg p-1 text-medio/50 hover:bg-black/5 hover:text-erro"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => addFaixa(h.dia)}
                      className="flex items-center gap-1 text-xs font-medium text-tiffany hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Adicionar faixa
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Interruptor MESTRE de TODAS as mensagens automaticas (default OFF). */}
        <div className="rounded-xl border-2 border-tiffany/40 bg-tiffany/[0.04] p-4">
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-escuro">
                Mensagens automaticas
              </span>
              <span className="mt-0.5 block text-xs text-medio/70">
                Interruptor geral das mensagens automaticas ao cliente (ex.: aviso
                de fora de horario). Desligado: nenhuma mensagem automatica e
                enviada. Ligue apenas quando quiser respostas automaticas.
              </span>
              <span className="mt-1.5 block text-xs text-medio/50">
                Com a IA (Sol) atendendo, normalmente mantenha isto DESLIGADO para
                nao competir.
              </span>
            </span>
            <input
              type="checkbox"
              checked={config.mensagensAutomaticasAtivas}
              onChange={(e) =>
                setConfig({
                  ...config,
                  mensagensAutomaticasAtivas: e.target.checked,
                })
              }
              className="mt-0.5 h-5 w-5 shrink-0 accent-tiffany"
            />
          </label>
        </div>

        {/* Interruptor do aviso automatico fora do horario (default DESLIGADO). */}
        <div className="rounded-xl border border-black/5 bg-white p-4">
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-escuro">
                Enviar aviso automatico fora do horario
              </span>
              <span className="mt-0.5 block text-xs text-medio/60">
                Quando ligado, clientes que escreverem fora do expediente recebem
                uma resposta automatica. Desligado, nada e enviado
                automaticamente. Depende do interruptor mestre acima estar ligado.
              </span>
            </span>
            <input
              type="checkbox"
              checked={config.avisoForaHorarioAtivo}
              onChange={(e) =>
                setConfig({ ...config, avisoForaHorarioAtivo: e.target.checked })
              }
              className="mt-0.5 h-5 w-5 shrink-0 accent-tiffany"
            />
          </label>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-escuro">
            Mensagem de fora do horario
          </label>
          <textarea
            value={config.mensagemForaHorario ?? ""}
            onChange={(e) =>
              setConfig({ ...config, mensagemForaHorario: e.target.value })
            }
            rows={3}
            placeholder="Ex.: Nosso atendimento e de seg a sex, 9h as 18h. Retornamos em breve."
            className="scroll-fino w-full resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
          />
          <p className="mt-1 text-xs text-medio/50">
            So e enviada se o interruptor de mensagens automaticas estiver LIGADO
            e este campo tiver texto.
          </p>
        </div>

        {/* Bloco 3 — esvaziar o Kanban por prazo. Dois prazos + interruptor
            mestre. Enquanto o mestre estiver desligado, o job so REGISTRA no
            log quantos cards arquivaria: nada some do quadro. */}
        <div className="rounded-xl border border-black/5 bg-white p-4">
          <span className="block text-sm font-medium text-escuro">
            Esvaziar o Kanban por prazo
          </span>
          <span className="mt-0.5 block text-xs text-medio/60">
            Tira do quadro os cards de Perdido e Vendido parados ha muito tempo,
            e junto tira a conversa do Inbox. Arquivar NAO apaga nada: o
            cliente, o historico e os valores continuam no sistema e nas telas
            de clientes. Qualquer mensagem nova reinicia a contagem e traz de
            volta os dois (card e conversa). Negocio em aberto nunca e
            arquivado.
          </span>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-escuro">
                Arquivar Perdido apos (dias sem contato)
              </span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={config.diasArquivarPerdido ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    diasArquivarPerdido:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="vazio = nunca arquiva"
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-escuro">
                Arquivar Vendido apos (dias sem contato)
              </span>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={config.diasArquivarGanho ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    diasArquivarGanho:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="vazio = nunca arquiva"
                className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-tiffany"
              />
            </label>
          </div>

          <label className="mt-4 flex cursor-pointer items-start justify-between gap-3 border-t border-black/5 pt-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-escuro">
                Arquivar de verdade
              </span>
              <span className="mt-0.5 block text-xs text-medio/60">
                Desligado (padrao), o sistema apenas ANOTA no log quantos cards
                arquivaria com os prazos acima — nada sai do quadro. Ligue
                depois de conferir que o numero faz sentido.
              </span>
            </span>
            <input
              type="checkbox"
              checked={config.arquivamentoAtivo}
              onChange={(e) =>
                setConfig({ ...config, arquivamentoAtivo: e.target.checked })
              }
              className="mt-0.5 h-5 w-5 shrink-0 accent-tiffany"
            />
          </label>
        </div>

        {/* Manutencao pontual do quadro: rodar AGORA a limpeza dos perdidos e a
            correcao de duplicados. Sao os mesmos endpoints admin ja existentes
            (zero delete, idempotentes); aqui so ganham botao. */}
        <ManutencaoQuadro />

        <div className="flex items-center gap-3">
          <button
            onClick={() => void salvar()}
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </button>
          {aviso && <span className="text-sm text-medio/60">{aviso}</span>}
        </div>
      </div>
    </div>
  );
}

// Manutencao pontual do quadro (admin): dois botoes de acao imediata.
//  - Limpar perdidos: arquiva TODOS os PERDIDO de uma vez (Kanban + Inbox),
//    sem esperar o prazo. Util para comecar o quadro limpo.
//  - Corrigir duplicados: neutraliza negocios duplicados no mesmo cliente,
//    mantendo o melhor (venda real nunca some).
// Ambos: previa (GET) antes de executar, confirm obrigatorio, e ZERO delete.
function ManutencaoQuadro() {
  const toast = useToast();
  const [previaPerd, setPreviaPerd] = useState<{
    venda: number;
    posVenda: number;
    total: number;
  } | null>(null);
  const [rodandoPerd, setRodandoPerd] = useState(false);
  const [previaDup, setPreviaDup] = useState<{
    totalGrupos: number;
    valorEmDobro: number;
  } | null>(null);
  const [rodandoDup, setRodandoDup] = useState(false);

  async function previewPerdidos() {
    setRodandoPerd(true);
    try {
      const r = await fetch("/api/admin/limpeza-perdidos");
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        toast.erro(d?.erro ?? "Falha ao pre-visualizar.");
        return;
      }
      setPreviaPerd(d.previa);
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setRodandoPerd(false);
    }
  }

  async function execPerdidos() {
    if (
      !window.confirm(
        "Arquivar TODOS os perdidos agora? Eles saem do Kanban e do Inbox " +
          "(nada e apagado; voltam se o cliente falar). Confirmar?",
      )
    ) {
      return;
    }
    setRodandoPerd(true);
    try {
      const r = await fetch("/api/admin/limpeza-perdidos", { method: "POST" });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        toast.erro(d?.erro ?? "Falha na limpeza.");
        return;
      }
      toast.sucesso(
        `${d.arquivados.total} perdidos arquivados (venda ${d.arquivados.venda}, ` +
          `pos-venda ${d.arquivados.posVenda}).`,
      );
      setPreviaPerd({ venda: 0, posVenda: 0, total: 0 });
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setRodandoPerd(false);
    }
  }

  async function previewDuplicados() {
    setRodandoDup(true);
    try {
      const r = await fetch("/api/admin/corrigir-duplicados");
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        toast.erro(d?.erro ?? "Falha ao pre-visualizar.");
        return;
      }
      setPreviaDup({
        totalGrupos: d.previa.totalGrupos,
        valorEmDobro: d.previa.valorEmDobro,
      });
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setRodandoDup(false);
    }
  }

  async function execDuplicados() {
    if (
      !window.confirm(
        "Corrigir os duplicados agora? O melhor negocio de cada cliente e " +
          "mantido e os duplicados sao neutralizados (nada e apagado). Confirmar?",
      )
    ) {
      return;
    }
    setRodandoDup(true);
    try {
      const r = await fetch("/api/admin/corrigir-duplicados", {
        method: "POST",
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        toast.erro(d?.erro ?? "Falha ao corrigir.");
        return;
      }
      toast.sucesso(
        `${d.totalGrupos} clientes corrigidos, ${d.neutralizados} duplicados ` +
          `neutralizados.`,
      );
      setPreviaDup({ totalGrupos: 0, valorEmDobro: 0 });
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setRodandoDup(false);
    }
  }

  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <span className="block text-sm font-medium text-escuro">
        Manutencao do quadro (agora)
      </span>
      <span className="mt-0.5 block text-xs text-medio/60">
        Acoes imediatas, sem esperar prazo. Nada e apagado: tudo continua nas
        telas de clientes e volta se o cliente falar.
      </span>

      {/* Limpar perdidos */}
      <div className="mt-3 border-t border-black/5 pt-3">
        <span className="block text-sm font-medium text-escuro">
          Limpar perdidos
        </span>
        <span className="mt-0.5 block text-xs text-medio/60">
          Tira do Kanban e do Inbox todos os cards de Perdido de uma vez.
        </span>
        {previaPerd && (
          <p className="mt-2 text-xs text-medio">
            {previaPerd.total > 0
              ? `${previaPerd.total} perdidos no quadro (venda ${previaPerd.venda}, pos-venda ${previaPerd.posVenda}).`
              : "Nenhum perdido no quadro."}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => void previewPerdidos()}
            disabled={rodandoPerd}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-escuro hover:bg-black/5 disabled:opacity-60"
          >
            {rodandoPerd && <Loader2 className="h-4 w-4 animate-spin" />}
            Pre-visualizar
          </button>
          <button
            onClick={() => void execPerdidos()}
            disabled={rodandoPerd || !previaPerd || previaPerd.total === 0}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Limpar agora
          </button>
        </div>
      </div>

      {/* Corrigir duplicados */}
      <div className="mt-3 border-t border-black/5 pt-3">
        <span className="block text-sm font-medium text-escuro">
          Corrigir duplicados
        </span>
        <span className="mt-0.5 block text-xs text-medio/60">
          Quando o mesmo cliente tem mais de um negocio na mesma finalidade,
          mantem o melhor e neutraliza o resto (a venda real nunca some).
        </span>
        {previaDup && (
          <p className="mt-2 text-xs text-medio">
            {previaDup.totalGrupos > 0
              ? `${previaDup.totalGrupos} clientes com duplicata` +
                (previaDup.valorEmDobro > 0
                  ? ` (R$ ${previaDup.valorEmDobro.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} contando em dobro).`
                  : ".")
              : "Nenhum duplicado encontrado."}
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => void previewDuplicados()}
            disabled={rodandoDup}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-1.5 text-sm font-medium text-escuro hover:bg-black/5 disabled:opacity-60"
          >
            {rodandoDup && <Loader2 className="h-4 w-4 animate-spin" />}
            Pre-visualizar
          </button>
          <button
            onClick={() => void execDuplicados()}
            disabled={rodandoDup || !previaDup || previaDup.totalGrupos === 0}
            className="flex items-center gap-1.5 rounded-lg bg-tiffany px-3 py-1.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            Corrigir agora
          </button>
        </div>
      </div>
    </div>
  );
}

// Garante os 7 dias na ordem 0..6 (completa o que faltar).
function ordenar(horarios: DiaHorario[]): DiaHorario[] {
  return Array.from({ length: 7 }, (_, dia) => {
    const existente = horarios.find((h) => h.dia === dia);
    return existente ?? { dia, aberto: false, faixas: [] };
  });
}
