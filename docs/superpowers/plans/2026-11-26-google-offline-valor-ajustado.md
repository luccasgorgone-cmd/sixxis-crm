# Google Offline Official Value Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Google offline conversion export use the CRM official business value: `valorAjustado` when non-null, otherwise `valor`.

**Architecture:** Keep the existing CSV contract and export flow. Change only the Prisma eligibility predicate and selected fields, then resolve the official value in the existing Google offline module through one small pure function covered by the existing deterministic contracts.

**Tech Stack:** TypeScript, Prisma, Node assert/node:test, tsx.

**Spec:** `/home/pzxx1010/.openclaw/agents/crm/workspace/AGENTS.md` — critical rule `Negocio.valorAjustado` overrides `Negocio.valor`, including zero.

## Global Constraints

- Preserve `gclid,data,valor,moeda,transaction_id`, UTF-8 without BOM and LF.
- `valorAjustado = 0` must exclude the conversion even when `valor > 0`.
- A positive `valorAjustado` must include the conversion even when `valor <= 0`.
- No schema, migration, production write, upload, push or deploy.
- No new dependency or abstraction outside the existing Google offline boundary.

## Review Focus

- Non-null adjusted zero must not fall back to gross value.
- Null adjusted value must fall back to gross value.
- Positive adjusted value must be selected and formatted with two decimals.
- Eligibility and emitted value must implement the same precedence rule.
- Existing CSV dialect, transaction ID and timestamp behavior must remain unchanged.

---

### Task 1: Align OCI eligibility and emitted value

**Files:**
- Modify: `src/lib/tracking/conversaoElegivel.ts`
- Modify: `src/lib/tracking/conversaoElegivel.test.ts`
- Modify: `src/lib/relatorios/googleOffline.ts`
- Modify: `scripts/contratos/c8-gclid.ts`

**Interfaces:**
- Consumes: `Negocio.valor`, `Negocio.valorAjustado`, and the existing `whereGanhosGoogleOffline()`/CSV flow.
- Produces: `resolverValorGoogleOffline({ valor, valorAjustado }): number` plus a Prisma predicate equivalent to `COALESCE(valorAjustado, valor) > 0`.

- [x] **Step 1: Write failing tests**

Add literal assertions proving the Prisma predicate has adjusted-value precedence and proving the pure resolver returns adjusted, fallback, and adjusted zero values.

- [x] **Step 2: Run tests to verify RED**

Run: `npx tsx --test src/lib/tracking/conversaoElegivel.test.ts && npx tsx scripts/contratos/c8-gclid.ts`

Expected: FAIL because the predicate still checks only `valor > 0` and the resolver does not exist.

- [x] **Step 3: Implement the minimum fix**

Select `valorAjustado`; use the pure resolver in collection; express eligibility as adjusted positive OR adjusted null plus gross positive.

- [x] **Step 4: Verify GREEN and regression gates**

Run: `npx tsx --test src/lib/tracking/conversaoElegivel.test.ts && npx tsx scripts/contratos/c8-gclid.ts && npx tsc --noEmit`

Expected: all tests pass and TypeScript exits 0.

- [x] **Step 5: Commit locally**

```bash
git add src/lib/tracking/conversaoElegivel.ts src/lib/tracking/conversaoElegivel.test.ts src/lib/relatorios/googleOffline.ts scripts/contratos/c8-gclid.ts docs/superpowers/plans/2026-11-26-google-offline-valor-ajustado.md
git commit -m "fix(google-offline): exporta valor oficial do negocio"
```
