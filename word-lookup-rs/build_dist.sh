#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DIST_DIR="${DIST_DIR:-dist}"
BINARIES=(lookup_app trigger_lookup)
HOST_TRIPLE="$(rustc -vV | awk '/^host: / {print $2}')"
ENABLE_MACOS_UNIVERSAL="${ENABLE_MACOS_UNIVERSAL:-0}"
ENABLE_WINDOWS_BUILD="${ENABLE_WINDOWS_BUILD:-0}"

log() {
  printf '[build_dist] %s\n' "$*"
}

copy_binaries() {
  local target="$1"
  local from_dir="${2:-$ROOT_DIR/target/$target/release}"
  local to_dir="$ROOT_DIR/$DIST_DIR/$target"
  mkdir -p "$to_dir"

  for bin in "${BINARIES[@]}"; do
    local src="$from_dir/$bin"
    local dst="$to_dir/$bin"

    if [[ "$target" == *windows* ]]; then
      src="$from_dir/$bin.exe"
      dst="$to_dir/$bin.exe"
    fi

    if [[ ! -f "$src" ]]; then
      log "missing binary: $src"
      return 1
    fi

    cp "$src" "$dst"
    chmod +x "$dst" 2>/dev/null || true
  done
}

build_host_release() {
  log "building host release ($HOST_TRIPLE)..."
  cargo build --release --bins
  copy_binaries "$HOST_TRIPLE" "$ROOT_DIR/target/release"
}

build_macos_universal_if_possible() {
  if [[ "$ENABLE_MACOS_UNIVERSAL" != "1" ]]; then
    log "skip universal: set ENABLE_MACOS_UNIVERSAL=1 to enable."
    return 0
  fi

  if [[ "$OSTYPE" != darwin* ]]; then
    return 0
  fi

  local arm_target="aarch64-apple-darwin"
  local intel_target="x86_64-apple-darwin"
  local installed
  installed="$(rustup target list --installed)"

  if ! grep -qx "$arm_target" <<<"$installed" || ! grep -qx "$intel_target" <<<"$installed"; then
    log "skip universal: install both targets first:"
    log "  rustup target add $arm_target $intel_target"
    return 0
  fi

  if ! command -v lipo >/dev/null 2>&1; then
    log "skip universal: lipo not found."
    return 0
  fi

  log "building macOS universal binaries..."
  cargo build --release --bin lookup_app --target "$arm_target"
  cargo build --release --bin lookup_app --target "$intel_target"
  cargo build --release --bin trigger_lookup --target "$arm_target"
  cargo build --release --bin trigger_lookup --target "$intel_target"

  local out_dir="$ROOT_DIR/$DIST_DIR/macos-universal"
  mkdir -p "$out_dir"

  for bin in "${BINARIES[@]}"; do
    lipo -create \
      "$ROOT_DIR/target/$arm_target/release/$bin" \
      "$ROOT_DIR/target/$intel_target/release/$bin" \
      -output "$out_dir/$bin"
    chmod +x "$out_dir/$bin"
  done
}

build_windows_if_possible() {
  if [[ "$ENABLE_WINDOWS_BUILD" != "1" ]]; then
    log "skip windows: set ENABLE_WINDOWS_BUILD=1 to enable."
    return 0
  fi

  local target="x86_64-pc-windows-msvc"
  if ! command -v cargo-xwin >/dev/null 2>&1 && ! cargo xwin --help >/dev/null 2>&1; then
    log "skip windows: cargo-xwin not available."
    return 0
  fi

  log "building windows binaries via cargo xwin..."
  cargo xwin build --release --bin lookup_app --target "$target"
  cargo xwin build --release --bin trigger_lookup --target "$target"
  copy_binaries "$target"
}

main() {
  mkdir -p "$DIST_DIR"
  build_host_release
  build_macos_universal_if_possible
  build_windows_if_possible

  log "build complete. artifacts under: $ROOT_DIR/$DIST_DIR"
  find "$DIST_DIR" -maxdepth 3 -type f | sort
}

main "$@"
