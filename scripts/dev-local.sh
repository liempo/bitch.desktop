#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export CARGO_HOME="$ROOT/.cargo"
export RUSTUP_HOME="$ROOT/.rustup"
export PATH="$CARGO_HOME/bin:$PATH"

if [ ! -x "$CARGO_HOME/bin/cargo" ]; then
  echo "local cargo not found; bootstrapping local Rust toolchain..."
  source "$ROOT/scripts/setup-rust-local.sh"
fi

cd "$ROOT"
npm run dev
