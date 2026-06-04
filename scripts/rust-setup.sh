#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export CARGO_HOME="$ROOT/.cargo"
export RUSTUP_HOME="$ROOT/.rustup"
export PATH="$CARGO_HOME/bin:$PATH"

mkdir -p "$CARGO_HOME" "$RUSTUP_HOME"

if [ -x "$CARGO_HOME/bin/cargo" ] && [ -x "$CARGO_HOME/bin/rustc" ]; then
  echo "Local Rust toolchain already present in $CARGO_HOME"
  exit 0
fi

if ! command -v rustup >/dev/null 2>&1; then
  echo "rustup not found on PATH. Install it first, or let this script bootstrap from rustup.rs."
  echo "Bootstrapping into $CARGO_HOME and $RUSTUP_HOME..."
fi

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
  sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable

rustup show active-toolchain
cargo --version
rustc --version
