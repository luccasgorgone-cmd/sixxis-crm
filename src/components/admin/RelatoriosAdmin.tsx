"use client";

// Admin > Relatorios: exporta CSV do dashboard (geral + por colaborador) e da
// lista de atendimentos, no periodo selecionado. Reusa as APIs de metricas.
import { useState, useEffect } from "react";
import { Download, Loader2, FileSpreadsheet, Archive } from "lucide-react";
import { Cabecalho } from "./VendedoresAdmin";
import { FiltroPeriodo } from "@/components/dashboard/FiltroPeriodo";
import { queryDoFiltro, type FiltroValor } from "@/components/dashboard/tipos";
import { useToast } from "@/components/ui/Toast";

// Monta um CSV a partir de cabecalhos e linhas (escapando aspas/virgulas).
function paraCsv(headers: string[], linhas: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...linhas].map((l) => l.map(esc).join(";")).join("\n");
}

function baixar(nome: string, conteudo: string) {
  const blob = new Blob(["﻿" + conteudo], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

const COLS_METRICA = [
  "clientesAtendidos",
  "abertos",
  "pendentes",
  "finalizados",
  "ganhos",
  "perdidos",
  "conversao",
  "valorVendido",
  "ticketMedio",
  "msgEnviadas",
  "msgRecebidas",
  "tempoPrimeiraRespostaSeg",
  "tempoResolucaoSeg",
  // Detalhamento do ganho de POS-VENDA por tipo. Somam os ganhos de pos-venda do
  // escopo; "SemTipo" sao os resolvidos antigos, sem classificacao. Na linha de
  // Venda vem zerado (a venda nao tem tipo de ganho).
  "posVendaGanhoDuvida",
  "posVendaGanhoPagamento",
  "posVendaGanhoGarantia",
  "posVendaGanhoSemTipo",
] as const;

export function RelatoriosAdmin() {
  const toast = useToast();
  const [filtro, setFiltro] = useState<FiltroValor>({ periodo: "mes" });
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function exportarMetricas() {
    setOcupado("metricas");
    try {
      const r = await fetch(`/api/admin/dashboard?${queryDoFiltro(filtro)}`);
      if (!r.ok) {
        toast.erro("Nao foi possivel exportar o relatorio.");
        return;
      }
      const d = await r.json();
      const headers = ["escopo", "nome", "acesso", ...COLS_METRICA];
      const linhas: (string | number)[][] = [];
      const linhaM = (escopo: string, nome: string, acesso: string, m: Record<string, number>) =>
        [escopo, nome, acesso, ...COLS_METRICA.map((c) => m[c] ?? 0)];
      linhas.push(linhaM("Geral", "Todos", "-", d.geral));
      linhas.push(linhaM("Finalidade", "Venda", "-", d.porFinalidade.venda));
      linhas.push(
        linhaM("Finalidade", "Pos-venda", "-", d.porFinalidade.posVenda),
      );
      for (const c of d.porColaborador) {
        linhas.push(linhaM("Colaborador", c.nome, c.acesso, c.metricas));
      }
      baixar(`metricas-${Date.now()}.csv`, paraCsv(headers, linhas));
      toast.sucesso("Relatorio exportado.");
    } catch {
      toast.erro("Nao foi possivel exportar o relatorio.");
    } finally {
      setOcupado(null);
    }
  }

  async function exportarAtendimentos() {
    setOcupado("atendimentos");
    try {
      const qs = queryDoFiltro(filtro);
      const rc = await fetch(`/api/admin/colaboradores?${qs}`);
      if (!rc.ok) {
        toast.erro("Nao foi possivel exportar o relatorio.");
        return;
      }
      const { colaboradores } = await rc.json();
      const headers = [
        "colaborador",
        "status",
        "cliente",
        "telefone",
        "finalidade",
        "etapa",
        "valor",
        "ultimaMensagemEm",
      ];
      const linhas: (string | number)[][] = [];
      for (const c of colaboradores) {
        for (const status of ["aovivo", "pendente", "finalizado"]) {
          const r = await fetch(
            `/api/admin/colaboradores/${c.id}/atendimentos?status=${status}&${qs}`,
          );
          if (!r.ok) continue;
          const { atendimentos } = await r.json();
          for (const a of atendimentos) {
            linhas.push([
              c.nome,
              status,
              a.leadNome ?? "",
              a.leadTelefone ?? "",
              a.finalidade === "POS_VENDA" ? "Pos-venda" : "Venda",
              a.etapaNome ?? "",
              a.valor ?? "",
              a.ultimaMensagemEm
                ? new Date(a.ultimaMensagemEm).toLocaleString("pt-BR")
                : "",
            ]);
          }
        }
      }
      baixar(`atendimentos-${Date.now()}.csv`, paraCsv(headers, linhas));
      toast.sucesso("Relatorio exportado.");
    } catch {
      toast.erro("Nao foi possivel exportar o relatorio.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="p-6">
      <Cabecalho
        titulo="Relatorios"
        subtitulo="Exportacao em CSV do periodo selecionado"
        acao={<FiltroPeriodo valor={filtro} onChange={setFiltro} />}
      />

      <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
        <Cartao
          titulo="Metricas (geral + por colaborador)"
          descricao="Clientes, casos, conversao, valor, tempos, finalidade e o ganho de pos-venda por tipo."
          ocupado={ocupado === "metricas"}
          onClick={() => void exportarMetricas()}
        />
        <Cartao
          titulo="Atendimentos"
          descricao="Lista de atendimentos (ao vivo, pendentes e finalizados)."
          ocupado={ocupado === "atendimentos"}
          onClick={() => void exportarAtendimentos()}
        />
      </div>

      <EncerramentosManuais filtro={filtro} />
    </div>
  );
}

type LinhaEncerramento = {
  agenteId: string | null;
  nome: string;
  total: number;
  venda: number;
  posVenda: number;
};

type RespostaEncerramentos = {
  total: number;
  porVendedor: LinhaEncerramento[];
  desde: string | null;
};

// Quem encerra atendimento na mao, e quanto. O botao "Encerrar" tira o card do
// quadro sem marcar venda nem perda — legitimo para o cliente que volta so com
// uma duvida, e tambem a saida mais facil para se livrar de um atendimento. O
// numero por vendedor e o que deixa um exagero visivel.
//
// Usa o MESMO periodo do resto da tela (o seletor do cabecalho), entao trocar o
// periodo la recarrega esta lista junto.
function EncerramentosManuais({ filtro }: { filtro: FiltroValor }) {
  const [dados, setDados] = useState<RespostaEncerramentos | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch(`/api/admin/encerramentos-manuais?${queryDoFiltro(filtro)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: RespostaEncerramentos) => {
        if (!vivo) return;
        setDados(d);
        setErro(false);
      })
      .catch(() => {
        if (vivo) setErro(true);
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    // Ignora a resposta de um periodo que ja nao esta na tela.
    return () => {
      vivo = false;
    };
  }, [filtro]);

  return (
    <div className="mt-4 max-w-2xl rounded-xl border border-black/5 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <Archive className="h-5 w-5 text-tiffany" />
        <p className="text-sm font-semibold text-escuro">
          Encerramentos manuais
        </p>
      </div>
      <p className="mb-3 text-xs text-medio/60">
        Atendimentos tirados do quadro pelo botao &quot;Encerrar&quot;, sem virar
        venda nem perda, no periodo selecionado.
      </p>

      {carregando ? (
        <div className="skeleton h-24 rounded-lg" />
      ) : erro ? (
        <p className="text-xs text-medio/60">
          Nao foi possivel carregar os encerramentos.
        </p>
      ) : !dados || dados.total === 0 ? (
        <p className="text-xs text-medio/60">
          Nenhum encerramento manual no periodo.
        </p>
      ) : (
        <>
          <p className="mb-2 text-2xl font-semibold text-escuro">
            {dados.total}
            <span className="ml-1.5 text-xs font-normal text-medio/60">
              {dados.total === 1 ? "encerramento" : "encerramentos"}
            </span>
          </p>
          <ul className="divide-y divide-black/5">
            {dados.porVendedor.map((v) => (
              <li
                key={v.agenteId ?? "sem-dono"}
                className="flex items-baseline justify-between gap-3 py-1.5"
              >
                <span className="truncate text-sm text-escuro">{v.nome}</span>
                <span className="flex items-baseline gap-2">
                  {/* A quebra so aparece quando ha os dois lados: numa base so
                      de venda ela seria ruido repetindo o total. */}
                  {v.venda > 0 && v.posVenda > 0 && (
                    <span className="text-[11px] text-medio/50">
                      {v.venda} venda · {v.posVenda} pos-venda
                    </span>
                  )}
                  <span className="text-sm font-semibold text-escuro">
                    {v.total}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* O relatorio so enxerga o que foi encerrado DEPOIS do recurso existir:
          arquivamento antigo nao guarda a origem. Dizer isso evita ler um numero
          baixo como "quase ninguem encerra" quando e so historico curto. */}
      {!carregando && !erro && dados?.desde && (
        <p className="mt-3 border-t border-black/5 pt-2 text-[11px] text-medio/50">
          Conta a partir de{" "}
          {new Date(dados.desde).toLocaleDateString("pt-BR")}, quando o
          encerramento manual passou a ser registrado. Cards arquivados antes
          disso nao guardam a origem e ficam de fora.
        </p>
      )}
    </div>
  );
}

function Cartao({
  titulo,
  descricao,
  ocupado,
  onClick,
}: {
  titulo: string;
  descricao: string;
  ocupado: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-tiffany" />
        <p className="text-sm font-semibold text-escuro">{titulo}</p>
      </div>
      <p className="mb-3 text-xs text-medio/60">{descricao}</p>
      <button
        onClick={onClick}
        disabled={ocupado}
        className="flex items-center gap-2 rounded-lg bg-tiffany px-3 py-2 text-sm font-semibold text-white hover:bg-tiffany-escuro disabled:opacity-60"
      >
        {ocupado ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Exportar CSV
      </button>
    </div>
  );
}
