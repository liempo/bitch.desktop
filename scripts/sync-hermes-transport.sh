#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_URL="https://raw.githubusercontent.com/NousResearch/hermes-agent/main/apps/shared/src/json-rpc-gateway.ts"
DEST="$ROOT/src/lib/gateway/json-rpc-gateway.ts"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

curl -fsSL "$SRC_URL" -o "$TMP"
install -m 0644 "$TMP" "$DEST"

npx --yes prettier --write "$DEST" --config "$ROOT/.prettierrc" >/dev/null

echo "Updated $DEST from upstream Hermes transport layer."
echo "Normalized formatting with the repo Prettier config."
echo "Review the diff and migrate any local changes manually."
