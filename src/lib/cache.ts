// Micro-cache em memoria (TTL curto) para leituras QUASE-ESTATICAS e muito
// repetidas (ex.: ConfiguracaoCRM, lida a cada request/mensagem). Corta o grosso
// das idas ao Postgres dessas tabelas minusculas, aliviando o pool de conexoes e
// a latencia sob trafego (a lentidao e volume de query, nao volume de dados).
//
// NAO usar para dado que precisa ser exato ao instante — ex.: o ponteiro do
// rodizio (ConfigRoteamento), que e lido E escrito dentro da transacao de
// roteamento; cachear quebraria o round-robin.
//
// Processo unico (Next + Socket.io + BullMQ juntos): um Map basta. Nao ha
// coerencia entre instancias — por isso TTL curto + invalidacao no save.
type Entrada<T> = { valor: T; expiraEm: number };
const mapa = new Map<string, Entrada<unknown>>();

// Retorna o valor cacheado se ainda vigente; senao carrega, guarda e devolve.
// `agoraMs` e injetavel para teste deterministico (contrato dourado).
export async function cacheTTL<T>(
  chave: string,
  ttlMs: number,
  carregar: () => Promise<T>,
  agoraMs: number = Date.now(),
): Promise<T> {
  const e = mapa.get(chave) as Entrada<T> | undefined;
  if (e && e.expiraEm > agoraMs) return e.valor;
  const valor = await carregar();
  mapa.set(chave, { valor, expiraEm: agoraMs + ttlMs });
  return valor;
}

// Descarta a entrada (chamar ao salvar o dado de origem) para refletir na hora.
export function invalidarCache(chave: string): void {
  mapa.delete(chave);
}

// Diagnostico/teste.
export function _tamanhoCache(): number {
  return mapa.size;
}
