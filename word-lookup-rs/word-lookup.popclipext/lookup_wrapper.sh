#!/bin/bash
set -euo pipefail

# PopClip selected text; fallback to first arg for local testing.
WORD="${POPCLIP_TEXT:-${1:-}}"
if [[ -z "${WORD// }" ]]; then
  exit 0
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

RS_DIR="${WORD_LOOKUP_RS_DIR:-$APP_ROOT/word-lookup-rs}"
DEFAULT_RS_DIR="/Applications/word-lookup/word-lookup-rs"
if [[ ! -d "$RS_DIR" && -d "$DEFAULT_RS_DIR" ]]; then
  RS_DIR="$DEFAULT_RS_DIR"
fi

declare -a CANDIDATES=(
  "${WORD_LOOKUP_TRIGGER:-}"
  "$RS_DIR/dist/macos-universal/trigger_lookup"
  "$RS_DIR/dist/aarch64-apple-darwin/trigger_lookup"
  "$RS_DIR/dist/x86_64-apple-darwin/trigger_lookup"
  "$RS_DIR/target/release/trigger_lookup"
  "$RS_DIR/target/debug/trigger_lookup"
)

for bin in "${CANDIDATES[@]}"; do
  if [[ -n "$bin" && -x "$bin" ]]; then
    "$bin" "$WORD"
    exit $?
  fi
done

if command -v trigger_lookup >/dev/null 2>&1; then
  trigger_lookup "$WORD"
  exit $?
fi

echo "word-lookup: trigger_lookup binary not found." >&2
echo "Checked paths:" >&2
for bin in "${CANDIDATES[@]}"; do
  if [[ -n "$bin" ]]; then
    echo "  $bin" >&2
  fi
done
exit 1
