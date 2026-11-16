// Deriva openapi.yaml + colecao.postman.json a partir de docs/api-v1/openapi.json.
// Determinístico: a fonte é o spec gerado pelo registro (sem prosa à mão).
import { readFileSync, writeFileSync } from "node:fs";

const PROD = "https://sixxis-crm-production.up.railway.app/api/v1";
const spec = JSON.parse(readFileSync("docs/api-v1/openapi.json", "utf8"));

// ---- YAML minimal seguro (escalares via JSON.stringify = YAML flow válido) --
function yaml(v: unknown, ind = 0): string {
  const pad = "  ".repeat(ind);
  if (v === null) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return v
      .map((it) => {
        const r = yaml(it, ind + 1);
        if (r.includes("\n")) {
          // objeto/array: coloca o primeiro par na mesma linha do "- "
          const inner = r.replace(new RegExp("^" + "  ".repeat(ind + 1)), "");
          return pad + "- " + inner.replace(/\n/, "\n");
        }
        return pad + "- " + r;
      })
      .join("\n");
  }
  if (typeof v === "object") {
    const ents = Object.entries(v as Record<string, unknown>);
    if (ents.length === 0) return "{}";
    return ents
      .map(([k, val]) => {
        const key = /^[A-Za-z0-9_.\/-]+$/.test(k) ? k : JSON.stringify(k);
        const r = yaml(val, ind + 1);
        if (r.includes("\n") || (typeof val === "object" && val !== null && Object.keys(val as object).length)) {
          return pad + key + ":\n" + r;
        }
        return pad + key + ": " + r;
      })
      .join("\n");
  }
  return "null";
}
writeFileSync("docs/api-v1/openapi.yaml", yaml(spec) + "\n");

// ---- Postman v2.1 a partir dos paths GET -----------------------------------
type Item = { name: string; request: unknown };
const pastas: Record<string, Item[]> = {};
const tagDe = (p: string, op: any): string =>
  (op.tags && op.tags[0]) || (p.split("/")[1] ? p.split("/")[1] : "root");

for (const [p, metodos] of Object.entries<any>(spec.paths)) {
  const op = metodos.get;
  if (!op) continue;
  const tag = tagDe(p, op);
  const segs = p.split("/").filter(Boolean);
  const pathArr = segs.map((s) => (s.startsWith("{") ? ":" + s.slice(1, -1) : s));
  const vars = segs
    .filter((s) => s.startsWith("{"))
    .map((s) => ({ key: s.slice(1, -1), value: "COLOQUE_O_ID" }));
  // query de exemplo p/ listas (sem path param)
  const query =
    vars.length === 0 && !["/health", "/me", "/docs", "/openapi.json", "/meta/recursos"].includes(p)
      ? [
          { key: "limit", value: "50" },
          { key: "cursor", value: "", disabled: true },
          { key: "atualizadoDesde", value: "", disabled: true },
          { key: "fields", value: "", disabled: true },
        ]
      : [];
  const semAuth = p === "/health" || p === "/openapi.json" || p === "/docs";
  const item: Item = {
    name: op.summary || `GET ${p}`,
    request: {
      method: "GET",
      ...(semAuth ? {} : { auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}", type: "string" }] } }),
      header: [{ key: "Accept", value: "application/json" }],
      url: {
        raw: "{{baseUrl}}" + p + (query.length ? "?limit=50" : ""),
        host: ["{{baseUrl}}"],
        path: pathArr,
        ...(query.length ? { query } : {}),
        ...(vars.length ? { variable: vars } : {}),
      },
      description: op.description || op.summary || "",
    },
  };
  (pastas[tag] ||= []).push(item);
}

const collection = {
  info: {
    name: "Sixxis CRM — API de Leitura v1",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    description:
      "API read-only do CRM Sixxis. Auth: Bearer {{token}}. Base: {{baseUrl}}. Gerada do OpenApi (registro = fonte única).",
  },
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}", type: "string" }] },
  variable: [
    { key: "baseUrl", value: PROD },
    { key: "token", value: "SUA_CHAVE_AQUI_sxc_live_..." },
  ],
  item: Object.entries(pastas)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nome, items]) => ({ name: nome, item: items })),
};
writeFileSync("docs/api-v1/colecao.postman.json", JSON.stringify(collection, null, 2) + "\n");

console.log(
  `OK openapi.yaml + colecao.postman.json | pastas=${Object.keys(pastas).length} requests=${Object.values(pastas).reduce((a, b) => a + b.length, 0)}`,
);
