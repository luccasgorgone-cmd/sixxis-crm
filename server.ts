// Entrypoint do CRM. Hospeda o Next E o Socket.io no MESMO servidor HTTP e
// inicia o worker da fila de mensagens. O App Router sozinho nao hospeda
// WebSocket persistente, por isso o servidor passa a ser este arquivo.
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { setIO } from "./src/lib/socket";
import { createMessagesWorker, createCampaignWorker } from "./src/lib/queue";
import { iniciarManutencao } from "./src/lib/manutencao";
import { iniciarAlertas } from "./src/lib/alertas";
import { iniciarSlaAlertas } from "./src/lib/slaAlertas";
import {
  seedAdmin,
  seedFunil,
  seedModelos,
  seedEmpresasFaturadas,
  seedProdutosInteresse,
  seedVendedorTeste,
  seedRoteamentoEPresets,
  seedFinalidadeEInstancias,
  seedConfiguracoes,
  backfillAcesso,
  purgarDadosTeste,
  backfillNegocios,
  backfillDonoConversas,
  backfillCriadorMetas,
} from "./src/lib/seed";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);

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
  await seedConfiguracoes();
  await backfillAcesso();
  await purgarDadosTeste();
  await backfillNegocios();
  await backfillDonoConversas();
  await backfillCriadorMetas();

  // Servidor HTTP usando o request handler do Next.
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  // Socket.io anexado ao MESMO httpServer. Sem CORS explicito = same-origin.
  const io = new Server(httpServer);
  setIO(io);

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

  httpServer.listen(port, () => {
    console.log(`CRM no ar na porta ${port}`);
  });
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
