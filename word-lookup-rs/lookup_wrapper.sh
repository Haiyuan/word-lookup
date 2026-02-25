#!/bin/bash
# PopClip entrypoint for Rust rewrite.
WORD="${POPCLIP_TEXT:-$1}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

BIN="$SCRIPT_DIR/target/release/trigger_lookup"
if [[ ! -x "$BIN" ]]; then
  BIN="$SCRIPT_DIR/target/debug/trigger_lookup"
fi

if [[ ! -x "$BIN" ]]; then
  echo "trigger_lookup binary not found. Build first:" >&2
  echo "  cargo build --release --bin lookup_app --bin trigger_lookup" >&2
  exit 1
fi

if [[ -n "$WORD" ]]; then
  "$BIN" "$WORD"
else
  "$BIN"
fi
