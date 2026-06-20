"use client";

// Admin > Relatorios: exporta CSV do dashboard (geral + por colaborador) e da
// lista de atendimentos, no periodo selecionado. Reusa as APIs de metricas.
import { useState } from "react";
import { Download, Loader2, FileSpreadsheet } from "lucide-react";
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
          descricao="Clientes, casos, conversao, valor, tempos e finalidade."
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
