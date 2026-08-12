// Admin: MARCAR VENDA CONFIRMADA — acerta o CARD de vendas que aconteceram no
// site e ficaram erradas no CRM. Correcao PONTUAL e NOMINAL: age so nos negocios
// que quem chama nomeia, um por um, com o valor de cada um.
//
// ISTO NAO E CORRECAO DE FATURAMENTO. Depois da Fatia 14 o faturamento ja conta
// esses casos pela data do ganho. O que esta errado e o CARD: status, valor e
// coluna no funil. E uma correcao de TELA.
//
// DOIS CASOS, tratados diferente — e a diferenca e o coracao desta rota:
//
//   JA TEVE GANHO (jaFoiGanho ou evento GANHO valido no historico): a venda ja
//   esta registrada, so o card se perdeu. Ajusta status/valor/etapa e NAO cria
//   evento novo — criar duplicaria a venda no historico de compras do cliente e
//   inflaria o contador, exatamente o que a Fatia 9 existe para desfazer.
//   fechadoEm REUSA a data do ganho original: carimbar hoje moveria a venda de
//   mes no relatorio.
//
//   NUNCA TEVE GANHO (venda so no site): a venda nao existe no CRM. Aqui SIM
//   cria-se UM evento de ganho, porque esta e a hora em que ela passa a existir.
//   fechadoEm = agora, que e quando o CRM soube.
//
// CONTADOR vezesGanho: +1 so na TRANSICAO para GANHO, a mesma regra do PATCH de
// negocios. Quem ja esta GANHO no momento da execucao nao conta de novo.
//
// META CAPI NAO DISPARA, por construcao: dispararPurchase vive dentro do PATCH
// de /api/negocios/[id], atras de `if (data.status === GANHO)`. Esta rota e
// outro arquivo e nao importa metaCapi — nao ha caminho daqui ate la. Correcao
// retroativa nao e conversao nova.
//
// A LISTA VEM POR PARAMETRO, nao esta no codigo: id, nome e telefone de cliente
// gravados no repositorio ficariam no historico do git para sempre.
//   ?itens=negocioId:valor,negocioId:valor      (valor com ponto decimal)
// O POST tambem aceita { itens: [{ negocioId, valor }] } no corpo.
//
// GET  = PREVIA: so le e diz o que faria em cada item. Nao escreve nada.
// POST = executa, uma transacao POR NEGOCIO. IDEMPOTENTE: na segunda passada o
//        negocio ja esta GANHO e ja tem ganho no historico, entao nao ha +1 nem
//        evento novo — so a reescrita do mesmo valor.
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { obterAdmin } from "@/lib/autorizacao";
import { nomeEfetivo } from "@/lib/cliente";
import { primeiraEtapaGanho } from "@/lib/negocio";
import { desarquivarConversaDoLead } from "@/lib/arquivamento";
import { ehGanhoDesconsiderado } from "@/lib/compras";
import { formatarBRL } from "@/lib/format";
import { StatusNeg, TipoHistorico } from "@/generated/prisma/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Pedido = { negocioId: string; valor: number };

type Plano = {
  negocioId: string;
  cliente: string | null;
  finalidade: string | null;
  // Estado ATUAL.
  statusAtual: string | null;
  etapaAtual: string | null;
  valorAtual: number | null;
  arquivado: boolean;
  // O que vira.
  valorNovo: number;
  etapaDestino: string | null;
  fechadoEmPrevisto: string | null;
  origemFechadoEm: string | null;
  // As duas decisoes que separam os dois casos.
  jaTinhaGanho: boolean;
  criaEvento: boolean;
  contaMais1: boolean;
  // Preenchido quando o item nao pode ser aplicado.
  problema: string | null;
};

function numeroOuNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// "id:valor,id:valor" -> lista. Valor invalido ou <= 0 derruba o item, nao a
// requisicao: uma venda com valor zero seria pior que um erro visivel.
function lerItens(bruto: string | null): Pedido[] {
  if (!bruto) return [];
  const out: Pedido[] = [];
  for (const parte of bruto.split(",")) {
    const [id, valor] = parte.split(":").map((s) => s.trim());
    if (!id) continue;
    // Id repetido na lista vale UMA vez: aplicar duas vezes no mesmo request
    // somaria dois +1 no contador do mesmo negocio.
    if (out.some((x) => x.negocioId === id)) continue;
    const n = Number(valor);
    out.push({ negocioId: id, valor: Number.isFinite(n) ? n : NaN });
  }
  return out;
}

async function lerEntrada(req: NextRequest): Promise<Pedido[]> {
  const itens = lerItens(req.nextUrl.searchParams.get("itens"));
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (Array.isArray(body?.itens)) {
        for (const i of body.itens) {
          if (!i?.negocioId) continue;
          const negocioId = String(i.negocioId);
          // O mesmo negocio na query e no corpo vale UMA vez: aplicar duas vezes
          // no mesmo request somaria dois +1 no contador.
          if (itens.some((x) => x.negocioId === negocioId)) continue;
          itens.push({ negocioId, valor: Number(i.valor) });
        }
      }
    } catch {
      // Sem corpo (ou corpo invalido): vale so a query.
    }
  }
  return itens;
}

// Monta o plano (leitura pura). Mesma funcao na previa e na execucao — o que o
// dono ve no GET e o que o POST faz.
async function montarPlano(pedidos: Pedido[]): Promise<Plano[]> {
  const planos: Plano[] = [];

  for (const p of pedidos) {
    const vazio = (problema: string): Plano => ({
      negocioId: p.negocioId,
      cliente: null,
      finalidade: null,
      statusAtual: null,
      etapaAtual: null,
      valorAtual: null,
      arquivado: false,
      valorNovo: p.valor,
      etapaDestino: null,
      fechadoEmPrevisto: null,
      origemFechadoEm: null,
      jaTinhaGanho: false,
      criaEvento: false,
      contaMais1: false,
      problema,
    });

    if (!Number.isFinite(p.valor) || p.valor <= 0) {
      planos.push(vazio("valor invalido ou <= 0"));
      continue;
    }

    const n = await prisma.negocio.findUnique({
      where: { id: p.negocioId },
      select: {
        id: true,
        status: true,
        valor: true,
        finalidade: true,
        arquivado: true,
        jaFoiGanho: true,
        ultimoGanhoEm: true,
        fechadoEm: true,
        etapa: { select: { nome: true } },
        lead: {
          select: {
            nome: true,
            pushName: true,
            nomeManual: true,
            telefone: true,
          },
        },
      },
    });
    if (!n) {
      planos.push(vazio("negocio nao encontrado"));
      continue;
    }

    // Prova de ganho anterior: a memoria no negocio OU um evento valido no
    // historico (os duplicados de movimentacao da Fatia 9 nao valem como prova).
    const eventos = await prisma.historicoNegocio.findMany({
      where: { negocioId: n.id, tipo: TipoHistorico.GANHO },
      orderBy: { criadoEm: "desc" },
      select: { criadoEm: true, descricao: true },
    });
    const validos = eventos.filter((e) => !ehGanhoDesconsiderado(e.descricao));
    const jaTinhaGanho = n.jaFoiGanho || validos.length > 0;

    const destino = await primeiraEtapaGanho(n.finalidade);

    // fechadoEm: reusa a data do ganho ORIGINAL quando ele existe. Carimbar hoje
    // moveria uma venda antiga para o mes atual no relatorio.
    let fechadoEm: Date;
    let origem: string;
    if (jaTinhaGanho) {
      if (n.ultimoGanhoEm) {
        fechadoEm = n.ultimoGanhoEm;
        origem = "ultimoGanhoEm (ganho original)";
      } else if (validos[0]) {
        fechadoEm = validos[0].criadoEm;
        origem = "historico GANHO (ganho original)";
      } else if (n.fechadoEm) {
        fechadoEm = n.fechadoEm;
        origem = "fechadoEm atual";
      } else {
        fechadoEm = new Date();
        origem = "agora (tinha ganho, mas sem data no registro)";
      }
    } else {
      fechadoEm = new Date();
      origem = "agora (venda passa a existir no CRM agora)";
    }

    planos.push({
      negocioId: n.id,
      cliente: nomeEfetivo(n.lead),
      finalidade: n.finalidade,
      statusAtual: n.status,
      etapaAtual: n.etapa?.nome ?? null,
      valorAtual: numeroOuNull(n.valor),
      arquivado: n.arquivado,
      valorNovo: p.valor,
      etapaDestino: destino?.nome ?? null,
      fechadoEmPrevisto: fechadoEm.toISOString(),
      origemFechadoEm: origem,
      jaTinhaGanho,
      // Evento novo SO quando a venda ainda nao existe no CRM.
      criaEvento: !jaTinhaGanho,
      // +1 so na transicao, como no PATCH.
      contaMais1: n.status !== StatusNeg.GANHO,
      problema: destino ? null : "funil sem etapa de ganho para esta finalidade",
    });
  }

  return planos;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const pedidos = await lerEntrada(req);
  if (pedidos.length === 0) {
    return NextResponse.json(
      { erro: "informe ?itens=negocioId:valor,negocioId:valor" },
      { status: 400 },
    );
  }
  const itens = await montarPlano(pedidos);
  return NextResponse.json({
    executado: false,
    previa: {
      itens,
      total: itens.length,
      aplicaveis: itens.filter((i) => !i.problema).length,
      comProblema: itens.filter((i) => i.problema).length,
      eventosQueSeraoCriados: itens.filter((i) => !i.problema && i.criaEvento)
        .length,
      contadoresQueSobem: itens.filter((i) => !i.problema && i.contaMais1).length,
    },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await obterAdmin();
  if (!admin) {
    return NextResponse.json({ erro: "sem permissao" }, { status: 403 });
  }
  const pedidos = await lerEntrada(req);
  if (pedidos.length === 0) {
    return NextResponse.json({ erro: "informe os itens" }, { status: 400 });
  }

  try {
    const planos = await montarPlano(pedidos);
    const aplicados: Plano[] = [];
    const pulados: Plano[] = [];
    const desarquivar: { leadId: string; finalidade: "VENDA" | "POS_VENDA" }[] =
      [];

    for (const plano of planos) {
      if (plano.problema) {
        pulados.push(plano);
        continue;
      }

      const ok = await prisma.$transaction(async (tx) => {
        // Rele DENTRO da transacao: entre a previa e agora o card pode ter sido
        // mexido na mao. O estado de agora e que decide o +1 e o evento.
        const atual = await tx.negocio.findUnique({
          where: { id: plano.negocioId },
          select: {
            status: true,
            jaFoiGanho: true,
            arquivado: true,
            leadId: true,
            finalidade: true,
          },
        });
        if (!atual) return false;

        const eventos = await tx.historicoNegocio.findMany({
          where: { negocioId: plano.negocioId, tipo: TipoHistorico.GANHO },
          select: { descricao: true },
        });
        const temGanho =
          atual.jaFoiGanho ||
          eventos.some((e) => !ehGanhoDesconsiderado(e.descricao));

        const criaEvento = !temGanho;
        const contaMais1 = atual.status !== StatusNeg.GANHO;
        const destino = await primeiraEtapaGanho(atual.finalidade);
        if (!destino) return false;

        await tx.negocio.update({
          where: { id: plano.negocioId },
          data: {
            status: StatusNeg.GANHO,
            valor: plano.valorNovo,
            etapaId: destino.id,
            entrouEtapaEm: new Date(),
            fechadoEm: plano.fechadoEmPrevisto
              ? new Date(plano.fechadoEmPrevisto)
              : undefined,
            // Memoria do ganho, para a venda sobreviver a uma reabertura futura.
            jaFoiGanho: true,
            ultimoGanhoEm: plano.fechadoEmPrevisto
              ? new Date(plano.fechadoEmPrevisto)
              : undefined,
            // Volta ao quadro em Vendido.
            arquivado: false,
            arquivadoEm: null,
            arquivadoMotivo: null,
            ...(contaMais1 ? { vezesGanho: { increment: 1 } } : {}),
            historicos: {
              create: criaEvento
                ? {
                    // A venda passa a existir no CRM agora: evento de GANHO, com
                    // o valor estruturado que o historico de compras soma.
                    tipo: TipoHistorico.GANHO,
                    descricao: `Negocio ganho (${formatarBRL(plano.valorNovo)}) — venda confirmada no site, registrada por ${admin.nome ?? "admin"}`,
                    valorGanho: plano.valorNovo,
                    agenteId: admin.id,
                  }
                : {
                    // A venda ja existe: so o card estava errado. NOTA, nunca
                    // GANHO — um evento novo duplicaria a compra do cliente.
                    tipo: TipoHistorico.NOTA,
                    descricao: `Card corrigido para venda confirmada (${formatarBRL(plano.valorNovo)}) — sem novo evento de ganho`,
                    agenteId: admin.id,
                  },
            },
          },
        });
        if (atual.arquivado) {
          desarquivar.push({
            leadId: atual.leadId,
            finalidade: atual.finalidade,
          });
        }
        return true;
      });

      if (ok) aplicados.push(plano);
      else pulados.push({ ...plano, problema: "mudou entre a previa e a execucao" });
    }

    // Conversa de volta ao Inbox para quem estava arquivado. Best-effort.
    for (const d of desarquivar) {
      await desarquivarConversaDoLead(d.leadId, d.finalidade);
    }

    const somaValor = aplicados.reduce((s, i) => s + i.valorNovo, 0);
    console.log(
      `[marcar-venda-confirmada] ${aplicados.length} cards corrigidos para GANHO, ` +
        `R$ ${somaValor.toFixed(2)}, ` +
        `${aplicados.filter((i) => i.criaEvento).length} eventos de ganho criados, ` +
        `${aplicados.filter((i) => i.contaMais1).length} contadores +1, ` +
        `${pulados.length} pulados — por ${admin.nome ?? admin.id} — ` +
        "sem Meta, nada deletado",
    );

    return NextResponse.json({
      executado: true,
      aplicados,
      pulados,
      total: aplicados.length,
      somaValor,
      eventosCriados: aplicados.filter((i) => i.criaEvento).length,
      contadoresQueSubiram: aplicados.filter((i) => i.contaMais1).length,
    });
  } catch (erro) {
    return NextResponse.json(
      {
        erro: "falha ao marcar vendas confirmadas",
        detalhe: erro instanceof Error ? erro.message : String(erro),
      },
      { status: 500 },
    );
  }
}
