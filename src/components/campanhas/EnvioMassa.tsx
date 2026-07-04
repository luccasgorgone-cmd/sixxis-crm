"use client";

// "Envio em massa": compositor de campanha (recorte -> canal -> modelo/texto ->
// preview -> confirmacao -> progresso ao vivo) + historico com status por
// destinatario. Respeita finalidade/escopo passados pela carteira.
import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Send,
  Loader2,
  Users,
  MessageCircle,
  Smartphone,
  Mail,
  AlertTriangle,
  CheckCircle2,
  Ban,
  History,
  ChevronRight,
  Megaphone,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BadgeFinalidade } from "@/components/BadgeFinalidade";
import type { Etapa, EtiquetaChip, Finalidade } from "@/components/kanban/tipos";
import {
  detectarVariaveis,
  aplicarModelo,
  INFO_VARIAVEL,
  type LeadModelo,
} from "@/lib/modelos";
import { getSocket } from "@/lib/socketClient";

type Canal = "WHATSAPP" | "SMS" | "EMAIL";
type CanalStatus = { canal: Canal; rotulo: string; configurado: boolean; envs?: string[] };
type Modelo = {
  id: string;
  titulo: string;
  texto: string;
  finalidade: Finalidade | null;
};
type Preview = {
  total: number;
  amostra: { nomeEfetivo: string; destino: string }[];
  pulados: { optOut: number; semCanal: number; total: number };
};
type CampanhaResumo = {
  id: string;
  finalidade: Finalidade;
  canal: Canal;
  mensagem: string;
  total: number;
  enviados: number;
  falhas: number;
  pulados: number;
  status: string;
  criadoEm: string;
  agente: { id: string; nome: string | null } | null;
};

const ICONE_CANAL: Record<Canal, typeof MessageCircle> = {
  WHATSAPP: MessageCircle,
  SMS: Smartphone,
  EMAIL: Mail,
};

export function EnvioMassa({
  finalidade,
  ehAdmin,
  agenteSel,
  etiquetas,
  etapas,
  onFechar,
}: {
  finalidade: Finalidade;
  ehAdmin: boolean;
  agenteSel: string;
  etiquetas: EtiquetaChip[];
  etapas: Etapa[];
  onFechar: () => void;
}) {
  const toast = useToast();
  const [aba, setAba] = useState<"nova" | "historico">("nova");

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />
      <aside className="drawer-in relative flex h-full w-full max-w-2xl flex-col bg-fundo shadow-xl">
        <header className="shrink-0 border-b border-black/5 bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-tiffany" />
              <p className="text-sm font-semibold text-escuro">Envio em massa</p>
              <BadgeFinalidade finalidade={finalidade} />
            </div>
            <button
              onClick={onFechar}
              aria-label="Fechar"
              className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex gap-1 border-t border-black/5 px-2">
            {(
              [
                ["nova", "Nova campanha", Megaphone],
                ["historico", "Historico", History],
              ] as [typeof aba, string, typeof Megaphone][]
            ).map(([chave, rotulo, Icone]) => (
              <button
                key={chave}
                onClick={() => setAba(chave)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  aba === chave
                    ? "border-tiffany text-tiffany"
                    : "border-transparent text-medio/60 hover:text-escuro"
                }`}
              >
                <Icone className="h-4 w-4" />
                {rotulo}
              </button>
            ))}
          </div>
        </header>

        <div className="scroll-fino flex-1 overflow-y-auto p-4">
          {aba === "nova" ? (
            <NovaCampanha
              finalidade={finalidade}
              ehAdmin={ehAdmin}
              agenteSel={agenteSel}
              etiquetas={etiquetas}
              etapas={etapas}
              toast={toast}
              onEnviada={() => setAba("historico")}
            />
          ) : (
            <Historico ehAdmin={ehAdmin} />
          )}
        </div>
      </aside>
    </div>
  );
}

function NovaCampanha({
  finalidade,
  ehAdmin,
  agenteSel,
  etiquetas,
  etapas,
  toast,
  onEnviada,
}: {
  finalidade: Finalidade;
  ehAdmin: boolean;
  agenteSel: string;
  etiquetas: EtiquetaChip[];
  etapas: Etapa[];
  toast: ReturnType<typeof useToast>;
  onEnviada: () => void;
}) {
  // Opt-in explicito: "todos da finalidade" comeca SEMPRE desligado (evita
  // disparar para a base inteira sem intencao).
  const [escopoTodos, setEscopoTodos] = useState(false);
  const [canal, setCanal] = useState<Canal>("WHATSAPP");
  const [canais, setCanais] = useState<CanalStatus[]>([]);
  const [status, setStatus] = useState<"todos" | "ABERTO" | "GANHO" | "PERDIDO">(
    "todos",
  );
  const [etiquetaId, setEtiquetaId] = useState("");
  const [etapaId, setEtapaId] = useState("");
  const [pendente, setPendente] = useState(false);
  const [temPedidoLoja, setTemPedidoLoja] = useState(false);
  const [lojaOnline, setLojaOnline] = useState(false);

  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [modeloId, setModeloId] = useState("");
  const [texto, setTexto] = useState("");
  const [assunto, setAssunto] = useState("");
  const [valores, setValores] = useState<Record<string, string>>({});

  const [preview, setPreview] = useState<Preview | null>(null);
  const [carregandoPrev, setCarregandoPrev] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const etapasFunil = etapas.filter(
    (e) => !e.finalidade || e.finalidade === "AMBAS" || e.finalidade === finalidade,
  );

  // Canais e modelos (uma vez / por finalidade).
  useEffect(() => {
    fetch("/api/canais")
      .then((r) => (r.ok ? r.json() : { canais: [] }))
      .then((d) => {
        setCanais(d.canais ?? []);
        setLojaOnline(Boolean(d.loja?.configurada));
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    fetch(`/api/respostas`)
      .then((r) => (r.ok ? r.json() : { respostas: [] }))
      .then((d) =>
        setModelos(
          (d.respostas ?? []).filter(
            (m: Modelo) => !m.finalidade || m.finalidade === finalidade,
          ),
        ),
      )
      .catch(() => undefined);
  }, [finalidade]);

  const filtro = {
    status,
    etiquetaId: etiquetaId || null,
    etapaId: etapaId || null,
    pendente,
    temPedidoLoja: lojaOnline && temPedidoLoja,
  };
  const corpoEscopo = ehAdmin
    ? escopoTodos
      ? { escopo: "todos" }
      : { agenteId: agenteSel }
    : {};

  // Preview ao vivo quando muda recorte/canal/escopo.
  const carregarPreview = useCallback(async () => {
    setCarregandoPrev(true);
    try {
      const r = await fetch("/api/campanhas/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalidade, canal, filtro, ...corpoEscopo }),
      });
      if (r.ok) setPreview(await r.json());
      else setPreview(null);
    } catch {
      setPreview(null);
    } finally {
      setCarregandoPrev(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalidade, canal, status, etiquetaId, etapaId, pendente, temPedidoLoja, escopoTodos, agenteSel]);

  useEffect(() => {
    const t = setTimeout(() => void carregarPreview(), 250);
    return () => clearTimeout(t);
  }, [carregarPreview]);

  function escolherModelo(id: string) {
    setModeloId(id);
    const m = modelos.find((x) => x.id === id);
    if (m) {
      setTexto(m.texto);
      const { digitadas } = detectarVariaveis(m.texto);
      setValores(Object.fromEntries(digitadas.map((d) => [d, ""])));
    }
  }

  const digitadas = detectarVariaveis(texto).digitadas;
  const amostraLead: LeadModelo = {
    nomeEfetivo: preview?.amostra[0]?.nomeEfetivo ?? "Maria Silva",
    empresa: "Acme",
  };
  const previewTexto = aplicarModelo(texto, {
    lead: amostraLead,
    agente: { nome: INFO_VARIAVEL.vendedor.exemplo },
    valoresDigitados: Object.fromEntries(
      digitadas.map((d) => [d, valores[d] || INFO_VARIAVEL[d]?.exemplo || ""]),
    ),
  });

  const canalInfo = canais.find((c) => c.canal === canal);
  const canalOk = canalInfo?.configurado ?? canal === "WHATSAPP";
  const podeEnviar =
    !!texto.trim() &&
    (preview?.total ?? 0) > 0 &&
    !enviando &&
    digitadas.every((d) => (valores[d] ?? "").trim());

  async function criar() {
    setEnviando(true);
    try {
      const r = await fetch("/api/campanhas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          finalidade,
          canal,
          modeloId: modeloId || null,
          mensagem: texto,
          assunto: canal === "EMAIL" ? assunto : null,
          valoresDigitados: valores,
          filtro,
          ...corpoEscopo,
        }),
      });
      if (r.ok) {
        toast.sucesso("Campanha iniciada. Acompanhe no historico.");
        setConfirmando(false);
        onEnviada();
      } else {
        const d = await r.json().catch(() => null);
        toast.erro(d?.erro ?? "Nao foi possivel criar a campanha.");
      }
    } catch {
      toast.erro("Falha de conexao.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Escopo (admin) */}
      {ehAdmin && (
        <Secao titulo="Escopo">
          <div className="flex rounded-lg border border-black/10 bg-white p-0.5">
            <BotaoToggle ativo={!escopoTodos} onClick={() => setEscopoTodos(false)} disabled={!agenteSel}>
              Colaborador selecionado
            </BotaoToggle>
            <BotaoToggle ativo={escopoTodos} onClick={() => setEscopoTodos(true)}>
              Todos da finalidade
            </BotaoToggle>
          </div>
          {escopoTodos && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-medium text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Esta campanha sera enviada para TODOS os clientes de{" "}
              {finalidade === "VENDA" ? "Venda" : "Pos-venda"}
              {preview ? ` (${preview.total} destinatarios)` : ""}.
            </p>
          )}
        </Secao>
      )}

      {/* Canal */}
      <Secao titulo="Canal">
        <div className="grid grid-cols-3 gap-2">
          {(["WHATSAPP", "SMS", "EMAIL"] as Canal[]).map((c) => {
            const info = canais.find((x) => x.canal === c);
            const ok = info?.configurado ?? c === "WHATSAPP";
            const Icone = ICONE_CANAL[c];
            const ativo = canal === c;
            return (
              <button
                key={c}
                onClick={() => setCanal(c)}
                className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-medium transition-colors ${
                  ativo
                    ? "border-tiffany bg-tiffany/5 text-tiffany"
                    : "border-black/10 bg-white text-medio hover:bg-black/5"
                }`}
              >
                <Icone className="h-5 w-5" />
                {c === "WHATSAPP" ? "WhatsApp" : c === "SMS" ? "SMS" : "Email"}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                    ok
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {ok ? "Pronto" : "Nao configurado"}
                </span>
              </button>
            );
          })}
        </div>
        {!canalOk && (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Canal nao configurado.{" "}
            {ehAdmin && canalInfo?.envs
              ? `Defina as envs: ${canalInfo.envs.join(", ")}.`
              : "Os envios marcarao falha ate o admin configurar."}
          </p>
        )}
      </Secao>

      {/* Recorte */}
      <Secao titulo="Quem vai receber">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Campo rotulo="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className="campo"
            >
              <option value="todos">Todos</option>
              <option value="ABERTO">Em aberto</option>
              <option value="GANHO">Ganhos</option>
              <option value="PERDIDO">Perdidos</option>
            </select>
          </Campo>
          <Campo rotulo="Etiqueta">
            <select
              value={etiquetaId}
              onChange={(e) => setEtiquetaId(e.target.value)}
              className="campo"
            >
              <option value="">Qualquer</option>
              {etiquetas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Etapa">
            <select
              value={etapaId}
              onChange={(e) => setEtapaId(e.target.value)}
              className="campo"
            >
              <option value="">Qualquer</option>
              {etapasFunil.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </Campo>
          <label className="flex items-center gap-2 self-end rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={pendente}
              onChange={(e) => setPendente(e.target.checked)}
              className="h-4 w-4 accent-tiffany"
            />
            Apenas pendentes
          </label>
          {lojaOnline && (
            <label className="flex items-center gap-2 self-end rounded-lg border border-black/10 bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={temPedidoLoja}
                onChange={(e) => setTemPedidoLoja(e.target.checked)}
                className="h-4 w-4 accent-tiffany"
              />
              Tem pedido na loja
            </label>
          )}
        </div>

        {/* Contagem ao vivo */}
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-black/5 bg-white p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-tiffany/10 text-tiffany">
              <Users className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xl font-semibold leading-none text-escuro">
                {carregandoPrev ? "…" : (preview?.total ?? 0)}
              </p>
              <p className="text-xs text-medio/60">vao receber</p>
            </div>
          </div>
          {preview && preview.pulados.total > 0 && (
            <p className="flex items-center gap-1 text-xs text-medio/60">
              <Ban className="h-3.5 w-3.5" />
              {preview.pulados.total} pulados ({preview.pulados.optOut} opt-out,{" "}
              {preview.pulados.semCanal} sem canal)
            </p>
          )}
        </div>
      </Secao>

      {/* Mensagem */}
      <Secao titulo="Mensagem">
        <select
          value={modeloId}
          onChange={(e) => escolherModelo(e.target.value)}
          className="campo mb-2 w-full"
        >
          <option value="">Texto do zero</option>
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.titulo}
            </option>
          ))}
        </select>
        {canal === "EMAIL" && (
          <input
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            placeholder="Assunto do email"
            className="campo mb-2 w-full"
          />
        )}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder="Escreva a mensagem (use variaveis como {nome}, {cupom}...)"
          className="campo scroll-fino w-full resize-none"
        />
        {digitadas.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {digitadas.map((d) => (
              <div key={d}>
                <label className="mb-1 block text-xs font-medium text-medio/70">
                  {INFO_VARIAVEL[d]?.rotulo ?? d}
                </label>
                <input
                  value={valores[d] ?? ""}
                  onChange={(e) =>
                    setValores((v) => ({ ...v, [d]: e.target.value }))
                  }
                  placeholder={INFO_VARIAVEL[d]?.exemplo ?? ""}
                  className="campo w-full"
                />
              </div>
            ))}
          </div>
        )}
        {texto.trim() && (
          <div className="mt-2 rounded-lg border border-black/5 bg-white p-3">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-medio/50">
              Preview ({preview?.amostra[0]?.nomeEfetivo ?? "exemplo"})
            </p>
            <p className="whitespace-pre-wrap text-sm text-escuro">{previewTexto}</p>
          </div>
        )}
      </Secao>

      <button
        onClick={() => setConfirmando(true)}
        disabled={!podeEnviar}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-tiffany px-4 py-2.5 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-50"
      >
        <Send className="h-4 w-4" /> Revisar e enviar
      </button>

      {/* Confirmacao */}
      {confirmando && preview && (
        <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="modal-in scroll-fino max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-tiffany/10 text-tiffany">
                <Send className="h-4 w-4" />
              </span>
              <h3 className="text-base font-semibold text-escuro">
                Confirmar envio
              </h3>
            </div>

            {/* Contagem em destaque */}
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-tiffany/20 bg-tiffany/5 p-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-tiffany/10 text-tiffany">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <p className="text-2xl font-bold leading-none text-escuro">
                  {preview.total}
                </p>
                <p className="text-xs text-medio/70">
                  destinatarios por{" "}
                  {canal === "WHATSAPP" ? "WhatsApp" : canal === "SMS" ? "SMS" : "Email"}
                </p>
              </div>
            </div>

            {ehAdmin && escopoTodos && (
              <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Atencao: TODOS os clientes de{" "}
                {finalidade === "VENDA" ? "Venda" : "Pos-venda"} ({preview.total}{" "}
                destinatarios) vao receber esta campanha.
              </p>
            )}

            {preview.pulados.total > 0 && (
              <p className="text-sm text-medio/80">
                {preview.pulados.total} serao pulados (opt-out/sem canal).
              </p>
            )}
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              O envio respeita um intervalo entre mensagens (anti-bloqueio); pode
              levar alguns minutos.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmando(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => void criar()}
                disabled={enviando}
                className="flex items-center gap-2 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                Enviar agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Historico + detalhe ---
function Historico({ ehAdmin }: { ehAdmin: boolean }) {
  const [campanhas, setCampanhas] = useState<CampanhaResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/campanhas");
      if (r.ok) setCampanhas((await r.json()).campanhas ?? []);
    } catch {
      // silencioso
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const socket = getSocket();
    const atualizar = () => void carregar();
    socket.on("campanha:progresso", atualizar);
    socket.on("campanha:concluida", atualizar);
    socket.on("campanha:nova", atualizar);
    return () => {
      socket.off("campanha:progresso", atualizar);
      socket.off("campanha:concluida", atualizar);
      socket.off("campanha:nova", atualizar);
    };
  }, [carregar]);

  if (carregando) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (campanhas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <Megaphone className="h-8 w-8 text-medio/30" />
        <p className="text-sm font-medium text-escuro">Nenhuma campanha ainda</p>
        <p className="max-w-xs text-xs text-medio/60">
          Crie uma campanha na aba ao lado para comecar.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {campanhas.map((c) => (
          <CardCampanha
            key={c.id}
            c={c}
            ehAdmin={ehAdmin}
            onAbrir={() => setDetalheId(c.id)}
          />
        ))}
      </div>
      {detalheId && (
        <DetalheCampanha id={detalheId} onFechar={() => setDetalheId(null)} />
      )}
    </>
  );
}

const COR_STATUS: Record<string, string> = {
  RASCUNHO: "bg-black/5 text-medio/60",
  ENVIANDO: "bg-sky-100 text-sky-700",
  CONCLUIDA: "bg-green-100 text-green-700",
  CANCELADA: "bg-red-100 text-red-700",
};

function CardCampanha({
  c,
  ehAdmin,
  onAbrir,
}: {
  c: CampanhaResumo;
  ehAdmin: boolean;
  onAbrir: () => void;
}) {
  const Icone = ICONE_CANAL[c.canal];
  const pct = c.total > 0 ? Math.round(((c.enviados + c.falhas) / c.total) * 100) : 0;
  return (
    <button
      onClick={onAbrir}
      className="w-full rounded-xl border border-black/5 bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center gap-2">
        <Icone className="h-4 w-4 text-medio/60" />
        <BadgeFinalidade finalidade={c.finalidade} />
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${COR_STATUS[c.status] ?? ""}`}>
          {c.status}
        </span>
        {ehAdmin && c.agente && (
          <span className="text-xs text-medio/60">· {c.agente.nome}</span>
        )}
        <ChevronRight className="ml-auto h-4 w-4 text-medio/40" />
      </div>
      <p className="mt-1.5 truncate text-sm text-escuro">{c.mensagem}</p>
      <div className="mt-2 flex items-center gap-3 text-xs text-medio/70">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> {c.enviados}
        </span>
        <span className="flex items-center gap-1">
          <Ban className="h-3.5 w-3.5 text-red-500" /> {c.falhas}
        </span>
        <span>de {c.total}</span>
        {c.pulados > 0 && <span>· {c.pulados} pulados</span>}
        <span className="ml-auto">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/5">
        <div
          className="h-full rounded-full bg-tiffany transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  );
}

type DestinoDetalhe = {
  id: string;
  destino: string;
  status: string;
  erro: string | null;
  mensagem: string | null;
  nomeEfetivo: string;
};
type CampanhaDetalhe = CampanhaResumo & {
  destinos: DestinoDetalhe[];
  iniciadoEm: string | null;
  concluidoEm: string | null;
};

const COR_DESTINO: Record<string, string> = {
  PENDENTE: "bg-black/5 text-medio/60",
  ENVIADO: "bg-green-100 text-green-700",
  FALHA: "bg-red-100 text-red-700",
  PULADO: "bg-amber-100 text-amber-700",
};

export function DetalheCampanha({
  id,
  onFechar,
}: {
  id: string;
  onFechar: () => void;
}) {
  const [c, setC] = useState<CampanhaDetalhe | null>(null);
  const [carregando, setCarregando] = useState(true);
  const refC = useRef(c);
  refC.current = c;

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/campanhas/${id}`);
      if (r.ok) setC((await r.json()).campanha);
    } catch {
      // silencioso
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
    const socket = getSocket();
    const atualizar = (p: { campanhaId: string }) => {
      if (p.campanhaId === id) void carregar();
    };
    socket.on("campanha:progresso", atualizar);
    socket.on("campanha:concluida", atualizar);
    return () => {
      socket.off("campanha:progresso", atualizar);
      socket.off("campanha:concluida", atualizar);
    };
  }, [carregar, id]);

  async function cancelar() {
    await fetch(`/api/campanhas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelar" }),
    });
    void carregar();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fade-in absolute inset-0 bg-black/30" onClick={onFechar} />
      <aside className="drawer-in relative flex h-full w-full max-w-md flex-col bg-fundo shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-black/5 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-escuro">Campanha</p>
          <button
            onClick={onFechar}
            className="rounded-lg p-1.5 text-medio/60 hover:bg-black/5 hover:text-escuro"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="scroll-fino flex-1 overflow-y-auto p-4">
          {carregando || !c ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-12 rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-black/5 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <BadgeFinalidade finalidade={c.finalidade} />
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${COR_STATUS[c.status] ?? ""}`}>
                    {c.status}
                  </span>
                  {c.status === "ENVIANDO" && (
                    <button
                      onClick={() => void cancelar()}
                      className="ml-auto rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-escuro">
                  {c.mensagem}
                </p>
                <div className="mt-2 flex gap-3 text-xs text-medio/70">
                  <span>{c.enviados} enviados</span>
                  <span>{c.falhas} falhas</span>
                  <span>{c.pulados} pulados</span>
                  <span>de {c.total}</span>
                </div>
              </div>

              <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-medio/50">
                Destinatarios
              </h4>
              <div className="space-y-1.5">
                {c.destinos.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-lg border border-black/5 bg-white px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-escuro">{d.nomeEfetivo}</p>
                        <p className="truncate text-[11px] text-medio/50">{d.destino}</p>
                        {d.erro && (
                          <p className="truncate text-[11px] text-red-500">{d.erro}</p>
                        )}
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${COR_DESTINO[d.status] ?? ""}`}>
                        {d.status}
                      </span>
                    </div>
                    {d.mensagem && (
                      <p className="mt-1.5 whitespace-pre-wrap rounded-md bg-fundo px-2 py-1.5 text-[11px] text-medio/80">
                        {d.mensagem}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

// --- helpers de layout ---
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-medio/50">
        {titulo}
      </h3>
      {children}
    </section>
  );
}
function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-medio/70">{rotulo}</label>
      {children}
    </div>
  );
}
function BotaoToggle({
  ativo,
  onClick,
  disabled,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
        ativo ? "bg-tiffany text-white" : "text-medio/70 hover:bg-black/5"
      }`}
    >
      {children}
    </button>
  );
}
