# word-lookup-rs

Rust rewrite of the Python lookup launcher workflow.

## Binaries

- `lookup_app`: socket daemon on `127.0.0.1:5050`; receives a word and opens lookup URL.
  If started with a word argument and daemon delivery fails (for example, port occupied by another app), it does a direct one-shot lookup and exits.
- `trigger_lookup`: sends a word to daemon first; if delivery fails, it runs `lookup_app <word>` as fallback.

## Build

```bash
cargo build --release --bin lookup_app --bin trigger_lookup
```

## Usage

```bash
# Start daemon
./target/release/lookup_app

# Send one word
./target/release/trigger_lookup hello
./target/release/trigger_lookup "hash browns"
```

`sources.json` location follows platform conventions:

- macOS: `~/Library/Application Support/word-lookup/sources.json`
- Windows: `%APPDATA%/word-lookup/sources.json`
- Linux: `$XDG_DATA_HOME/word-lookup/sources.json` or `~/.local/share/word-lookup/sources.json`

If the file is missing or invalid, default sources are regenerated.
