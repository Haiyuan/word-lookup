#!/bin/bash
INPUT="$1"
echo "$INPUT" > /tmp/popclip_input.txt
shortcuts run "WordLookup" --input-path /tmp/popclip_input.txt
