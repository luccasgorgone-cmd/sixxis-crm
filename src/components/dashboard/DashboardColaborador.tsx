"use client";

// Dashboard do colaborador: metricas do proprio atendimento, com filtro de
// periodo, cartoes, grafico de tendencia e posicao no ranking. Sem finalidade.
import { useState, useEffect, useCallback } from "react";
import {
  Users,
  FolderOpen,
  Clock4,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Send,
  Trophy,
} from "lucide-react";
import { FiltroPeriodo } from "./FiltroPeriodo";
import { Cartao, CartaoSkeleton } from "./Cartao";
import { GraficoTendencia } from "./GraficoTendencia";
import { queryDoFiltro, type FiltroValor, type Metricas, type PontoTendencia } from "./tipos";
import { formatarBRL, formatarPct, formatarDuracao } from "@/lib/format";
import { EstadoErro } from "@/components/ui/Estado";

type Resposta = {
  metricas: Metricas;
  tendencia: PontoTendencia[];
  ranking: { posicao: number; total: number };
};

export function DashboardColaborador() {
  const [filtro, setFiltro] = useState<FiltroValor>({ periodo: "mes" });
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/dashboard?${queryDoFiltro(filtro)}`);
      if (r.ok) {
        setDados(await r.json());
        setErro(false);
      } else {
        setErro(true);
      }
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [filtro]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const m = dados?.metricas;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-escuro">Meu painel</h2>
          <p className="text-sm text-medio/60">
            Seus atendimentos no periodo selecionado
          </p>
        </div>
        <FiltroPeriodo valor={filtro} onChange={setFiltro} />
      </div>

      {carregando ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CartaoSkeleton key={i} />
          ))}
        </div>
      ) : erro || !m ? (
        <EstadoErro
          mensagem="Nao foi possivel carregar suas metricas."
          onRetry={() => void carregar()}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Cartao
              rotulo="Clientes atendidos"
              valor={m.clientesAtendidos}
              icone={Users}
              destaque
            />
            <Cartao rotulo="Em aberto" valor={m.abertos} icone={FolderOpen} />
            <Cartao
              rotulo="Atendimentos pendentes"
              valor={m.pendentes}
              icone={Clock4}
            />
            <Cartao
              rotulo="Finalizados"
              valor={m.finalizados}
              detalhe={`${m.ganhos} ganhos · ${m.perdidos} perdidos`}
              icone={CheckCircle2}
            />
            <Cartao
              rotulo="Conversao"
              valor={formatarPct(m.conversao)}
              icone={TrendingUp}
            />
            <Cartao
              rotulo="Valor vendido"
              valor={formatarBRL(m.valorVendido)}
              detalhe={`Ticket ${formatarBRL(m.ticketMedio)}`}
              icone={DollarSign}
            />
            <Cartao
              rotulo="Mensagens"
              valor={`${m.msgEnviadas}/${m.msgRecebidas}`}
              detalhe="enviadas / recebidas"
              icone={Send}
            />
            <Cartao
              rotulo="Ranking"
              valor={
                dados.ranking.posicao > 0
                  ? `${dados.ranking.posicao}o`
                  : "—"
              }
              detalhe={`de ${dados.ranking.total}`}
              icone={Trophy}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Cartao
              rotulo="Tempo medio de 1a resposta"
              valor={formatarDuracao(m.tempoPrimeiraRespostaSeg)}
              icone={Clock4}
            />
            <Cartao
              rotulo="Tempo medio de resolucao"
              valor={formatarDuracao(m.tempoResolucaoSeg)}
              icone={Clock4}
            />
          </div>

          <GraficoTendencia dados={dados.tendencia} />
        </>
      )}
    </div>
  );
}
