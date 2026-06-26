#!/bin/bash
set -euo pipefail

SEED=/usr/share/collabfm
APP=/usr/src/app
MARKER="$APP/.collabfm-seeded"
SYNC_MODE="${COLLABFM_SYNC_MODE:-preserve}"
SYNC_MODE="$(echo "$SYNC_MODE" | tr '[:upper:]' '[:lower:]')"

mkdir -p "$APP"

sync_app_from_image() {
  echo "CollabFM: syncing app from image into $APP (preserving config, storage, logs, node_modules)..."
  rsync -a --delete \
    --exclude storage/ \
    --exclude logs/ \
    --exclude config.json \
    --exclude node_modules/ \
    --exclude .collabfm-seeded \
    "$SEED/" "$APP/"
  touch "$MARKER"
  echo "CollabFM: sync complete. config.json, storage/, logs/, and node_modules/ were not modified."
}

if [ ! -f "$APP/package.json" ]; then
  echo "CollabFM: first run — seeding $APP from image..."
  cp -a "$SEED/." "$APP/"
  touch "$MARKER"
  echo "CollabFM: seed complete. Edit config.json in your appdata folder as needed."
elif [ "$SYNC_MODE" = "update" ]; then
  sync_app_from_image
fi

cd "$APP"

if [ -f scripts/ensure-config.js ]; then
  node scripts/ensure-config.js
fi

DEPS_STAMP="node_modules/.deps-stamp"
need_install=0
if [ ! -f node_modules/better-sqlite3/package.json ]; then
  need_install=1
elif [ ! -f node_modules/archiver/package.json ]; then
  need_install=1
elif [ ! -f "$DEPS_STAMP" ]; then
  need_install=1
elif [ package.json -nt "$DEPS_STAMP" ]; then
  need_install=1
elif [ -f package-lock.json ] && [ package-lock.json -nt "$DEPS_STAMP" ]; then
  need_install=1
fi

if [ "$need_install" -eq 1 ]; then
  echo "CollabFM: installing npm dependencies in $APP ..."
  npm install --omit=dev
  touch "$DEPS_STAMP"
fi

if [ -n "${WEB_PORT:-}" ] || [ -n "${WS_PORT:-}" ] || [ -n "${PCM_RELAY_PORT:-}" ]; then
  echo "CollabFM: ports from environment — web=${WEB_PORT:-config} ws=${WS_PORT:-config} pcm=${PCM_RELAY_PORT:-config}"
fi

exec "$@"
