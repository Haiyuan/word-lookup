#!/bin/bash
# run_lookup.sh — unified entry‑point for lookup
# Usage:
#   echo "hello" | ./run_lookup.sh
#   ./run_lookup.sh "hash browns"

if [[ $# -gt 0 ]]; then
    # All CLI arguments form the lookup term (preserve spaces)
    input="$*"
else
    # Read full stdin (piped content)
    input="$(cat -)"
fi

# Path to your virtualenv python & trigger script — adjust if needed
~/myenv/bin/python3 /Applications/word-lookup/word-lookup-py/trigger_lookup.py "$input"
