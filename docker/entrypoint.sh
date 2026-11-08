#!/bin/sh
set -eu

cd /app

if [ ! -f package.json ] || [ ! -f server.mjs ]; then
  echo "Boulderhalle: unter /app liegt kein Checkout (package.json oder server.mjs fehlt)." >&2
  echo "Den Git-Ordner auf /app einhängen und den Datenordner auf /data." >&2
  exit 1
fi

mkdir -p "${DATA_DIR:-/data}"

if [ -f package-lock.json ]; then
  lock_hash=$(sha256sum package-lock.json | awk '{print $1}')
  stamp=node_modules/.package-lock.sha256
  current=
  if [ -f "$stamp" ]; then
    current=$(cat "$stamp")
  fi
  if [ ! -d node_modules ] || [ "$current" != "$lock_hash" ]; then
    echo "Boulderhalle: Abhängigkeiten installieren …"
    npm ci --omit=dev --loglevel=error
    printf '%s\n' "$lock_hash" > "$stamp"
  fi
fi

echo "Boulderhalle: Server starten."
exec node server.mjs
