#!/bin/bash
# 读取 PopClip 传来的文本
WORD="$POPCLIP_TEXT"

~/myenv/bin/python3 /Applications/word-lookup/word-lookup-py/trigger_lookup.py "$WORD"
