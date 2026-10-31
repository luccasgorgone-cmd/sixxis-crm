"use client";

// Painel da PROSPECCAO ATIVA (Manual Fase 2). Meta diaria (10 cadastros + 10 1os
// contatos), contatos agrupados por fase e acoes do vendedor (registrar tentativa
// num canal, qualificar -> funil normal, encerrar). Nao envia mensagem ao cliente.
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";

type Lead = {
  id: string;
  nome: string | null;
  nomeManual: string | null;
  pushName: string | null;
  telefone: string;
  empresa: string | null;
};
type Contato = {
  id: string;
  fase: string;
  tentativas: number;
  canais: string[] | null;
  primeiroContatoEm: string | null;
  proximaAcaoEm: string | null;
  nutricaoAte: string | null;
  lead: Lead;
};
type Meta = {
  cadastradosHoje: number;
  primeirosContatosHoje: number;
  carteiraAtivadosHoje: number;
  alvo: number;
};
// Prospeccoes ativas = clientes que o vendedor COMECOU (enviou a 1a mensagem):
// carteira de leads ativada + numeros adicionados diretamente.
type ProspAtivas = { carteira: number; diretos: number; total: number };

const ORDEM_FASE = ["ABORDAGEM", "QUALIFICACAO", "PROPOSTA", "FECHAMENTO", "NUTRICAO", "QUALIFICADO", "ENCERRADO"];
const ROTULO_FASE: Record<string, string> = {
  ABORDAGEM: "Abordagem", QUALIFICACAO: "Qualificação", PROPOSTA: "Proposta",
  FECHAMENTO: "Fechamento", NUTRICAO: "Nutrição (90d)", QUALIFICADO: "Qualificado", ENCERRADO: "Encerrado",
};

function nomeLead(l: Lead): string {
  return l.nomeManual || l.nome || l.pushName || l.telefone;
}

export function PainelProspeccao() {
  const toast = useToast();
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [prospAtivas, setProspAtivas] = useState<ProspAtivas | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/prospeccao");
      if (r.ok) {
        const d = await r.json();
        setContatos(d.contatos ?? []);
        setMeta(d.meta ?? null);
        setProspAtivas(d.prospeccoesAtivas ?? null);
      }
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  async function acao(body: Record<string, unknown>, ok: string) {
    const r = await fetch("/api/prospeccao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => null);
    if (r.ok) {
      toast.sucesso(ok);
      void carregar();
    } else {
      toast.erro(d?.erro ?? "Não foi possível concluir.");
    }
  }

  function registrarTentativa(id: string) {
    const canal = window.prompt("Canal da tentativa (ex.: whatsapp, ligacao, email):", "ligacao");
    if (!canal?.trim()) return;
    void acao({ acao: "tentativa", id, canal: canal.trim() }, "Tentativa registrada.");
  }
  function qualificar(id: string) {
    if (!window.confirm("Qualificar este contato e promover ao funil de venda?")) return;
    void acao({ acao: "qualificar", id }, "Contato qualificado — entrou no funil.");
  }
  function encerrar(id: string) {
    const motivo = window.prompt("Encerrar — motivo (sem_resposta ou nao_qualificado):", "sem_resposta");
    if (!motivo?.trim()) return;
    void acao({ acao: "encerrar", id, motivo: motivo.trim() }, "Contato encerrado.");
  }

  const porFase = ORDEM_FASE.map((f) => ({ fase: f, itens: contatos.filter((c) => c.fase === f) })).filter((g) => g.itens.length > 0);
  const ativo = (f: string) => ["ABORDAGEM", "QUALIFICACAO", "PROPOSTA", "FECHAMENTO"].includes(f);

  return (
    <div className="mx-auto max-w-4xl p-4">
      <h1 className="mb-3 text-lg font-semibold text-escuro">Prospecção ativa</h1>

      {prospAtivas && (
        <div className="mb-4 rounded-xl border border-tiffany/20 bg-tiffany/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-tiffany-escuro">
            Prospecções ativas (clientes que você começou)
          </p>
          <p className="mt-1 text-3xl font-bold text-escuro">{prospAtivas.total}</p>
          <p className="mt-1 text-xs text-medio/70">
            {prospAtivas.carteira} da carteira de leads · {prospAtivas.diretos} adicionados diretamente
          </p>
        </div>
      )}

      {meta && (
        <div className="mb-4 grid grid-cols-3 gap-3">
          <MetaCard rotulo="Cadastros hoje" valor={meta.cadastradosHoje} alvo={meta.alvo} />
          <MetaCard rotulo="1º contatos hoje" valor={meta.primeirosContatosHoje} alvo={meta.alvo} />
          <MetaCard rotulo="Carteira abordados hoje" valor={meta.carteiraAtivadosHoje} alvo={meta.alvo} />
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-medio/60">Carregando…</p>
      ) : porFase.length === 0 ? (
        <p className="text-sm text-medio/60">Nenhum contato de prospecção ainda.</p>
      ) : (
        porFase.map((g) => (
          <section key={g.fase} className="mb-4">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-medio/70">
              {ROTULO_FASE[g.fase] ?? g.fase} · {g.itens.length}
            </h2>
            <div className="space-y-2">
              {g.itens.map((c) => (
                <div key={c.id} className="rounded-lg border border-black/5 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-escuro">{nomeLead(c.lead)}</p>
                      <p className="truncate text-xs text-medio/60">
                        {c.lead.empresa ? `${c.lead.empresa} · ` : ""}{c.lead.telefone}
                      </p>
                      <p className="mt-0.5 text-xs text-medio/50">
                        {c.tentativas} tentativa(s) · {(c.canais ?? []).length} canal(is)
                        {(c.canais ?? []).length > 0 ? ` (${(c.canais ?? []).join(", ")})` : ""}
                      </p>
                    </div>
                    {ativo(c.fase) && (
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        <button onClick={() => registrarTentativa(c.id)} className="rounded-md border border-black/10 px-2 py-1 text-xs hover:bg-fundo">Tentativa</button>
                        <button onClick={() => qualificar(c.id)} className="rounded-md bg-tiffany/10 px-2 py-1 text-xs text-tiffany hover:bg-tiffany/20">Qualificar</button>
                        <button onClick={() => encerrar(c.id)} className="rounded-md border border-black/10 px-2 py-1 text-xs text-medio hover:bg-fundo">Encerrar</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function MetaCard({ rotulo, valor, alvo }: { rotulo: string; valor: number; alvo: number }) {
  const ok = valor >= alvo;
  return (
    <div className="rounded-lg border border-black/5 bg-white p-3">
      <p className="text-xs text-medio/60">{rotulo}</p>
      <p className={`text-xl font-semibold ${ok ? "text-tiffany" : "text-escuro"}`}>
        {valor}<span className="text-sm text-medio/40"> / {alvo}</span>
      </p>
    </div>
  );
}
