#!/usr/bin/env bash
root=${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}

# python3, not jq: the other three hooks already require it, and jq is not a given on a stranger's machine.
path=$(python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("tool_input", {}).get("file_path", "") or "")
except Exception: pass' 2>/dev/null)

# Matched on the folder shape, not on the plugin prefix: a symlinked checkout saves under the real path.
case "$path" in
  */modes/*.md|*/styles/*.md)
    "$root/bin/mode" sync >/dev/null 2>&1
    ;;
esac
exit 0
