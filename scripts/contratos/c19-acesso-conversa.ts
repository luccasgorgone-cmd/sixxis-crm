// Contrato dourado C19 — escopo de acesso a UMA conversa por id.
//   npx tsx scripts/contratos/c19-acesso-conversa.ts
//
// Regra (mesma de apagar/reagir/editar mensagem e do escopo da inbox): ADMIN
// tudo; colaborador so a conversa em que e o atendente ou cujo cliente e dele
// (dono de venda/pos-venda). Prova PURA da regra + prova de FIACAO: as rotas que
// recebem um id de conversa (ler mensagens, enviar texto/arquivo/audio/contato,
// encaminhar, fixar, marcar nao-lida) passam pelo acessoConversa.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { podeAcessarConversa } from "../../src/lib/acessoConversa";

let ok = 0;
let falhou = 0;
function caso(nome: string, fn: () => void): void {
  try {
    fn();
    ok++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    falhou++;
    console.error(`FALHA  ${nome}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

const V1 = { id: "v1", papel: "VENDEDOR" };
const ADM = { id: "a1", papel: "ADMIN" };
const conv = (agenteId: string | null, donoId: string | null = null, donoPosVendaId: string | null = null) => ({
  agenteId,
  lead: { donoId, donoPosVendaId },
});

caso("admin acessa qualquer conversa", () => {
  assert.equal(podeAcessarConversa(ADM, conv("v2", "v2")), true);
});
caso("atendente da conversa acessa", () => {
  assert.equal(podeAcessarConversa(V1, conv("v1", "v2")), true);
});
caso("dono de venda do cliente acessa", () => {
  assert.equal(podeAcessarConversa(V1, conv("v2", "v1")), true);
});
caso("dono de pos-venda do cliente acessa", () => {
  assert.equal(podeAcessarConversa(V1, conv("v2", "v3", "v1")), true);
});
caso("conversa de OUTRO vendedor -> negado", () => {
  assert.equal(podeAcessarConversa(V1, conv("v2", "v2", "v3")), false);
});
caso("conversa sem atendente e cliente de outro -> negado", () => {
  assert.equal(podeAcessarConversa(V1, conv(null, "v2")), false);
});
caso("sem id de agente -> negado (nao casa null com null)", () => {
  assert.equal(podeAcessarConversa({ id: "", papel: "VENDEDOR" }, conv(null, null)), false);
});

const ROTAS = [
  "src/app/api/conversas/[id]/mensagens/route.ts",
  "src/app/api/conversas/[id]/fixar/route.ts",
  "src/app/api/conversas/[id]/marcar-nao-lida/route.ts",
  "src/app/api/mensagens/enviar/route.ts",
  "src/app/api/mensagens/enviar-arquivo/route.ts",
  "src/app/api/mensagens/enviar-audio/route.ts",
  "src/app/api/mensagens/enviar-contato/route.ts",
  "src/app/api/mensagens/encaminhar/route.ts",
];
for (const rota of ROTAS) {
  caso(`fiacao: ${rota} checa acessoConversa e agente ativo`, () => {
    const src = readFileSync(join(process.cwd(), rota), "utf8");
    assert.match(src, /acessoConversa\(agente,/, "sem checagem de escopo da conversa");
    assert.match(src, /await obterAgente\(\)/, "sem obterAgente (agente ativo)");
  });
}
caso("fiacao: encaminhar checa tambem a conversa de ORIGEM", () => {
  const src = readFileSync(join(process.cwd(), "src/app/api/mensagens/encaminhar/route.ts"), "utf8");
  assert.match(src, /acessoConversa\(agente, origem\.conversaId\)/);
});

caso("fiacao: middleware cobre /api/* mesmo com extensao no path", () => {
  const src = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
  assert.match(src, /matcher:\s*\[\s*"\/api\/:path\*"/);
});

console.log(`\nC19 acesso-conversa: ${ok} ok, ${falhou} falha(s)`);
if (falhou > 0) process.exit(1);
