"use client";

// Admin > Geral: nome da empresa, fuso, horario comercial (por dia da semana,
// com faixas) e mensagem de fora do horario. Indicador Aberto/Fechado agora.
import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Cabecalho, SkeletonTabela, CampoTexto } from "./VendedoresAdmin";
import { EstadoErro } from "@/components/ui/Estado";
import { useToast } from "@/components/ui/Toast";

type Faixa = { inicio: string; fim: string };
type DiaHorario = { dia: number; aberto: boolean; faixas: Faixa[] };
type Config = {
  nomeEmpresa: string | null;
  fuso: string;
  horarios: DiaHorario[];
  mensagemForaHorario: string | null;
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
        </div>

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

// Garante os 7 dias na ordem 0..6 (completa o que faltar).
function ordenar(horarios: DiaHorario[]): DiaHorario[] {
  return Array.from({ length: 7 }, (_, dia) => {
    const existente = horarios.find((h) => h.dia === dia);
    return existente ?? { dia, aberto: false, faixas: [] };
  });
}
