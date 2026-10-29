"use client";

// Manual de Atendimento SIXXIS — referencia operacional dentro do CRM. Pagina
// ESTATICA (sem schema, sem dado): duas abas (Venda / Pos-venda) com o padrao de
// atendimento, regras, metricas, tempo/SLA e o que nao fazer. Fiel ao que esta
// implementado (funis em seed.ts, slaAlertas.ts, reguaFollowup.ts, metricas.ts,
// motivosPerda.ts). Automacoes marcadas como "quando o gestor ativa" porque
// nascem como flag (followupAtivo/slaEmDiasUteis = false por padrao); a REGRA
// (o que o vendedor faz) vale sempre. Alvos marcados (ajustavel) sao os padroes
// semeados, configuraveis na aba do Supervisor.
import { useState } from "react";
import { BookOpen } from "lucide-react";

type Aba = "venda" | "posvenda";

// ─────────────────────────── blocos reutilizaveis ───────────────────────────

function Secao({
  num,
  titulo,
  children,
}: {
  num: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-medio/15 bg-superficie p-5 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-escuro">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-tiffany/15 text-xs font-bold text-tiffany-escuro">
          {num}
        </span>
        {titulo}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-escuro/85">
        {children}
      </div>
    </section>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-escuro/5 px-1.5 py-0.5 font-mono text-[12px] text-escuro/80">
      {children}
    </span>
  );
}

function Verde({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-sucesso">{children}</span>;
}
function Amarelo({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-amber-600">{children}</span>;
}

type Etapa = {
  n: string;
  nome: string;
  tipo: "aberta" | "ganho" | "perdido";
  sig: string;
  faz: string;
  prazo: string;
};

function corEtapa(tipo: Etapa["tipo"]) {
  if (tipo === "ganho") return "text-sucesso";
  if (tipo === "perdido") return "text-erro";
  return "text-tiffany-escuro";
}

function TabelaFunil({ etapas }: { etapas: Etapa[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-medio/20 text-xs uppercase tracking-wide text-medio/60">
            <th className="py-2 pr-3 font-semibold">#</th>
            <th className="py-2 pr-3 font-semibold">Etapa</th>
            <th className="py-2 pr-3 font-semibold">Significa</th>
            <th className="py-2 pr-3 font-semibold">O que voce faz</th>
            <th className="py-2 font-semibold">Prazo-alvo</th>
          </tr>
        </thead>
        <tbody>
          {etapas.map((e) => (
            <tr key={e.n} className="border-b border-medio/10 align-top">
              <td className="py-2 pr-3 text-medio/70">{e.n}</td>
              <td className={`py-2 pr-3 font-semibold ${corEtapa(e.tipo)}`}>
                {e.nome}
              </td>
              <td className="py-2 pr-3 text-escuro/75">{e.sig}</td>
              <td className="py-2 pr-3 text-escuro/75">{e.faz}</td>
              <td className="py-2 text-escuro/75">{e.prazo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type LinhaMetrica = {
  metrica: string;
  mede: string;
  verde?: string;
  amarelo?: string;
  ref?: string;
};

function TabelaMetricas({ linhas }: { linhas: LinhaMetrica[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-medio/20 text-xs uppercase tracking-wide text-medio/60">
            <th className="py-2 pr-3 font-semibold">Metrica</th>
            <th className="py-2 pr-3 font-semibold">O que mede</th>
            <th className="py-2 font-semibold">Referencia</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.metrica} className="border-b border-medio/10 align-top">
              <td className="py-2 pr-3 font-semibold text-escuro">{l.metrica}</td>
              <td className="py-2 pr-3 text-escuro/75">{l.mede}</td>
              <td className="py-2 text-escuro/75">
                {l.ref ? (
                  l.ref
                ) : (
                  <>
                    <Verde>{l.verde}</Verde>
                    <span className="text-medio/50"> · </span>
                    <Amarelo>{l.amarelo}</Amarelo>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-escuro/85 dark:bg-amber-950/30">
      {children}
    </div>
  );
}

// ──────────────────────────────── VENDA ─────────────────────────────────────

const FUNIL_VENDA: Etapa[] = [
  { n: "1", nome: "Novo", tipo: "aberta", sig: "Lead recem-chegado, sem atendimento", faz: "Dar o 1o contato / boas-vindas, entender a necessidade", prazo: "1a resposta ≤ 1h util (ideal ≤ 15 min)" },
  { n: "2", nome: "Em atendimento", tipo: "aberta", sig: "Conversa rolando, levantando necessidade", faz: "Qualificar, apresentar produto, mandar o pedido", prazo: "1 dia util sem avancar → alerta" },
  { n: "3", nome: "Negociando", tipo: "aberta", sig: "Cliente recebeu proposta/preco, decidindo", faz: "Trabalhar objecao, preco, frete, condicao", prazo: "5 dias uteis (B2C) / 10 (B2B)" },
  { n: "4", nome: "FollowUp - 1", tipo: "aberta", sig: "1a cobranca apos silencio", faz: "Retomar com valor (nao so e-ai)", prazo: "2 dias uteis → FU2" },
  { n: "5", nome: "FollowUp - 2", tipo: "aberta", sig: "2a cobranca", faz: "Nova abordagem / oferta", prazo: "3 dias uteis → FU3" },
  { n: "6", nome: "FollowUp - 3", tipo: "aberta", sig: "Ultima tentativa", faz: "Ultimo toque antes de desistir", prazo: "1 dia util → Perdido (Sem resposta)" },
  { n: "7", nome: "Aguardando pagamento", tipo: "aberta", sig: "Fechou, falta o pagamento cair", faz: "Acompanhar e confirmar o pagamento", prazo: "Conta como negocio ativo" },
  { n: "8", nome: "Vendido", tipo: "ganho", sig: "GANHO — venda concretizada", faz: "Registrar o VALOR correto e encerrar", prazo: "—" },
  { n: "9", nome: "Perdido", tipo: "perdido", sig: "PERDIDO — nao vendeu", faz: "Escolher o MOTIVO da lista", prazo: "—" },
];

const METRICAS_VENDA: LinhaMetrica[] = [
  { metrica: "1a resposta no prazo", mede: "% de conversas respondidas dentro do prazo (padrao ≤ 1h)", verde: "≥ 80%", amarelo: "≥ 50%" },
  { metrica: "Tempo medio da 1a resposta", mede: "media do tempo-online ate responder (veja tambem a mediana)", verde: "≤ 5 min", amarelo: "≤ 30 min" },
  { metrica: "Conversao", mede: "ganhos ÷ (ganhos + perdidos) finalizados no periodo", verde: "≥ 40%", amarelo: "≥ 25%" },
  { metrica: "Cobertura de funil", mede: "pipeline aberto ponderado ÷ meta que falta (quente 0,8 · morno 0,5 · frio 0,2)", verde: "≥ 3x", amarelo: "≥ 2x" },
  { metrica: "Sem proximo passo", mede: "% de abertos sem lembrete/tarefa (menor e melhor)", verde: "≤ 20%", amarelo: "≤ 40%" },
];

function ConteudoVenda() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-medio">
        Objetivo: transformar o contato que chega (WhatsApp, site, campanha) em{" "}
        <strong className="text-escuro">venda fechada</strong>, no menor tempo e
        com o maior aproveitamento — sem deixar ninguem sem resposta e sem perder
        lead por esquecimento.
      </p>

      <Secao num="1" titulo="O atendimento perfeito em 6 principios">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><strong>Velocidade ganha.</strong> Responder em menos de 5 minutos converte de 2 a 5x mais. O primeiro oi rapido ja e meia venda.</li>
          <li><strong>Ninguem sem dono.</strong> Todo cliente tem um vendedor responsavel; se e seu, e sua responsabilidade ate fechar, perder ou passar.</li>
          <li><strong>Todo negocio aberto tem um proximo passo.</strong> Nunca deixe um card parado sem lembrete/tarefa do que fazer em seguida.</li>
          <li><strong>Mover o card e obrigatorio.</strong> O funil tem que refletir a vida real do cliente; card na etapa errada mente para o time e estraga as metricas.</li>
          <li><strong>Fechar e fechar — com motivo.</strong> Ganhou: registra o valor certo. Perdeu: escolhe o motivo da lista.</li>
          <li><strong>A bola nunca para com a gente.</strong> Enquanto a resposta depende de voce, o relogio corre contra voce. Devolva rapido.</li>
        </ol>
      </Secao>

      <Secao num="2" titulo="O sistema operacional do dia (rotina)">
        <p>O CRM trabalha em <strong>horario comercial, dias uteis e fora de feriados</strong>. Sua rotina acompanha isso:</p>
        <p className="font-semibold text-escuro">Inicio do dia</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Entre <strong>online</strong> (toggle no topo). Lead novo so e entregue para quem esta online — offline nao recebe nada.</li>
          <li>Zere a <strong>fila da noite</strong>: toda mensagem fora do expediente deve ser respondida ate as <strong>9h</strong>.</li>
          <li>Olhe seus <strong>leads vencidos/parados</strong> (abertos sem interacao ha mais de 7 dias <em>(ajustavel)</em>) e os <strong>alertas de SLA</strong>. Resolva os vermelhos primeiro.</li>
        </ul>
        <p className="font-semibold text-escuro">Durante o dia</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Responda rapido (meta: 1a resposta ≤ 5 min; limite ≤ 1h util).</li>
          <li>A cada atendimento, <strong>mova o card</strong> para a etapa real e <strong>deixe o proximo passo marcado</strong>.</li>
          <li>Follow-ups do dia: dispare os FUx ate as <strong>14h</strong>.</li>
        </ul>
        <p className="font-semibold text-escuro">Fim do dia</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Nenhum card seu termina o dia <strong>sem proximo passo</strong>.</li>
          <li>Fique <strong>offline</strong> ao parar (ou o sistema te desliga apos 15 min sem atividade, com 1 min de aviso). Tempo offline <strong>nao</strong> pesa contra voce.</li>
        </ul>
      </Secao>

      <Secao num="3" titulo="O funil de Venda, etapa por etapa">
        <TabelaFunil etapas={FUNIL_VENDA} />
        <p className="pt-1 font-semibold text-escuro">Regras de movimento</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Card sobe conforme o cliente avanca. Nao pule etapa — a etapa e a verdade do momento.</li>
          <li>So o <strong>dono</strong> (ativo/online) mexe no card dele; evita dois vendedores na mesma venda.</li>
          <li><strong>Interacao qualificada</strong> (cliente pediu preco, frete, link, pagamento) num card em follow-up faz ele voltar para Em atendimento/Negociando. Limite: <strong>1 retorno</strong> automatico; o 2o precisa de aprovacao do gestor.</li>
        </ul>
      </Secao>

      <Secao num="4" titulo="Tempo e SLA — como o relogio funciona">
        <ul className="list-disc space-y-1 pl-5">
          <li>O prazo de cada etapa pode ser contado em <strong>tempo util</strong> (horario comercial, dias uteis, sem feriado) quando o gestor ativa esse modo — ai sabado, domingo, madrugada e feriado nao correm contra voce.</li>
          <li><strong>1a resposta</strong> e medida pelo <strong>tempo em que o dono esteve ONLINE</strong> entre o contato e a resposta — nao pelo relogio de parede.</li>
          <li>Estourou o prazo da etapa? O CRM gera um <strong>alerta de SLA</strong> ao dono (e toca um aviso). Fecha sozinho quando voce move, ganha, perde ou resolve.</li>
          <li><strong>B2B tem o dobro do prazo em Negociando</strong> (10 dias uteis vs 5 do B2C). Marque como <strong>B2B</strong> revenda, loja, assistencia, academia ou pedido grande (mais de 5 unidades).</li>
        </ul>
      </Secao>

      <Secao num="5" titulo="Follow-up — a regua">
        <p>O CRM tem uma <strong>regua de follow-up</strong> que, <strong>quando o gestor a ativa</strong>, nao deixa lead esfriar por esquecimento:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Passou o prazo da etapa de follow-up sem resposta, o sistema <strong>move o card para o proximo FU e cria uma tarefa para voce</strong> (enviar FU2 ate 14h). Cadencia: FU1 no 2o-3o dia, FU2 no 4o-6o, FU3 no 7o.</li>
          <li><strong>O sistema NAO manda mensagem para o cliente sozinho.</strong> Ele organiza (move etapa + cria tarefa). <strong>Quem fala com o cliente e voce</strong> — mensagem a cliente e decisao humana.</li>
          <li>Fim da regua sem resposta → o card vira <strong>Perdido (Sem resposta)</strong>. Isso e saudavel: tira o morto da carteira e alimenta a reaquisicao.</li>
          <li>Um bom follow-up retoma com <strong>valor</strong> (novidade, condicao, duvida pendente), nao um e-ai-fechou.</li>
        </ul>
      </Secao>

      <Secao num="6" titulo="Regras de ouro (as que mais dao problema)">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Valor da venda — a armadilha no 1.</strong> O que conta e <Rotulo>valorAjustado</Rotulo> <strong>se estiver preenchido</strong>; senao, <Rotulo>valor</Rotulo>. Ou seja: um <strong>valorAjustado = 0 esquecido zera a venda em silencio</strong>. Confira o valor efetivo ao registrar o ganho. <Rotulo>valor</Rotulo> = pedido todo (produtos + frete); <Rotulo>valorProdutos</Rotulo> = so itens.</li>
          <li><strong>Mensagem que voce manda (saida) nao cria nem reabre negocio.</strong> So a mensagem do <strong>cliente</strong> (entrada) movimenta o funil.</li>
          <li><strong>Cliente ja perdido nao reabre</strong> so por mandar mensagem — enquanto o prazo de perdido nao vence e o card nao e arquivado. O selo de ja-foi-perdido fica no historico.</li>
          <li><strong>O dono e a fonte da verdade do roteamento.</strong> Transferencia move leads, negocios <strong>abertos</strong> e conversas — mas <strong>preserva o vendedor historico nos negocios ja fechados</strong>.</li>
          <li><strong>Faturamento conta por houve-ganho-no-periodo, nao pelo status atual.</strong> Venda ganha hoje que reabrir amanha ainda conta como venda de hoje.</li>
        </ul>
      </Secao>

      <Secao num="7" titulo="Encerramento — ganhou ou perdeu, sempre com motivo">
        <p>Perder bem e tao importante quanto ganhar: o motivo certo alimenta a reaquisicao e as metricas. A lista e <strong>fechada</strong> (nao existe Outro — se falta um motivo, avise o gestor).</p>
        <p className="font-semibold text-erro">PERDIDO (nao vendeu, mas era cliente de verdade)</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Sem resposta (fim da regua) · <em>entra na reaquisicao</em></li>
          <li>Preco acima do esperado · <em>entra na reaquisicao</em></li>
          <li>Frete caro ou prazo longo · <em>entra na reaquisicao</em></li>
          <li>Comprou de concorrente · <em>entra na reaquisicao</em></li>
          <li>Comprou no marketplace/site da SIXXIS · <em>nao reaquisicao (ja e nosso cliente)</em></li>
          <li>Adiou a compra / sem orcamento agora · <em>entra na reaquisicao</em></li>
          <li>Produto nao atende (tamanho, area, voltagem, modelo) · <em>entra na reaquisicao</em></li>
          <li>Pediu para nao ser contatado · <em>nao reaquisicao (respeitar sempre)</em></li>
        </ul>
        <p className="font-semibold text-medio">DESQUALIFICADO (nem era oportunidade — nao conta contra a sua conversao)</p>
        <p>Numero errado / contato invalido · Spam · Fornecedor / nao e cliente · Busca emprego · Fora da area de atendimento · Produto que a SIXXIS nao vende.</p>
        <Nota>
          <strong>Regra pratica:</strong> se nao dava para vender porque <strong>nao era cliente</strong>, e <strong>Desqualificado</strong> (nao te penaliza). Se era cliente e nao rolou, e <strong>Perdido</strong> (com o motivo certo).
        </Nota>
      </Secao>

      <Secao num="8" titulo="Metricas e metas — o que te cobram e como ler">
        <p className="text-medio">Tudo recortado por periodo (Hoje / 7d / 15d / 30d / custom), por finalidade (Venda) e por vendedor.</p>
        <TabelaMetricas linhas={METRICAS_VENDA} />
        <p className="pt-1">
          O painel tambem acompanha: <strong>valor vendido</strong> (soma do valor efetivo dos ganhos), <strong>ticket medio</strong> (valor vendido ÷ no de ganhos), <strong>ciclo medio Novo→Ganho</strong> (dias uteis), <strong>parados</strong> (abertos sem interacao ha mais de 7 dias), <strong>distribuicao da 1a resposta</strong> (histograma) e <strong>Pareto de motivos de perda</strong>.
        </p>
        <p><strong>Metas</strong> por colaborador ou equipe, no periodo diario/semanal/mensal/custom, sobre: valor vendido, quantidade de ganhos, conversao, clientes atendidos, tempo de resposta, tempo de resolucao.</p>
        <p className="font-semibold text-escuro">Como melhorar cada farol</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>1a resposta vermelha → fique online cedo, ataque a fila da noite antes das 9h.</li>
          <li>Conversao baixa → trabalhe o follow-up e <strong>classifique perda certo</strong> (desqualificado nao derruba conversao).</li>
          <li>Cobertura baixa → falta pipeline: prospecte / peca mais lead.</li>
          <li>Sem-proximo-passo alto → disciplina de sempre deixar um lembrete ao sair do card.</li>
        </ul>
      </Secao>

      <Secao num="9" titulo="Reaquisicao — a segunda chance do perdido">
        <p>Todo mes o CRM junta os <strong>perdidos elegiveis</strong> (motivos marcados entra-na-reaquisicao) e organiza uma campanha de reativacao em janela: <strong>6o dia util (R1) → 8o (R2) → 10o (fim)</strong>. Quem volta vira <strong>Reativado</strong>; quem nao responde ate o fim vira <strong>Perdido definitivo</strong>.</p>
        <Nota>O <strong>envio ao cliente e sempre armado por um gestor</strong> (admin) — a campanha nao dispara mensagem sozinha. Mesma trava do follow-up: falar com cliente e decisao humana.</Nota>
      </Secao>

      <Secao num="10" titulo="O que NAO fazer (erros classicos)">
        <ul className="list-disc space-y-1 pl-5">
          <li>Deixar cliente na etapa Novo por horas (SLA estoura, cliente esfria).</li>
          <li>Mover para Vendido um cliente que ja comprou e so voltou tirar duvida → use o fluxo de Pos-venda / Encerrar; nao crie venda falsa.</li>
          <li>Registrar ganho com <Rotulo>valorAjustado = 0</Rotulo> pendurado (zera a venda sem avisar).</li>
          <li>Deixar card aberto sem proximo passo.</li>
          <li>Fechar como Perdido algo que e Desqualificado (ou o contrario).</li>
          <li>Esquecer de voltar <strong>online</strong> → para de receber leads e nem percebe.</li>
        </ul>
      </Secao>
    </div>
  );
}

// ────────────────────────────── POS-VENDA ───────────────────────────────────

const FUNIL_POSVENDA: Etapa[] = [
  { n: "1", nome: "Aberto", tipo: "aberta", sig: "Demanda recem-chegada, sem triagem", faz: "Dar o 1o retorno, entender o que o cliente precisa", prazo: "1o retorno rapido" },
  { n: "2", nome: "Analise", tipo: "aberta", sig: "Triagem: entendendo o caso", faz: "Identificar tipo (duvida/troca/garantia/peca/orcamento) e encaminhar", prazo: "Nao travar na triagem" },
  { n: "3", nome: "Em atendimento", tipo: "aberta", sig: "Caso em andamento, a bola e nossa", faz: "Executar: orcar, buscar peca, acionar garantia, responder", prazo: "SLA por etapa (alerta ao estourar)" },
  { n: "4", nome: "Aguardando cliente", tipo: "aberta", sig: "A bola e do cliente (aprovar, enviar dado, pagar)", faz: "Aguardar — com lembrete para cobrar se sumir", prazo: "Nao pesa como atraso nosso" },
  { n: "5", nome: "Resolvido", tipo: "ganho", sig: "GANHO — caso solucionado", faz: "Registrar o TIPO de ganho e encerrar", prazo: "—" },
  { n: "6", nome: "Encerrado sem solucao", tipo: "perdido", sig: "Fim sem resolucao (desistiu, inviavel)", faz: "Registrar o motivo", prazo: "—" },
];

const METRICAS_POSVENDA: LinhaMetrica[] = [
  { metrica: "1a resposta no prazo", mede: "% de casos com 1o retorno dentro do prazo", verde: "≥ 80%", amarelo: "≥ 50%" },
  { metrica: "Tempo medio da 1a resposta", mede: "media do tempo-online ate o 1o retorno (veja a mediana)", verde: "≤ 5 min", amarelo: "≤ 30 min" },
  { metrica: "Tempo de resolucao", mede: "media do tempo util do Aberto ao Resolvido", ref: "menor e melhor" },
  { metrica: "Sem proximo passo", mede: "% de casos abertos sem lembrete/tarefa", verde: "≤ 20%", amarelo: "≤ 40%" },
  { metrica: "Parados", mede: "casos abertos sem interacao ha mais de 7 dias", ref: "menor e melhor" },
];

function ConteudoPosVenda() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-medio">
        Objetivo: resolver o que o cliente precisa{" "}
        <strong className="text-escuro">depois da compra</strong> (duvida, troca,
        garantia, peca, orcamento de servico) com rapidez e sem deixar ninguem sem
        retorno — e registrar o desfecho certo para o historico e as metricas.
      </p>

      <Secao num="1" titulo="O atendimento perfeito em 6 principios">
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><strong>Pos-venda e retencao.</strong> Problema bem resolvido fideliza; mal resolvido vira reclamacao publica e cliente perdido para sempre.</li>
          <li><strong>Toda demanda tem dono.</strong> O responsavel e o <strong>dono de pos-venda</strong> do cliente (campo proprio, separado do vendedor da venda).</li>
          <li><strong>Status honesto do card.</strong> Aguardando cliente e diferente de Em atendimento; o card tem que dizer quem esta com a bola.</li>
          <li><strong>Fechar com desfecho.</strong> Resolveu → Resolvido. Nao dava → Encerrado sem solucao (com o porque).</li>
          <li><strong>Rapido no 1o retorno e na resolucao.</strong> As duas coisas sao medidas: tempo ate a 1a resposta e tempo total de resolucao.</li>
          <li><strong>A bola nunca para com a gente.</strong> Enquanto depende da SIXXIS (orcar, buscar peca, analisar), o relogio corre contra nos.</li>
        </ol>
      </Secao>

      <Secao num="2" titulo="O sistema operacional do dia (rotina)">
        <p>Mesma base da Venda — <strong>horario comercial, dias uteis, sem feriado</strong> — adaptada para resolucao:</p>
        <p className="font-semibold text-escuro">Inicio do dia</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Entre <strong>online</strong>. Demandas sao entregues em rodizio a quem esta online; cliente que ja tem dono de pos-venda espera o dono voltar.</li>
          <li>Ataque a <strong>fila da noite</strong> (mensagens fora do expediente) ate as <strong>9h</strong>.</li>
          <li>Olhe os <strong>casos parados</strong> (abertos sem interacao ha mais de 7 dias <em>(ajustavel)</em>) e os <strong>alertas de SLA</strong>.</li>
        </ul>
        <p className="font-semibold text-escuro">Durante o dia</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Primeiro retorno rapido, mesmo que seja recebi, estou verificando.</li>
          <li><strong>Mova o card</strong> conforme o caso anda e <strong>use as etiquetas</strong> de estado (orcamento, pagamento, peca).</li>
          <li>Sempre com <strong>proximo passo</strong> marcado.</li>
        </ul>
        <p className="font-semibold text-escuro">Fim do dia</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Nenhum caso sem proximo passo; <strong>offline</strong> ao encerrar.</li>
        </ul>
      </Secao>

      <Secao num="3" titulo="O funil de Pos-venda, etapa por etapa">
        <TabelaFunil etapas={FUNIL_POSVENDA} />
        <p className="pt-1 font-semibold text-escuro">Etiquetas de estado</p>
        <p>Organizam a carteira dentro das etapas: <strong>Aguardando orcamento</strong> · <strong>Aguardando pagamento</strong> · <strong>Orcamento aprovado</strong> · <strong>Aguardando peca</strong>. Use-as para saber de relance onde cada caso travou.</p>
        <Nota>
          <strong>Armadilha:</strong> cliente que <strong>ja comprou</strong> e volta so para duvida ou acompanhamento <strong>nao deve ser movido para Vendido de novo</strong> no funil de venda — isso cria uma <strong>compra falsa</strong> e infla o faturamento. O lugar dele e o Pos-venda; o desfecho e <strong>Resolvido</strong> ou <strong>Encerrado sem solucao</strong>.
        </Nota>
      </Secao>

      <Secao num="4" titulo="Tempo e SLA">
        <ul className="list-disc space-y-1 pl-5">
          <li>Prazo pode ser contado em <strong>tempo util</strong> (quando o gestor ativa esse modo), igual a Venda.</li>
          <li>Mede-se o <strong>tempo ate a 1a resposta</strong> (tempo-online do dono) <strong>e</strong> o <strong>tempo de resolucao</strong> (do Aberto ao Resolvido).</li>
          <li>Caso parado em Analise ou Em atendimento alem do prazo → <strong>alerta de SLA</strong> ao dono.</li>
          <li><strong>Aguardando cliente</strong> e onde a bola esta <strong>com o cliente</strong> — e o estado certo para marcar que o atraso nao e nosso.</li>
        </ul>
      </Secao>

      <Secao num="5" titulo="Follow-up e cobranca">
        <ul className="list-disc space-y-1 pl-5">
          <li>Caso em <strong>Aguardando cliente</strong> ha tempo demais (nao aprovou orcamento, nao pagou, nao mandou o dado) → crie/mantenha um <strong>lembrete</strong> para cobrar. O sistema organiza, mas <strong>quem fala com o cliente e voce</strong>.</li>
          <li>Mensagens de acompanhamento pos-compra (agradecimento, pesquisa de avaliacao, esta-tudo-certo) existem como <strong>modelos prontos</strong> no CRM — use-os, mas o disparo e humano.</li>
        </ul>
      </Secao>

      <Secao num="6" titulo="Regras de ouro">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Dono de pos-venda ≠ vendedor da venda.</strong> Sao campos separados; a responsabilidade do caso e do dono de pos-venda.</li>
          <li><strong>Status honesto.</strong> Nao deixe em Em atendimento o que na verdade esta Aguardando cliente — isso falseia o SLA e esconde quem trava.</li>
          <li><strong>Resolver ≠ vender.</strong> Pos-venda nao gera faturamento de venda nova. Se virou uma nova compra, isso e um negocio de <strong>Venda</strong> a parte.</li>
          <li><strong>Encerrar com motivo.</strong> Encerrado sem solucao sempre com o porque (desistiu, fora de garantia, inviavel).</li>
        </ul>
      </Secao>

      <Secao num="7" titulo="Metricas e metas">
        <p className="text-medio">Recorte por periodo, finalidade Pos-venda e por colaborador.</p>
        <TabelaMetricas linhas={METRICAS_POSVENDA} />
        <p className="pt-1">Os <strong>ganhos de pos-venda</strong> sao classificados por <strong>tipo de ganho</strong> (natureza da resolucao), separados dos ganhos de venda — o painel mostra quantos casos foram resolvidos e de que tipo. <strong>Metas</strong> por tempo de resposta, tempo de resolucao e clientes atendidos, por colaborador ou equipe.</p>
      </Secao>

      <Secao num="8" titulo="O que NAO fazer">
        <ul className="list-disc space-y-1 pl-5">
          <li>Transformar acompanhamento pos-compra em Vendido (cria faturamento falso).</li>
          <li>Deixar caso em Em atendimento quando a bola ja voltou para o cliente (use Aguardando cliente).</li>
          <li>Fechar Resolvido sem o tipo de ganho, ou Encerrado sem motivo.</li>
          <li>Caso parado em Aguardando cliente sem lembrete de cobranca → some e o cliente se sente abandonado.</li>
          <li>Esquecer de voltar <strong>online</strong> → nao recebe novas demandas.</li>
        </ul>
      </Secao>
    </div>
  );
}

// ──────────────────────────────── pagina ────────────────────────────────────

export function ManualAtendimento() {
  const [aba, setAba] = useState<Aba>("venda");

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6">
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-escuro">
          <BookOpen className="h-6 w-6 text-tiffany" />
          Manual de Atendimento
        </h1>
        <p className="mt-1 text-sm text-medio">
          Padrao, regras, tempo e metricas do atendimento SIXXIS. Escolha a area.
        </p>
      </header>

      <div className="sticky top-0 z-10 mb-4 flex gap-1 rounded-lg bg-fundo/80 p-1 backdrop-blur">
        <button
          type="button"
          onClick={() => setAba("venda")}
          aria-pressed={aba === "venda"}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            aba === "venda"
              ? "bg-tiffany text-white"
              : "text-medio hover:bg-escuro/5 hover:text-escuro"
          }`}
        >
          Venda
        </button>
        <button
          type="button"
          onClick={() => setAba("posvenda")}
          aria-pressed={aba === "posvenda"}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
            aba === "posvenda"
              ? "bg-tiffany text-white"
              : "text-medio hover:bg-escuro/5 hover:text-escuro"
          }`}
        >
          Pos-venda
        </button>
      </div>

      {aba === "venda" ? <ConteudoVenda /> : <ConteudoPosVenda />}

      <p className="mt-6 text-xs text-medio/60">
        Alvos marcados (ajustavel) sao os padroes semeados, configuraveis na aba do
        Supervisor. Alinhado ao Manual de Atendimento Comercial SIXXIS v1.0 (2026).
      </p>
    </div>
  );
}
