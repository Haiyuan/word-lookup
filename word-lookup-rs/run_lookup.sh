#!/bin/bash
# Unified CLI entrypoint:
#   echo "hello" | ./run_lookup.sh
#   ./run_lookup.sh "hash browns"

if [[ $# -gt 0 ]]; then
  INPUT="$*"
else
  INPUT="$(cat -)"
fi

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

if [[ -n "$INPUT" ]]; then
  "$BIN" "$INPUT"
else
  "$BIN"
fi
