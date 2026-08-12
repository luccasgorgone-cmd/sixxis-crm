// Admin: MARCAR VENDA CONFIRMADA — acerta o CARD de vendas que aconteceram no
// site e ficaram erradas no CRM. Correcao PONTUAL e NOMINAL: age so nos negocios
// que quem chama nomeia, um por um, com o valor de cada um.
//
// ISTO NAO E CORRECAO DE FATURAMENTO. Depois da Fatia 14 o faturamento ja conta
// esses casos pela data do ganho. O que esta errado e o CARD: status, valor e
// coluna no funil. E uma correcao de TELA.
//
// SAO DUAS PERGUNTAS INDEPENDENTES, e confundi-las foi o bug da primeira versao:
//
//   "DE QUANDO FOI A VENDA?" -> qualquer VESTIGIO responde: jaFoiGanho, ou a
//   data de um evento GANHO, ate de um NEUTRALIZADO pelo dedup (ele foi
//   descartado como prova de compra, mas a data dele continua verdadeira).
//   Havendo vestigio, fechadoEm REUSA essa data — carimbar hoje moveria a venda
//   de mes no relatorio. Sem vestigio nenhum, e agora: e quando o CRM soube.
//
//   "PRECISO CRIAR O EVENTO?" -> so um evento VALIDO responde. E aqui esta o
//   ponto: o historico de compras (lib/compras) conta EVENTOS, nao a flag. Um
//   negocio com jaFoiGanho=true cujo unico evento foi neutralizado tem ZERO
//   compras para o cliente — e a primeira versao desta rota, olhando so a flag,
//   se recusava a criar o evento e o deixava presos em zero para sempre.
//
//   Quando o evento e criado, ele nasce DATADO NA VENDA (criadoEm = fechadoEm),
//   nao em hoje, para o historico de compras mostrar a data certa.
//
// NUNCA cria evento havendo um valido: seria duplicar a compra e inflar o
// contador, exatamente o que a Fatia 9 existe para desfazer.
//
// CUIDADO COM valorAjustado — foi ele que fez uma venda gravada aparecer como
// ZERO em todo lugar. NENHUMA tela do sistema le `Negocio.valor` direto: card do
// Kanban, GET do negocio, carteira, dashboard e oracle leem
// `valorAjustado ?? valor` (ver lib/serializar e somaValorDerivado). Um ajuste
// velho pendurado no negocio SOBRESCREVE o valor gravado aqui, e nenhuma
// reexecucao resolve, porque o campo reescrito nao e o campo lido. Por isso esta
// rota zera valorAjustado: quem chama declara o valor FINAL da venda.
//
// A ROTA CONFERE O QUE GRAVOU, e confere o valor EFETIVO (valorAjustado ??
// valor), nao o campo cru — verificacao que nao olha o que o usuario ve nao
// verifica nada. Nao batendo, derruba a transacao e reporta o item como falho.
// Antes, "aplicado" significava so "nenhuma excecao": a intencao de gravar.
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
  // valorAtual e o campo cru; valorExibidoAtual e o que as TELAS mostram
  // (valorAjustado ?? valor). Quando os dois diferem, quem manda na tela e no
  // faturamento e o ajustado — foi assim que uma venda gravada em `valor`
  // aparecia como zero em todo lugar.
  valorAtual: number | null;
  valorAjustadoAtual: number | null;
  valorExibidoAtual: number | null;
  arquivado: boolean;
  // O que vira.
  valorNovo: number;
  etapaDestino: string | null;
  fechadoEmPrevisto: string | null;
  origemFechadoEm: string | null;
  // As decisoes que separam os dois casos.
  jaTinhaGanho: boolean;
  ganhosValidos: number;
  eventosNeutralizados: number;
  criaEvento: boolean;
  contaMais1: boolean;
  // O que o BANCO tem depois de aplicar. Preenchido so no POST: e a prova de que
  // gravou, em vez da intencao de gravar.
  valorDepois?: number | null;
  statusDepois?: string | null;
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
      valorAjustadoAtual: null,
      valorExibidoAtual: null,
      arquivado: false,
      valorNovo: p.valor,
      etapaDestino: null,
      fechadoEmPrevisto: null,
      origemFechadoEm: null,
      jaTinhaGanho: false,
      ganhosValidos: 0,
      eventosNeutralizados: 0,
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
        valorAjustado: true,
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

    const eventos = await prisma.historicoNegocio.findMany({
      where: { negocioId: n.id, tipo: TipoHistorico.GANHO },
      orderBy: { criadoEm: "desc" },
      select: { criadoEm: true, descricao: true },
    });
    // DUAS perguntas diferentes, que a primeira versao desta rota confundiu:
    //
    //   "de quando foi a venda?"  -> qualquer VESTIGIO serve. Ate um evento
    //   neutralizado pela Fatia 9 carrega a data verdadeira, e a flag jaFoiGanho
    //   diz que houve ganho mesmo sem evento sobrando.
    //
    //   "preciso criar o evento?" -> so um evento VALIDO responde. O historico de
    //   compras (lib/compras) conta EVENTOS, nao a flag: um negocio com
    //   jaFoiGanho=true cujo unico evento foi neutralizado aparece com ZERO
    //   compras para o cliente, e nunca sairia disso porque a rota achava que ja
    //   havia ganho e se recusava a criar. Era o caso do card que motivou a
    //   correcao.
    const validos = eventos.filter((e) => !ehGanhoDesconsiderado(e.descricao));
    const temVestigioDeGanho = n.jaFoiGanho || eventos.length > 0;
    const criaEvento = validos.length === 0;

    const destino = await primeiraEtapaGanho(n.finalidade);

    // fechadoEm: reusa a data do ganho ORIGINAL quando ela existe. Carimbar hoje
    // moveria uma venda antiga para o mes atual no relatorio.
    let fechadoEm: Date;
    let origem: string;
    if (temVestigioDeGanho) {
      if (n.ultimoGanhoEm) {
        fechadoEm = n.ultimoGanhoEm;
        origem = "ultimoGanhoEm (ganho original)";
      } else if (eventos[0]) {
        // eventos[0] e o mais recente, valido ou nao: o neutralizado foi
        // descartado como PROVA, mas a data dele continua sendo verdade.
        fechadoEm = eventos[0].criadoEm;
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
      valorAjustadoAtual: numeroOuNull(n.valorAjustado),
      valorExibidoAtual:
        numeroOuNull(n.valorAjustado) ?? numeroOuNull(n.valor),
      arquivado: n.arquivado,
      valorNovo: p.valor,
      etapaDestino: destino?.nome ?? null,
      fechadoEmPrevisto: fechadoEm.toISOString(),
      origemFechadoEm: origem,
      jaTinhaGanho: temVestigioDeGanho,
      // Quantos eventos de ganho AINDA CONTAM. Zero com jaTinhaGanho=true e
      // exatamente o caso que quebrava: ha vestigio, mas nao ha compra contavel.
      ganhosValidos: validos.length,
      eventosNeutralizados: eventos.length - validos.length,
      criaEvento,
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

      // Etapa resolvida FORA da transacao de proposito: primeiraEtapaGanho usa o
      // cliente global, e chamar o cliente global de dentro de uma transacao
      // interativa emprestaria outra conexao do pool no meio dela — caminho
      // conhecido para travar sob concorrencia.
      const destinoPre = await primeiraEtapaGanho(
        (plano.finalidade ?? "VENDA") as "VENDA" | "POS_VENDA",
      );
      if (!destinoPre) {
        pulados.push({ ...plano, problema: "funil sem etapa de ganho" });
        continue;
      }

      // Cada item tem a SUA transacao e o SEU try: um card que falha a
      // verificacao nao pode derrubar os outros do lote nem virar um 500 que
      // esconde o que ja deu certo.
      let resultado:
        | { ok: true; valorDepois: number | null; statusDepois: string }
        | { ok: false; motivo: string };
      try {
        resultado = await prisma.$transaction(async (tx) => {
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
          if (!atual) return { ok: false, motivo: "negocio sumiu" } as const;

          const eventos = await tx.historicoNegocio.findMany({
            where: { negocioId: plano.negocioId, tipo: TipoHistorico.GANHO },
            select: { descricao: true },
          });
          // Mesma separacao da previa: o evento so e criado quando NAO ha nenhum
          // ganho valido. jaFoiGanho nao substitui um evento — o historico de
          // compras conta eventos.
          const criaEvento = !eventos.some(
            (e) => !ehGanhoDesconsiderado(e.descricao),
          );
          const contaMais1 = atual.status !== StatusNeg.GANHO;
          const destino = destinoPre;

          await tx.negocio.update({
            where: { id: plano.negocioId },
            data: {
              status: StatusNeg.GANHO,
              valor: plano.valorNovo,
              // LIMPA O AJUSTE. Toda leitura do sistema — card do Kanban, GET do
              // negocio, carteira, dashboard, oracle — mostra
              // `valorAjustado ?? valor`, nunca o valor cru. Um ajuste velho
              // pendurado no negocio SOBRESCREVE o valor que esta rota acabou de
              // gravar, e o card continua exibindo o numero antigo como se nada
              // tivesse acontecido. Quem chama aqui esta declarando o valor FINAL
              // da venda confirmada: nao existe ajuste a preservar em cima dele.
              valorAjustado: null,
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
                      // DATADO NA VENDA, nao em hoje: o historico de compras do
                      // cliente mostra "comprou em DD/MM", e carimbar agora poria
                      // uma venda de agosto na data de hoje.
                      ...(plano.fechadoEmPrevisto
                        ? { criadoEm: new Date(plano.fechadoEmPrevisto) }
                        : {}),
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
          // CONFERE O QUE FICOU. A rota antes devolvia "aplicado" pela ausencia de
          // excecao — isto e, relatava a INTENCAO de gravar. Se por qualquer razao
          // o valor nao pousasse, o dono via sucesso e um card errado, sem nada
          // que ligasse as duas coisas. Agora o sucesso significa "reli e esta la".
          const depois = await tx.negocio.findUnique({
            where: { id: plano.negocioId },
            select: { valor: true, valorAjustado: true, status: true, etapaId: true },
          });
          // Confere o valor EFETIVO (valorAjustado ?? valor), que e o que as
          // telas e o faturamento leem — nao o campo cru. A primeira versao
          // conferia so `valor` e por isso dava "gravou 2802,50" enquanto o
          // Kanban mostrava zero: os dois estavam certos, olhando campos
          // diferentes. Verificacao que nao olha o que o usuario ve nao verifica
          // nada.
          const valorGravado =
            numeroOuNull(depois?.valorAjustado) ?? numeroOuNull(depois?.valor);
          const bateu =
            depois != null &&
            depois.status === StatusNeg.GANHO &&
            depois.etapaId === destino.id &&
            valorGravado != null &&
            // Tolerancia de centavo: valor e Decimal(12,2).
            Math.abs(valorGravado - plano.valorNovo) < 0.005;
          if (!bateu) {
            // Derruba a transacao de proposito: melhor nao aplicar e gritar do que
            // aplicar pela metade e dizer que deu certo.
            throw new Error(
              `verificacao falhou no negocio ${plano.negocioId}: esperado valor efetivo ${plano.valorNovo} / GANHO / etapa ${destino.id}; ` +
                `banco devolveu efetivo ${valorGravado} (valor ${depois?.valor}, ajustado ${depois?.valorAjustado}) / ${depois?.status} / etapa ${depois?.etapaId}`,
            );
          }

          if (atual.arquivado) {
            desarquivar.push({
              leadId: atual.leadId,
              finalidade: atual.finalidade,
            });
          }
            return {
              ok: true as const,
              valorDepois: valorGravado,
              statusDepois: depois.status as string,
            };
        });
      } catch (erro) {
        resultado = {
          ok: false,
          motivo: erro instanceof Error ? erro.message : String(erro),
        };
      }

      if (resultado.ok) {
        aplicados.push({
          ...plano,
          valorDepois: resultado.valorDepois,
          statusDepois: resultado.statusDepois,
        });
      } else {
        pulados.push({ ...plano, problema: resultado.motivo });
      }
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
