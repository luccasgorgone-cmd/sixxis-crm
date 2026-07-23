"use client";

// Fatia AA — botao "Trazer dados para o CRM" + modal de conferencia.
// Puxa o preview (GET) da rota de sincronizacao, deixa o usuario conferir campo
// a campo (No CRM x Na Loja) e aplica so os marcados (POST). Idempotente e sem
// sobrescrever nada em silencio: "preencher" vem marcado, "conflito" vem
// desmarcado (destaque ambar). "igual" nem aparece.
import { useState, useEffect, useCallback } from "react";
import { DownloadCloud, CheckCircle2, X, Loader2, AlertTriangle } from "lucide-react";

type Classificacao = "preencher" | "conflito" | "igual";
type CampoSync = {
  chave: string;
  rotulo: string;
  grupo: "cadastro" | "endereco" | "nota" | "rastreio";
  valorCrm: string | null;
  valorLoja: string | null;
  classificacao: Classificacao;
};
type Preview = {
  ok: boolean;
  offline: boolean;
  temCadastro: boolean;
  pedidoId: string | null;
  campos: CampoSync[];
  avisos: string[];
};
type Resultado = {
  aplicados: string[];
  pulados: { chave: string; motivo: string }[];
  avisos: string[];
};

const GRUPO_ROTULO: Record<CampoSync["grupo"], string> = {
  cadastro: "Cadastro",
  endereco: "Endereco",
  nota: "Nota fiscal",
  rastreio: "Rastreio",
};

export function BotaoSincronizarLoja({
  leadId,
  negocioId,
  onAtualizado,
}: {
  leadId: string;
  negocioId?: string | null;
  onAtualizado?: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const qs = negocioId ? `?negocioId=${encodeURIComponent(negocioId)}` : "";
      const r = await fetch(`/api/leads/${leadId}/sincronizar-loja${qs}`);
      const d: Preview = await r.json();
      setPreview(d);
      // Pre-marca so os "preencher" (CRM vazio). Conflitos ficam desmarcados.
      setMarcados(
        new Set(
          d.campos
            ?.filter((c) => c.classificacao === "preencher")
            .map((c) => c.chave) ?? [],
        ),
      );
    } catch {
      setPreview(null);
      setErro("Nao foi possivel consultar a loja.");
    } finally {
      setCarregando(false);
    }
  }, [leadId, negocioId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const acionaveis =
    preview?.campos.filter((c) => c.classificacao !== "igual") ?? [];

  function alternar(chave: string) {
    setMarcados((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(chave)) proximo.delete(chave);
      else proximo.add(chave);
      return proximo;
    });
  }

  async function aplicar() {
    if (marcados.size === 0) return;
    setAplicando(true);
    setErro(null);
    try {
      const r = await fetch(`/api/leads/${leadId}/sincronizar-loja`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoId: preview?.pedidoId ?? undefined,
          negocioId: negocioId ?? undefined,
          campos: [...marcados],
        }),
      });
      if (!r.ok) {
        setErro("Nao foi possivel aplicar. Tente de novo.");
        setAplicando(false);
        return;
      }
      const d: Resultado = await r.json();
      setResultado(d);
      setAberto(false);
      onAtualizado?.();
      await carregar();
    } catch {
      setErro("Nao foi possivel aplicar. Tente de novo.");
    } finally {
      setAplicando(false);
    }
  }

  // Enquanto carrega o primeiro preview: nada (nao piscar).
  if (carregando && !preview) return null;

  // Loja offline / sem cadastro: nada a oferecer (a aba ja mostra o estado).
  if (!preview || preview.offline || !preview.temCadastro) {
    // Ainda assim, se acabou de aplicar algo, mostra o resumo curto.
    return resultado ? <ResumoAplicacao resultado={resultado} /> : null;
  }

  return (
    <div className="mb-3 space-y-2">
      {resultado && <ResumoAplicacao resultado={resultado} />}

      {acionaveis.length > 0 ? (
        <button
          onClick={() => {
            setResultado(null);
            setAberto(true);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-tiffany/40 bg-tiffany/10 py-2 text-sm font-semibold text-tiffany-escuro transition-colors hover:bg-tiffany/20"
        >
          <DownloadCloud className="h-4 w-4" />
          Trazer dados para o CRM
          <span className="rounded-full bg-tiffany/20 px-1.5 text-[11px] font-bold">
            {acionaveis.length}
          </span>
        </button>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-medio/50">
          <CheckCircle2 className="h-3.5 w-3.5 text-tiffany" />
          Dados ja sincronizados com a loja.
        </p>
      )}

      {aberto && (
        <ModalConferencia
          campos={acionaveis}
          avisos={preview.avisos}
          marcados={marcados}
          aplicando={aplicando}
          erro={erro}
          onAlternar={alternar}
          onAplicar={aplicar}
          onFechar={() => setAberto(false)}
        />
      )}
    </div>
  );
}

function ResumoAplicacao({ resultado }: { resultado: Resultado }) {
  return (
    <div className="rounded-lg border border-tiffany/30 bg-tiffany/5 p-2.5 text-xs">
      {resultado.aplicados.length > 0 ? (
        <p className="flex items-center gap-1.5 font-medium text-tiffany-escuro">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Aplicado: {resultado.aplicados.join(", ")}
        </p>
      ) : (
        <p className="text-medio/60">Nada foi aplicado.</p>
      )}
      {resultado.pulados.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-medio/60">
          {resultado.pulados.map((p, i) => (
            <li key={i}>
              Pulado {p.chave}: {p.motivo}
            </li>
          ))}
        </ul>
      )}
      {resultado.avisos.map((a, i) => (
        <p key={i} className="mt-1 text-amber-700">
          {a}
        </p>
      ))}
    </div>
  );
}

function ModalConferencia({
  campos,
  avisos,
  marcados,
  aplicando,
  erro,
  onAlternar,
  onAplicar,
  onFechar,
}: {
  campos: CampoSync[];
  avisos: string[];
  marcados: Set<string>;
  aplicando: boolean;
  erro: string | null;
  onAlternar: (chave: string) => void;
  onAplicar: () => void;
  onFechar: () => void;
}) {
  // Agrupa por grupo, preservando a ordem de chegada.
  const grupos: { grupo: CampoSync["grupo"]; itens: CampoSync[] }[] = [];
  for (const c of campos) {
    let g = grupos.find((x) => x.grupo === c.grupo);
    if (!g) {
      g = { grupo: c.grupo, itens: [] };
      grupos.push(g);
    }
    g.itens.push(c);
  }

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="modal-in flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3">
          <h3 className="text-base font-semibold text-escuro">
            Conferir dados da loja
          </h3>
          <button
            onClick={onFechar}
            className="rounded-lg p-1 text-medio/60 hover:bg-black/5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-fino flex-1 overflow-y-auto p-4">
          <p className="mb-3 text-xs text-medio/60">
            Marque o que deseja trazer da loja. Campos vazios no CRM ja vem
            marcados; conflitos (que substituem o que existe) vem desmarcados.
          </p>

          <div className="space-y-4">
            {grupos.map((g) => (
              <div key={g.grupo}>
                <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-medio/50">
                  {GRUPO_ROTULO[g.grupo]}
                </h4>
                <div className="space-y-1.5">
                  {g.itens.map((c) => {
                    const conflito = c.classificacao === "conflito";
                    const marcado = marcados.has(c.chave);
                    return (
                      <label
                        key={c.chave}
                        className={`flex cursor-pointer gap-2.5 rounded-lg border p-2.5 transition-colors ${
                          conflito
                            ? "border-amber-300 bg-amber-50"
                            : "border-black/5 bg-fundo"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => onAlternar(c.chave)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-tiffany"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-escuro">
                              {c.rotulo}
                            </span>
                            {conflito ? (
                              <span className="rounded bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                vai substituir
                              </span>
                            ) : (
                              <span className="text-[10px] text-medio/40">
                                vazio no CRM
                              </span>
                            )}
                          </div>
                          <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                            <div className="min-w-0">
                              <span className="block text-[10px] uppercase text-medio/40">
                                No CRM
                              </span>
                              <span className="block truncate text-medio/70">
                                {c.valorCrm ?? "—"}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <span className="block text-[10px] uppercase text-medio/40">
                                Na loja
                              </span>
                              <span className="block truncate font-medium text-escuro">
                                {c.valorLoja ?? "—"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {avisos.length > 0 && (
            <div className="mt-3 space-y-1">
              {avisos.map((a, i) => (
                <p
                  key={i}
                  className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {a}
                </p>
              ))}
            </div>
          )}

          {erro && <p className="mt-2 text-xs text-erro">{erro}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/5 px-5 py-3">
          <button
            onClick={onFechar}
            disabled={aplicando}
            className="rounded-lg px-3 py-2 text-sm font-medium text-medio hover:bg-black/5"
          >
            Cancelar
          </button>
          <button
            onClick={onAplicar}
            disabled={aplicando || marcados.size === 0}
            className="flex items-center gap-2 rounded-lg bg-tiffany px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-tiffany-escuro disabled:opacity-60"
          >
            {aplicando && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar selecionados
          </button>
        </div>
      </div>
    </div>
  );
}
