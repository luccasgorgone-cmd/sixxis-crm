// Entrypoint do CRM. Hospeda o Next E o Socket.io no MESMO servidor HTTP e
// inicia o worker da fila de mensagens. O App Router sozinho nao hospeda
// WebSocket persistente, por isso o servidor passa a ser este arquivo.
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { setIO } from "./src/lib/socket";
import { registrarSinalizacaoChamada } from "./src/lib/sinalizacaoChamada";
import { createMessagesWorker, createCampaignWorker } from "./src/lib/queue";
import { iniciarManutencao } from "./src/lib/manutencao";
import { iniciarAlertas } from "./src/lib/alertas";
import { iniciarSlaAlertas } from "./src/lib/slaAlertas";
import { iniciarRecaptacao } from "./src/lib/recaptacao";
import { iniciarArquivamento } from "./src/lib/arquivamento";
import { iniciarReguaFollowup } from "./src/lib/reguaFollowup";
import { iniciarProspeccao } from "./src/lib/prospeccao/prospeccao";
import { iniciarVarreduraSupervisor } from "./src/lib/supervisor/varredura";
import { iniciarAprendizadoSupervisor } from "./src/lib/supervisor/aprendizado";
import {
  seedAdmin,
  seedFunil,
  seedEtapasIntermediarias,
  seedConfigAlertaSla,
  seedModelos,
  seedEmpresasFaturadas,
  seedProdutosInteresse,
  seedVendedorTeste,
  seedRoteamentoEPresets,
  seedFinalidadeEInstancias,
  seedConfiguracoes,
  seedAssistenteEscrita,
  seedPecas,
  seedVoltagemPecasEletricas,
  seedPrecosMotorSwing,
  seedProdutoSX120Prime,
  backfillAcesso,
  purgarDadosTeste,
  backfillNegocios,
  backfillDonoConversas,
  backfillCriadorMetas,
  backfillNomeBusca,
} from "./src/lib/seed";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
// SANDBOX_ONLY=1: sobe apenas o web (Next + Socket.io) para testar o sandbox da
// IA localmente. NAO inicia workers de fila nem timers (recaptacao/arquivamento/
// alertas/manutencao) — assim uma instancia local nunca consome a fila nem age
// sobre dados reais. Aditivo e default OFF: sem a env, o comportamento de
// producao e identico.
const sandboxOnly = process.env.SANDBOX_ONLY === "1";

const app = next({ dev });
const handle = app.getRequestHandler();

async function main(): Promise<void> {
  await app.prepare();

  // Seeds idempotentes antes de subir o servidor: admin, funil (etapas/
  // etiquetas), vendedor de teste e backfill de negocios dos leads antigos.
  await seedAdmin();
  await seedFunil();
  await seedModelos();
  await seedEmpresasFaturadas();
  await seedProdutosInteresse();
  await seedVendedorTeste();
  await seedRoteamentoEPresets();
  await seedFinalidadeEInstancias();
  // Depois do funil de pos-venda existir: cria as etapas "1"/"2"/"3" da venda e
  // leva as duas listas para a ordem alvo (sequencia global venda -> pos-venda).
  await seedEtapasIntermediarias();
  await seedConfiguracoes();
  // Defaults de alerta de SLA por etapa (Manual): depois das etapas E da config
  // CRM existirem (le horarios p/ converter dias uteis em minutos). Idempotente.
  await seedConfigAlertaSla();
  await seedAssistenteEscrita();
  await seedPecas();
  await seedVoltagemPecasEletricas();
  await seedPrecosMotorSwing();
  await seedProdutoSX120Prime();
  await backfillAcesso();
  await purgarDadosTeste();
  await backfillNegocios();
  await backfillDonoConversas();
  await backfillCriadorMetas();
  await backfillNomeBusca();

  // Servidor HTTP usando o request handler do Next.
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  // Socket.io anexado ao MESMO httpServer. Sem CORS explicito = same-origin.
  const io = new Server(httpServer);
  setIO(io);

  // F7-Calling: relay de sinalizacao de chamada (aditivo, nao mexe nos emits
  // globais). Cria salas por agente para entregar a chamada ao browser certo.
  registrarSinalizacaoChamada(io);

  if (sandboxOnly) {
    console.log(
      "[SANDBOX_ONLY] workers e timers DESLIGADOS — fila, recaptacao, " +
        "alertas, manutencao e arquivamento nao sobem nesta instancia.",
    );
  } else {
    // Worker da fila "messages-in" (consome os eventos enfileirados pelo webhook).
    createMessagesWorker(io);
    // Worker da fila "campaigns" (envio em massa com throttle).
    createCampaignWorker(io);

    // Manutencao: poda do raw antigo (+ arquivamento opcional) e aniversarios.
    iniciarManutencao();
    // Alertas antecipados da agenda (tarefas/lembretes), a cada ~90s.
    iniciarAlertas();
    // Alertas de SLA por etapa/setor (negocios parados), a cada ~60s.
    iniciarSlaAlertas();
    // SOL-4: motor da recaptacao em ondas. Agendar NAO envia nada — ele so age se
    // houver campanha ARMADA pelo dono, dentro do horario e da cota diaria.
    iniciarRecaptacao(io);
    // Bloco 3: esvaziar o Kanban por prazo (perdidos/ganhos parados). Nasce em
    // MODO LOG — so conta quantos arquivaria — ate o dono ligar no admin.
    iniciarArquivamento();
    // Regua de follow-up (Manual secao 5): move negocios ABERTO por prazo (dias
    // uteis) e cria a proxima acao pro vendedor. Nasce em DRY-RUN (so loga) ate o
    // dono ligar followupAtivo na config. NUNCA envia mensagem ao cliente.
    iniciarReguaFollowup();
    // Prospeccao ativa (Manual Fase 2): avanca a cadencia de 4 semanas e cria a
    // proxima acao pro vendedor. Nasce em DRY-RUN (so loga) ate o gestor ligar
    // prospeccaoAtiva. NUNCA envia mensagem ao cliente.
    iniciarProspeccao();
    // Supervisor: varredura periodica dos atendimentos (ticker 60s; so roda
    // quando ATIVA na config e na cadencia configurada). Abre propostas, nunca
    // executa sozinha. Nasce DESLIGADA ate o gestor ligar na aba Configuracoes.
    iniciarVarreduraSupervisor();
    // Supervisor: aprendizado (loop de feedback deterministico). Ticker 60s que
    // recomputa o snapshot a cada cadenciaHoras (default 12h) — zero token,
    // deriva de SupervisorAcao + negocios fechados. Roda mesmo com a varredura
    // desligada; nunca auto-edita config (so sugere via insight).
    iniciarAprendizadoSupervisor();
  }

  httpServer.listen(port, () => {
    console.log(`CRM no ar na porta ${port}`);
  });
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
