# CRM SLA Ticker Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the minute-by-minute event-loop stall caused by repeated timezone formatter construction in the SLA business-minute calculation, without changing SLA results.

**Architecture:** Keep the existing synchronous pure calculation and its public API. Reuse one immutable `Intl.DateTimeFormat` instance for the last requested timezone instead of constructing a formatter for every date visited; this is an O(1)-memory, bounded optimization in the existing helper. A deterministic load contract pins both the hand-derived result and the maximum runtime on the current gate host.

**Tech Stack:** TypeScript 5.7, Node.js 26, Next.js 16 custom server, Prisma 7, existing golden-contract scripts.

**Spec:** `/home/pzxx1010/.openclaw/workspace/main/entregas/2026-11-24/RELATORIO-FINAL-24-11.md` plus the 2026-11-25 main→CRM stability request in the session transcript.

## Global Constraints

- Base is `origin/main` at `89e578a`; the four Black Friday combo commits must not enter this branch.
- Bounded change only: no schema, migration, production config, message send, external write, or service-topology change.
- Preserve every numerical result and the invalid-timezone fallback of `minutosUteisEntre`.
- Keep formatter-cache memory bounded independently of the number of distinct timezone strings seen.
- Commit locally only. Push/merge/deploy waits for the main agent's Art. 1.8a GO on the exact hash.
- Final gates: `npx tsc --noEmit`, every `scripts/contratos/c*.ts`, and `npm run build` on the exact candidate.

## Review Focus

- Invalid IANA timezone: construction must still fall back through the existing `partesLocais` catch path.
- Alternating timezones: each call must use the formatter for its own timezone, never a stale cached formatter.
- DST/calendar boundaries: spring-forward and fall-back wall-clock behavior remains pinned by C31.
- Long spans near the 800-day guard: optimization must not alter the guard or counted minutes.
- Performance gate variance: the threshold needs enough headroom for the optimized code while still failing the current implementation on this host.

---

### Task 1: Bound formatter allocation in the SLA business-minute helper

**Files:**
- Modify: `src/lib/horario.ts:47-82`
- Create: `scripts/contratos/c31-horario-performance.ts`
- Test: `scripts/contratos/c12-tempo-util.ts`
- Test: `scripts/contratos/c31-horario-performance.ts`

**Interfaces:**
- Consumes: existing `minutosUteisEntre(de, ate, horarios, feriados, fuso): number`.
- Produces: identical public API and values; formatter allocation becomes bounded to the most recently used timezone.

- [x] **Step 1: Write the failing load contract**

Create C31 with a Monday-Friday 08:00-18:00 schedule. Call `minutosUteisEntre` 200 times for `2025-11-25T12:00:00Z`→`2026-11-25T12:00:00Z` in `America/Sao_Paulo`. Assert the hand-derived total is `31_320_000` minutes across all calls and elapsed wall time is `< 1_500 ms`. Also assert that `America/Sao_Paulo → UTC → America/Sao_Paulo` uses the correct formatter each time and that an invalid IANA timezone preserves the existing local-time fallback.

- [x] **Step 2: Run C31 to verify RED**

Run: `npx tsx scripts/contratos/c31-horario-performance.ts`

Expected: FAIL only on the `< 1_500 ms` load assertion; the numerical assertion passes. Baseline observed before the change on this host: approximately `2_858 ms`.

- [x] **Step 3: Implement the minimal formatter reuse**

In `src/lib/horario.ts`, add a module-local single-entry cache `{ fuso, formatador } | null` and `obterFormatadorPartesLocais(fuso: string): Intl.DateTimeFormat`. On a matching timezone return the existing immutable formatter; otherwise construct with the exact current locale/options and replace the single entry. Have `partesLocais` call this helper inside its existing `try` block so invalid timezone behavior remains unchanged.

- [x] **Step 4: Run focused correctness and load contracts GREEN**

Run: `npx tsx scripts/contratos/c12-tempo-util.ts && npx tsx scripts/contratos/c31-horario-performance.ts`

Expected: C12 unchanged and green; C31 numerical result `31_320_000`, elapsed `< 1_500 ms`, zero failures.

- [x] **Step 5: Run the production-shaped read-only benchmark**

Run the existing read-only benchmark against PROD dates/config without writes. Compare against the recorded baseline of 2,494–2,496 open businesses and `5_946–6_307 ms`; verify the optimized checksum matches the old implementation on the same captured input and record elapsed time/speedup in the delivery receipt.

- [x] **Step 6: Run full gates on the exact candidate**

Run: `npx tsc --noEmit`; all `scripts/contratos/c*.ts`; `nice -n 19 npm run build`.

Expected: typecheck exit 0; every contract exit 0; production build exit 0.

Observed: typecheck exited 0 and all 31 contracts passed. The local build
reached Turbopack and failed only because this host cannot fetch Inter from
`fonts.googleapis.com`; Railway build remains the required deployment gate.

- [x] **Step 7: Commit**

```bash
git add src/lib/horario.ts scripts/contratos/c31-horario-performance.ts docs/superpowers/plans/2026-11-25-crm-sla-ticker-performance.md
git commit -m "perf(sla): reutiliza formatter no ticker de minutos uteis"
```
