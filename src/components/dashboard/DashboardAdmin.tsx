"use client";

// Dashboard do admin: visao geral combinada, recorte por finalidade, grafico de
// tendencia e tabela/ranking por colaborador (ordenavel). Somente admin.
import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  FolderOpen,
  Clock4,
  CheckCircle2,
  TrendingUp,
  DollarSign,
  Send,
  ArrowUpDown,
} from "lucide-react";
import { FiltroPeriodo } from "./FiltroPeriodo";
import { Cartao, CartaoSkeleton } from "./Cartao";
import { GraficoTendencia } from "./GraficoTendencia";
import {
  queryDoFiltro,
  type FiltroValor,
  type Metricas,
  type PontoTendencia,
} from "./tipos";
import { formatarBRL, formatarPct, formatarDuracao } from "@/lib/format";
import { EstadoErro } from "@/components/ui/Estado";
import { BadgeAcesso } from "@/components/badges";
import { BannerAviso } from "@/components/ui/Banner";

type Linha = { id: string; nome: string; acesso: string; metricas: Metricas };
type Resposta = {
  geral: Metricas;
  porFinalidade: { venda: Metricas; posVenda: Metricas };
  tendencia: PontoTendencia[];
  porColaborador: Linha[];
};

type ChaveOrdem =
  | "nome"
  | "clientesAtendidos"
  | "abertos"
  | "pendentes"
  | "finalizados"
  | "conversao"
  | "valorVendido";

export function DashboardAdmin() {
  const router = useRouter();
  const [filtro, setFiltro] = useState<FiltroValor>({ periodo: "mes" });
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [semColaborador, setSemColaborador] = useState(false);
  const [ordem, setOrdem] = useState<{ chave: ChaveOrdem; dir: 1 | -1 }>({
    chave: "valorVendido",
    dir: -1,
  });

  // Existe colaborador ativo (nao-admin) com acesso a alguma finalidade?
  useEffect(() => {
    fetch("/api/admin/vendedores")
      .then((r) => (r.ok ? r.json() : { agentes: [] }))
      .then((d) => {
        const algum = (d.agentes ?? []).some(
          (a: { papel: string; ativo: boolean; acessoVenda: boolean; acessoPosVenda: boolean }) =>
            a.papel !== "ADMIN" && a.ativo && (a.acessoVenda || a.acessoPosVenda),
        );
        setSemColaborador(!algum);
      })
      .catch(() => undefined);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/admin/dashboard?${queryDoFiltro(filtro)}`);
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

  const linhas = useMemo(() => {
    if (!dados) return [];
    const arr = [...dados.porColaborador];
    arr.sort((a, b) => {
      const av =
        ordem.chave === "nome" ? a.nome : (a.metricas[ordem.chave] as number);
      const bv =
        ordem.chave === "nome" ? b.nome : (b.metricas[ordem.chave] as number);
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * ordem.dir;
      }
      return ((av as number) - (bv as number)) * ordem.dir;
    });
    return arr;
  }, [dados, ordem]);

  function ordenar(chave: ChaveOrdem) {
    setOrdem((o) =>
      o.chave === chave ? { chave, dir: (o.dir * -1) as 1 | -1 } : { chave, dir: -1 },
    );
  }

  const g = dados?.geral;

  return (
    <div className="space-y-4 p-6">
      {semColaborador && (
        <BannerAviso className="-mx-6 -mt-6 mb-2">
          Nenhum colaborador ativo — novos leads nao serao distribuidos
          automaticamente. Cadastre/ative colaboradores ou atribua manualmente.
        </BannerAviso>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-escuro">
            Painel da operacao
          </h2>
          <p className="text-sm text-medio/60">Visao geral de toda a equipe</p>
        </div>
        <FiltroPeriodo valor={filtro} onChange={setFiltro} />
      </div>

      {carregando ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CartaoSkeleton key={i} />
          ))}
        </div>
      ) : erro || !g || !dados ? (
        <EstadoErro
          mensagem="Nao foi possivel carregar o painel da operacao."
          onRetry={() => void carregar()}
        />
      ) : (
        <>
          {/* Visao geral combinada */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Cartao
              rotulo="Clientes atendidos"
              valor={g.clientesAtendidos}
              icone={Users}
              destaque
            />
            <Cartao rotulo="Em aberto" valor={g.abertos} icone={FolderOpen} />
            <Cartao
              rotulo="Atendimentos pendentes"
              valor={g.pendentes}
              icone={Clock4}
            />
            <Cartao
              rotulo="Finalizados"
              valor={g.finalizados}
              detalhe={`${g.ganhos} ganhos · ${g.perdidos} perdidos`}
              icone={CheckCircle2}
            />
            <Cartao
              rotulo="Conversao"
              valor={formatarPct(g.conversao)}
              icone={TrendingUp}
            />
            <Cartao
              rotulo="Valor total"
              valor={formatarBRL(g.valorVendido)}
              detalhe={`Ticket ${formatarBRL(g.ticketMedio)}`}
              icone={DollarSign}
            />
            <Cartao
              rotulo="1a resposta / resolucao"
              valor={formatarDuracao(g.tempoPrimeiraRespostaSeg)}
              detalhe={`resolucao ${formatarDuracao(g.tempoResolucaoSeg)}`}
              icone={Clock4}
            />
            <Cartao
              rotulo="Mensagens"
              valor={`${g.msgEnviadas}/${g.msgRecebidas}`}
              detalhe="enviadas / recebidas"
              icone={Send}
            />
          </div>

          {/* Recorte por finalidade (so admin) */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <RecorteFinalidade titulo="Venda" m={dados.porFinalidade.venda} />
            <RecorteFinalidade
              titulo="Pos-venda"
              m={dados.porFinalidade.posVenda}
            />
          </div>

          <GraficoTendencia dados={dados.tendencia} />

          {/* Tabela por colaborador */}
          <div className="overflow-x-auto rounded-xl border border-black/5 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-black/5 text-left text-xs uppercase tracking-wide text-medio/50">
                <tr>
                  <Th label="Colaborador" onClick={() => ordenar("nome")} />
                  <th className="px-3 py-2.5 font-medium">Acesso</th>
                  <Th label="Clientes" onClick={() => ordenar("clientesAtendidos")} />
                  <Th label="Abertos" onClick={() => ordenar("abertos")} />
                  <Th label="Atend. pendentes" onClick={() => ordenar("pendentes")} />
                  <Th label="Finalizados" onClick={() => ordenar("finalizados")} />
                  <Th label="Conversao" onClick={() => ordenar("conversao")} />
                  <Th label="Valor" onClick={() => ordenar("valorVendido")} />
                  <th className="px-3 py-2.5 font-medium">1a resp.</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => router.push(`/admin/colaboradores/${l.id}`)}
                    className="cursor-pointer border-b border-black/5 last:border-0 hover:bg-fundo"
                  >
                    <td className="px-3 py-2.5 font-medium text-escuro">
                      {l.nome}
                    </td>
                    <td className="px-3 py-2.5">
                      <BadgeAcesso acesso={l.acesso} />
                    </td>
                    <td className="px-3 py-2.5">{l.metricas.clientesAtendidos}</td>
                    <td className="px-3 py-2.5">{l.metricas.abertos}</td>
                    <td className="px-3 py-2.5">{l.metricas.pendentes}</td>
                    <td className="px-3 py-2.5">{l.metricas.finalizados}</td>
                    <td className="px-3 py-2.5">
                      {formatarPct(l.metricas.conversao)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-tiffany-escuro">
                      {formatarBRL(l.metricas.valorVendido)}
                    </td>
                    <td className="px-3 py-2.5 text-medio/60">
                      {formatarDuracao(l.metricas.tempoPrimeiraRespostaSeg)}
                    </td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-medio/50">
                      Nenhum colaborador.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Th({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th className="px-3 py-2.5 font-medium">
      <button
        onClick={onClick}
        className="flex items-center gap-1 hover:text-escuro"
      >
        {label}
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      </button>
    </th>
  );
}

function RecorteFinalidade({ titulo, m }: { titulo: string; m: Metricas }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-4">
      <p className="mb-3 text-sm font-semibold text-escuro">{titulo}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini rotulo="Clientes" valor={m.clientesAtendidos} />
        <Mini rotulo="Finalizados" valor={m.finalizados} />
        <Mini rotulo="Conversao" valor={formatarPct(m.conversao)} />
        <Mini rotulo="Valor" valor={formatarBRL(m.valorVendido)} />
      </div>
    </div>
  );
}

function Mini({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div>
      <p className="text-xs text-medio/50">{rotulo}</p>
      <p className="text-lg font-semibold text-escuro">{valor}</p>
    </div>
  );
}
