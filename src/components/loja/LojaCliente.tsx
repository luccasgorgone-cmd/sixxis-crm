"use client";

// Aba "Loja" do painel/inspecao: cadastro do cliente na loja, pedidos (com
// itens e rastreio), carrinho atual e a jornada (origem + carrinho + pedidos).
// Busca pelo telefone do lead. Estado vazio elegante quando nao ha cadastro.
import { useState, useEffect, useCallback } from "react";
import {
  ShoppingBag,
  Package,
  Truck,
  ExternalLink,
  WifiOff,
  User,
  Sparkles,
  ShoppingCart,
  Receipt,
} from "lucide-react";
import { formatarBRL } from "@/lib/format";
import type { ClienteLoja, PedidoLoja } from "./tipos";

const COR_STATUS: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-700",
  pago: "bg-green-100 text-green-700",
  aprovado: "bg-green-100 text-green-700",
  enviado: "bg-sky-100 text-sky-700",
  entregue: "bg-green-100 text-green-700",
  cancelado: "bg-red-100 text-red-700",
};

function corStatus(s: string): string {
  return COR_STATUS[s.toLowerCase()] ?? "bg-black/10 text-medio/70";
}

function dataCurta(v: string): string {
  return new Date(v).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function LojaCliente({
  telefone,
  origem,
}: {
  telefone: string;
  origem?: string | null;
}) {
  const [dados, setDados] = useState<ClienteLoja | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [offline, setOffline] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(
        `/api/loja/cliente?telefone=${encodeURIComponent(telefone)}`,
      );
      const d = await r.json();
      setDados(d);
      setOffline(Boolean(d.offline));
    } catch {
      setOffline(true);
    } finally {
      setCarregando(false);
    }
  }, [telefone]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-16 w-full rounded-xl" />
        <div className="skeleton h-24 w-full rounded-xl" />
        <div className="skeleton h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (offline) {
    return (
      <Vazio
        icone={WifiOff}
        titulo="Loja indisponivel"
        texto="Nao foi possivel consultar a loja agora. Tente novamente."
      />
    );
  }

  const cliente = dados?.cliente ?? null;
  const pedidos = dados?.pedidos ?? [];
  const carrinho = dados?.carrinho ?? null;

  if (!cliente && pedidos.length === 0 && !carrinho) {
    return (
      <Vazio
        icone={ShoppingBag}
        titulo="Sem cadastro na loja"
        texto="Este telefone ainda nao tem cliente, pedidos ou carrinho na loja."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Cadastro */}
      <Secao titulo="Cliente na loja">
        {cliente ? (
          <div className="rounded-xl border border-black/5 bg-white p-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-tiffany" />
              <p className="text-sm font-semibold text-escuro">
                {cliente.nome}
              </p>
            </div>
            <p className="mt-1 text-xs text-medio/60">{cliente.email}</p>
            {cliente.telefone && (
              <p className="text-xs text-medio/60">{cliente.telefone}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-medio/50">
            Sem cadastro, mas ha historico abaixo.
          </p>
        )}
      </Secao>

      {/* Jornada */}
      <Secao titulo="Jornada">
        <Jornada origem={origem} pedidos={pedidos} carrinho={carrinho} />
      </Secao>

      {/* Pedidos */}
      <Secao titulo={`Pedidos (${pedidos.length})`}>
        {pedidos.length === 0 ? (
          <p className="text-sm text-medio/50">Nenhum pedido.</p>
        ) : (
          <div className="space-y-2">
            {pedidos.map((p) => (
              <CartaoPedido key={p.id} pedido={p} />
            ))}
          </div>
        )}
      </Secao>

      {/* Carrinho */}
      <Secao titulo="Carrinho atual">
        {carrinho && carrinho.length > 0 ? (
          <div className="rounded-xl border border-black/5 bg-white p-3">
            {carrinho.map((it, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b border-black/5 py-1.5 text-sm last:border-0"
              >
                <span className="min-w-0 truncate text-escuro">
                  {it.qtd}x {it.nome}
                </span>
                <span className="shrink-0 font-medium text-medio">
                  {formatarBRL(it.preco)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-medio/50">Carrinho vazio.</p>
        )}
      </Secao>
    </div>
  );
}

function CartaoPedido({ pedido }: { pedido: PedidoLoja }) {
  return (
    <div className="rounded-xl border border-black/5 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-escuro">
          <Receipt className="h-4 w-4 text-medio/50" />
          {pedido.numero}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${corStatus(pedido.status)}`}
        >
          {pedido.status}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-medio/60">
        <span>{dataCurta(pedido.criadoEm)}</span>
        <span className="font-semibold text-tiffany-escuro">
          {formatarBRL(pedido.total)}
        </span>
      </div>
      {pedido.itens.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {pedido.itens.map((it, i) => (
            <li key={i} className="text-xs text-medio/70">
              {it.qtd}x {it.nome} · {formatarBRL(it.preco)}
            </li>
          ))}
        </ul>
      )}
      {pedido.rastreio && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <Truck className="h-3.5 w-3.5 text-medio/50" />
          <span className="text-medio/70">
            {pedido.rastreio.transportadora ?? "Rastreio"}
          </span>
          {pedido.rastreio.link && (
            <a
              href={pedido.rastreio.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-tiffany hover:underline"
            >
              acompanhar <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

// Linha do tempo combinando origem + carrinho + pedidos (mais recente primeiro).
function Jornada({
  origem,
  pedidos,
  carrinho,
}: {
  origem?: string | null;
  pedidos: PedidoLoja[];
  carrinho: { nome: string }[] | null;
}) {
  type Evento = {
    icone: typeof Package;
    titulo: string;
    detalhe: string;
    data?: string;
  };
  const eventos: Evento[] = [];

  if (carrinho && carrinho.length > 0) {
    eventos.push({
      icone: ShoppingCart,
      titulo: "Carrinho ativo",
      detalhe: `${carrinho.length} item(ns) aguardando checkout`,
    });
  }
  for (const p of pedidos) {
    eventos.push({
      icone: Package,
      titulo: `Pedido ${p.numero}`,
      detalhe: `${p.status} · ${formatarBRL(p.total)}`,
      data: p.criadoEm,
    });
  }
  eventos.push({
    icone: Sparkles,
    titulo: "Origem do lead",
    detalhe: origem?.trim() ? origem : "Nao informada",
  });

  return (
    <ol className="space-y-3">
      {eventos.map((e, i) => {
        const Icone = e.icone;
        return (
          <li key={i} className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tiffany/10 text-tiffany">
              <Icone className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-escuro">{e.titulo}</p>
              <p className="text-[11px] text-medio/50">
                {e.detalhe}
                {e.data ? ` · ${dataCurta(e.data)}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-medio/50">
        {titulo}
      </h4>
      {children}
    </section>
  );
}

function Vazio({
  icone: Icone,
  titulo,
  texto,
}: {
  icone: typeof ShoppingBag;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-tiffany/10">
        <Icone className="h-6 w-6 text-tiffany" />
      </div>
      <p className="text-sm font-medium text-escuro">{titulo}</p>
      <p className="max-w-xs text-xs text-medio/60">{texto}</p>
    </div>
  );
}
