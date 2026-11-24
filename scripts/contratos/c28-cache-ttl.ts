// Contrato dourado C28 — micro-cache TTL (capacidade/lentidao).
//   npx tsx scripts/contratos/c28-cache-ttl.ts
//
// O cache corta as idas repetidas ao Postgres das leituras quase-estaticas
// (ex.: ConfiguracaoCRM lida a cada mensagem). Esta prova trava: (1) dentro do
// TTL nao recarrega (serve cache), (2) passado o TTL recarrega, (3) invalidar
// forca recarga, (4) chaves diferentes nao se misturam. `agoraMs` injetavel ->
// deterministico, sem sleep/rede.
import assert from "node:assert";
import { cacheTTL, invalidarCache } from "../../src/lib/cache";

let ok = 0;
let falhou = 0;
function caso(nome: string, fn: () => Promise<void>): Promise<void> {
  return fn().then(
    () => { ok++; console.log(`  ok  ${nome}`); },
    (e) => { falhou++; console.error(`FALHA  ${nome}: ${e instanceof Error ? e.message : String(e)}`); },
  );
}

async function main() {
  await caso("dentro do TTL serve cache (loader roda 1x)", async () => {
    let n = 0;
    const carregar = async () => { n++; return n; };
    const a = await cacheTTL("k1", 1000, carregar, 0);
    const b = await cacheTTL("k1", 1000, carregar, 500); // ainda vigente
    assert.equal(a, 1);
    assert.equal(b, 1);
    assert.equal(n, 1);
  });

  await caso("passado o TTL recarrega (loader roda 2x)", async () => {
    let n = 0;
    const carregar = async () => { n++; return n; };
    await cacheTTL("k2", 1000, carregar, 0);
    const b = await cacheTTL("k2", 1000, carregar, 1001); // expirou (>)
    assert.equal(b, 2);
    assert.equal(n, 2);
  });

  await caso("exatamente no limite (==) ja expirou (vigente so em [t, t+ttl))", async () => {
    let n = 0;
    const carregar = async () => { n++; return n; };
    await cacheTTL("k3", 1000, carregar, 0); // expiraEm=1000, valido para agoraMs<1000
    const b = await cacheTTL("k3", 1000, carregar, 1000); // 1000 > 1000 == false -> recarrega
    assert.equal(b, 2);
    assert.equal(n, 2);
  });

  await caso("invalidar forca recarga na proxima leitura", async () => {
    let n = 0;
    const carregar = async () => { n++; return n; };
    await cacheTTL("k4", 100000, carregar, 0);
    invalidarCache("k4");
    const b = await cacheTTL("k4", 100000, carregar, 1); // cache apagado -> recarrega
    assert.equal(b, 2);
    assert.equal(n, 2);
  });

  await caso("chaves diferentes nao se misturam", async () => {
    const a = await cacheTTL("kA", 1000, async () => "A", 0);
    const b = await cacheTTL("kB", 1000, async () => "B", 0);
    assert.equal(a, "A");
    assert.equal(b, "B");
  });

  console.log(`\nC28 micro-cache TTL (capacidade): ${ok} ok, ${falhou} falha(s)`);
  if (falhou > 0) process.exit(1);
}
void main();
