node=node
# A Claude Code started outside an nvm shell has no node on PATH, so fall back to the one install.sh recorded.
command -v node >/dev/null 2>&1 || IFS= read -r node 2>/dev/null < "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/mode/node" || {
  echo "mode: node is not on PATH, and install.sh has not recorded one in ${CLAUDE_CONFIG_DIR:-$HOME/.claude}/mode/node" >&2
  exit 127
}
