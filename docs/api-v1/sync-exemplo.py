#!/usr/bin/env python3
"""
Exemplo de sincronizacao incremental com a API de Leitura v1 do CRM Sixxis.

Usa:
  - Paginacao por cursor      (?limite=... &cursor=...)
  - Sincronizacao incremental (?atualizadoDesde=<ISO>) para puxar so o que mudou
  - Projecao de campos        (?campos=a,b,c) para trafegar menos

So depende da stdlib (urllib). Guarda um "watermark" por recurso em disco para,
na proxima execucao, pedir apenas registros criados/alterados desde a ultima vez.

Uso:
  export SIXXIS_API_BASE="https://sixxis-crm-production.up.railway.app/api/v1"
  export SIXXIS_API_TOKEN="sxc_live_..."
  python3 -I sync-exemplo.py leads negocios conversas

A chave nunca deve ser commitada nem logada. Passe via variavel de ambiente.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = os.environ.get("SIXXIS_API_BASE", "https://sixxis-crm-production.up.railway.app/api/v1").rstrip("/")
TOKEN = os.environ.get("SIXXIS_API_TOKEN", "")
ESTADO = os.environ.get("SIXXIS_SYNC_ESTADO", "sync-estado.json")  # watermarks por recurso
PAGINA = int(os.environ.get("SIXXIS_SYNC_PAGINA", "200"))

# Campo de watermark por recurso (coluna que a API ordena/filtra em atualizadoDesde).
# A maioria usa criadoEm/atualizadoEm; consulte GET /meta/recursos para o mapa real.
WATERMARK = "atualizadoEm"


def _req(caminho: str, params: dict) -> dict:
    qs = urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})
    url = f"{BASE}{caminho}" + (f"?{qs}" if qs else "")
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/json",
        "User-Agent": "sixxis-sync-exemplo/1.0",
    })
    for tentativa in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:  # respeita rate limit
                espera = int(e.headers.get("Retry-After", "2"))
                time.sleep(espera)
                continue
            corpo = e.read().decode("utf-8", "replace")
            raise SystemExit(f"[{e.code}] {caminho}: {corpo}") from None
        except urllib.error.URLError as e:
            time.sleep(1.5 * (tentativa + 1))
            if tentativa == 4:
                raise SystemExit(f"rede: {caminho}: {e}") from None
    raise SystemExit(f"falhou apos retries: {caminho}")


def carregar_estado() -> dict:
    try:
        with open(ESTADO, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def salvar_estado(estado: dict) -> None:
    tmp = ESTADO + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=2)
    os.replace(tmp, ESTADO)


def sincronizar(recurso: str, estado: dict) -> int:
    desde = estado.get(recurso)  # None na 1a vez = full load
    cursor = None
    total = 0
    maior = desde
    print(f"→ {recurso}: {'incremental desde ' + desde if desde else 'carga inicial'}")
    while True:
        dados = _req(f"/{recurso}", {
            "limit": PAGINA,
            "cursor": cursor,
            "atualizadoDesde": desde,
        })
        itens = dados.get("data", [])
        for item in itens:
            total += 1
            # >>> aqui voce grava no seu banco/arquivo <<<
            # print(json.dumps(item, ensure_ascii=False))
            wm = item.get(WATERMARK) or item.get("criadoEm")
            if wm and (maior is None or wm > maior):
                maior = wm
        meta = dados.get("meta", {})
        cursor = meta.get("nextCursor")
        if not (meta.get("hasMore") and cursor):
            break
    if maior:
        estado[recurso] = maior  # avança o watermark só após a página inteira
    print(f"  {total} registros | watermark={estado.get(recurso)}")
    return total


def main(argv: list[str]) -> int:
    if not TOKEN:
        raise SystemExit("defina SIXXIS_API_TOKEN (nunca commite a chave)")
    recursos = argv[1:] or ["leads", "negocios", "conversas", "mensagens"]
    estado = carregar_estado()
    inicio = datetime.now(timezone.utc).isoformat()
    total = 0
    for r in recursos:
        total += sincronizar(r, estado)
        salvar_estado(estado)  # persistência incremental: cair no meio não perde progresso
    print(f"✔ {total} registros em {len(recursos)} recurso(s) | run {inicio}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
