#!/usr/bin/env bash
set -eu

# A statusLine command never gets CLAUDE_PLUGIN_ROOT expanded, so it needs a real path.
self=$0
case $self in
  /*) ;;
  *) self=$PWD/$self ;;
esac
PLUGIN_ROOT=$(cd "$(dirname "$self")" && pwd -P)
MODE_BIN=$PLUGIN_ROOT/bin/mode

NAME=""
CONFIG_DIR=""
ASSUME_YES=0
INSERT_CHIPS=0
SKIP_STATUSLINE=0
FORCE=0
WRITE_ALIASES=0
SKIP_ALIASES=0
TOUCHED=""
WAS_SYMLINK=0

usage() {
  cat <<'EOF'
Install the mode plugin.

A session holds one mode, which is a way of working, and one style, which is how Claude talks.
This script sets up the three things the plugin cannot do for itself: your name, the status line,
and a directory for contracts you write yourself.

Usage: ./install.sh [options]

  --name NAME        The name the contracts should call you. Prompted for if not given.
  --config-dir DIR   Claude config directory. Defaults to CLAUDE_CONFIG_DIR, then ~/.claude.
  --insert-chips     If a status line already exists, append the chips block to its script.
                     Off by default, because that file is yours and not the installer's.
  --no-status-line   Skip the status line entirely.
  --aliases          Write /style and /approve into your commands directory, so you can type
                     those instead of the namespaced /mode:style and /mode:approve.
  --no-aliases       Do not offer them.
  --force            Overwrite a status line script this installer wrote that has since changed.
  --yes              Do not ask anything. Needs --name. Never implies --insert-chips.
  --help             This text.

Running it twice is safe. The second run reports what is already in place and changes nothing.
EOF
}

say() { printf '%s\n' "$1"; }
step() { printf '\n%s\n' "$1"; }
warn() { printf '%s\n' "$1" >&2; }
die() { printf '%s\n' "$1" >&2; exit 1; }

# The summary at the end is the only record of what a one-off script did, so every write lands here.
touched() { TOUCHED="${TOUCHED}${TOUCHED:+
}$1"; }

need_arg() {
  [ "$2" -ge 2 ] || die "Option $1 needs a value."
}

while [ $# -gt 0 ]; do
  case $1 in
    --name) need_arg "$1" $#; NAME=$2; shift 2 ;;
    --name=*) NAME=${1#--name=}; shift ;;
    --config-dir) need_arg "$1" $#; CONFIG_DIR=$2; shift 2 ;;
    --config-dir=*) CONFIG_DIR=${1#--config-dir=}; shift ;;
    --insert-chips) INSERT_CHIPS=1; shift ;;
    --no-status-line) SKIP_STATUSLINE=1; shift ;;
    --aliases) WRITE_ALIASES=1; shift ;;
    --no-aliases) SKIP_ALIASES=1; shift ;;
    --force) FORCE=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) die "Unknown option: $1. Run with --help to see what is accepted." ;;
  esac
done

ask_yes_no() {
  if [ "$ASSUME_YES" -eq 1 ]; then return 1; fi
  if [ ! -t 0 ]; then return 1; fi
  printf '%s [y/N] ' "$1"
  read -r reply || return 1
  case $reply in y|Y|yes|Yes|YES) return 0 ;; *) return 1 ;; esac
}

# ---------------------------------------------------------------- dependencies

missing=""
command -v python3 >/dev/null 2>&1 || missing="${missing}
  python3   reads and rewrites settings.json without disturbing the rest of it"
command -v jq >/dev/null 2>&1 || missing="${missing}
  jq        pulls the session id out of the JSON Claude Code pipes into a status line"

if [ -n "$missing" ]; then
  warn "Cannot install. These are missing:"
  warn "$missing"
  warn ""
  warn "On macOS: brew install jq   (python3 ships with the Xcode command line tools)"
  exit 1
fi

# ---------------------------------------------------------------- where things go

if [ -z "$CONFIG_DIR" ]; then
  CONFIG_DIR=${CLAUDE_CONFIG_DIR:-$HOME/.claude}
else
  # bin/mode resolves its own config dir, so it has to be told the same one or the two disagree.
  CLAUDE_CONFIG_DIR=$CONFIG_DIR
  export CLAUDE_CONFIG_DIR
fi
SETTINGS=$CONFIG_DIR/settings.json
USER_CONTRACTS=$CONFIG_DIR/mode
STATUSLINE_SCRIPT=$USER_CONTRACTS/statusline.sh
CHIPS_RESOLVER=$USER_CONTRACTS/chips.sh
USER_COMMANDS=$CONFIG_DIR/commands

say "Installing the mode plugin."
say "  plugin        $PLUGIN_ROOT"
say "  config        $CONFIG_DIR"

# ---------------------------------------------------------------- 1. identity

step "1. Who the contracts should call you"

if [ -z "$NAME" ]; then
  if [ "$ASSUME_YES" -eq 1 ]; then
    die "--yes was given without --name, and the name cannot be guessed."
  fi
  if [ ! -t 0 ]; then
    die "No name given and nothing to prompt on. Pass --name \"Your Name\"."
  fi
  say "Contracts are written with a placeholder rather than a baked-in name."
  say "Whatever you type here is what the plugin substitutes when it talks to Claude."
  printf 'Your name: '
  read -r NAME || die "No name read."
fi

[ -n "$NAME" ] || die "The name cannot be empty."

if [ -x "$MODE_BIN" ]; then
  # bin/mode owns the config format, so the installer asks for the write rather than doing it.
  if config_path=$("$MODE_BIN" init --user "$NAME" 2>&1); then
    say "Identity written for $NAME."
    if [ -n "$config_path" ]; then
      say "  $config_path"
      touched "$config_path: identity config, names you as $NAME"
    fi
  else
    warn "bin/mode init failed and said:"
    warn "$config_path"
    die "Stopping here, because without the identity config the contracts keep the placeholder."
  fi
else
  die "No executable at $MODE_BIN. Run this script from inside the plugin directory."
fi

# ---------------------------------------------------------------- 2. your own contracts

step "2. A place for contracts you write yourself"

for sub in modes styles; do
  target=$USER_CONTRACTS/$sub
  if [ -d "$target" ]; then
    say "Already there: $target"
  else
    mkdir -p "$target"
    say "Created: $target"
    touched "$target: your own contracts, layered over the ones the plugin ships"
  fi
done

say "Anything you drop in there wins over a plugin contract of the same name, and survives"
say "a plugin update. A file needs front matter with name, summary, color and enter-when."

# ---------------------------------------------------------------- 3. the status line

read_statusline() {
  python3 -c '
import json, os, sys
p = sys.argv[1]
if not os.path.exists(p) or os.path.getsize(p) == 0:
    print("MISSING"); raise SystemExit(0)
try:
    with open(p) as f:
        d = json.load(f)
except Exception:
    print("INVALID"); raise SystemExit(0)
if not isinstance(d, dict):
    print("INVALID"); raise SystemExit(0)
sl = d.get("statusLine")
if sl is None:
    print("ABSENT")
else:
    print("PRESENT")
    print(json.dumps(sl))
' "$1"
}

# Truncates in place: an atomic write would swap a symlinked settings.json for a regular file.
write_statusline_key() {
  python3 -c '
import json, os, sys
p, cmd = sys.argv[1], sys.argv[2]
d = {}
if os.path.exists(p) and os.path.getsize(p) > 0:
    with open(p) as f:
        d = json.load(f)
d["statusLine"] = {"type": "command", "command": cmd}
with open(p, "w") as f:
    f.write(json.dumps(d, indent=2) + "\n")
with open(p) as f:
    json.load(f)
' "$1" "$2"
}

script_from_command() {
  python3 -c '
import os, shlex, sys
try:
    parts = shlex.split(sys.argv[1])
except ValueError:
    parts = sys.argv[1].split()
for a in parts:
    if os.path.isfile(a):
        print(a); break
' "$1"
}

backup_settings() {
  # Copy the contents, never the link, so restoring by hand puts bytes back where they belong.
  bak=$1.mode-backup.$(date +%Y%m%d%H%M%S)
  cp "$1" "$bak"
  say "Backed up: $bak"
  touched "$bak: backup of settings.json, taken before the statusLine key was written"
}

# Greppable, because the path in the block below carries a quote and never matches a loose search.
CHIPS_MARKER="mode-plugin:chips"

emit_chips_resolver() {
  cat <<EOF
#!/usr/bin/env bash
# $CHIPS_MARKER  Prints the mode and style chips for one session, or nothing at all.
session_id=\${1:-\${CLAUDE_CODE_SESSION_ID:-}}
[ -n "\$session_id" ] || exit 0

# Resolved on every render: a plugin update moves bin/mode to a new path and a baked one would rot.
config_dir=\${CLAUDE_CONFIG_DIR:-\$HOME/.claude}
pointer=\$config_dir/mode/plugin-root
manifest=\$config_dir/plugins/installed_plugins.json
mode_bin=""

# The SessionStart hook is the only thing that genuinely knows the plugin root, so it wins.
if [ -r "\$pointer" ]; then
  root=\$(head -1 "\$pointer" 2>/dev/null | tr -d '[:space:]')
  if [ -n "\$root" ] && [ -x "\$root/bin/mode" ]; then mode_bin=\$root/bin/mode; fi
fi

if [ -z "\$mode_bin" ] && [ -r "\$manifest" ] && command -v jq >/dev/null 2>&1; then
  old_ifs=\$IFS
  IFS='
'
  for p in \$(jq -r '.plugins | to_entries[] | select(.key | startswith("mode@")) | .value[] | .installPath // empty' "\$manifest" 2>/dev/null); do
    if [ -x "\$p/bin/mode" ]; then mode_bin=\$p/bin/mode; break; fi
  done
  IFS=\$old_ifs
fi

# Covers a local checkout that was never installed through a marketplace.
if [ -z "\$mode_bin" ] && [ -x "$MODE_BIN" ]; then mode_bin="$MODE_BIN"; fi
[ -n "\$mode_bin" ] || exit 0

chips=\$("\$mode_bin" chips --session "\$session_id" 2>/dev/null) || exit 0

# %b, not %s, so it renders whether bin/mode emits real escape bytes or backslash escapes.
[ -n "\$chips" ] && printf '%b' "\$chips"
exit 0
EOF
}

emit_statusline_script() {
  cat <<EOF
#!/usr/bin/env bash
# $CHIPS_MARKER  Written by the mode plugin installer. Add your own segments around the chips call.
input=\$(cat)
session_id=\$(printf '%s' "\$input" | jq -r '.session_id // empty')

"$CHIPS_RESOLVER" "\$session_id"
exit 0
EOF
}

emit_chips_block() {
  cat <<EOF

# $CHIPS_MARKER  The mode and style chips. Delete this block to unwire them.
mode_chips=\$("$CHIPS_RESOLVER" "\${session_id:-}")
if [ -n "\$mode_chips" ]; then printf '  %s' "\$mode_chips"; fi
EOF
}

install_chips_resolver() {
  if [ -f "$CHIPS_RESOLVER" ] && ! grep -q "$CHIPS_MARKER" "$CHIPS_RESOLVER" 2>/dev/null; then
    warn "A file sits at $CHIPS_RESOLVER that this installer did not write. Leaving it alone."
    return 1
  fi
  if [ -f "$CHIPS_RESOLVER" ] && emit_chips_resolver | diff -q - "$CHIPS_RESOLVER" >/dev/null 2>&1; then
    say "Already there: $CHIPS_RESOLVER"
    return 0
  fi
  emit_chips_resolver > "$CHIPS_RESOLVER"
  chmod +x "$CHIPS_RESOLVER"
  say "Wrote: $CHIPS_RESOLVER"
  touched "$CHIPS_RESOLVER: resolves the plugin at run time, so an update cannot break the chips"
}

install_fresh_statusline() {
  if [ -f "$STATUSLINE_SCRIPT" ]; then
    if grep -q "$CHIPS_MARKER" "$STATUSLINE_SCRIPT" 2>/dev/null; then
      if [ "$FORCE" -eq 1 ]; then
        emit_statusline_script > "$STATUSLINE_SCRIPT"
        chmod +x "$STATUSLINE_SCRIPT"
        say "Rewrote: $STATUSLINE_SCRIPT"
        touched "$STATUSLINE_SCRIPT: status line script, rewritten because --force was given"
      else
        say "Already there: $STATUSLINE_SCRIPT"
      fi
    else
      warn "A file sits at $STATUSLINE_SCRIPT that this installer did not write."
      warn "Leaving it alone. Move it aside, or re-run with --force."
      return 1
    fi
  else
    emit_statusline_script > "$STATUSLINE_SCRIPT"
    chmod +x "$STATUSLINE_SCRIPT"
    say "Created: $STATUSLINE_SCRIPT"
    touched "$STATUSLINE_SCRIPT: status line script, calls bin/mode chips and nothing else"
  fi

  sl_command="bash $STATUSLINE_SCRIPT"
  if [ -e "$SETTINGS" ]; then
    backup_settings "$SETTINGS"
  else
    mkdir -p "$(dirname "$SETTINGS")"
  fi
  write_statusline_key "$SETTINGS" "$sl_command"
  say "Set statusLine in: $SETTINGS"
  touched "$SETTINGS: the statusLine key only, now runs $STATUSLINE_SCRIPT"
}

handle_existing_statusline() {
  existing_command=$1

  case $existing_command in
    *"$STATUSLINE_SCRIPT"*)
      say "Already in place: your status line is the one this installer wrote."
      say "  $STATUSLINE_SCRIPT"
      return 0
      ;;
  esac

  say "You already have a status line, so this installer will not replace it."
  say "It probably renders things the plugin knows nothing about."
  say ""
  say "  current: $existing_command"
  say ""

  host_script=$(script_from_command "$existing_command")

  if [ -z "$host_script" ]; then
    say "The command does not point at a file this script can find, so add the chips yourself."
    say "Wherever that command builds its output, add:"
    say ""
    emit_chips_block
    say ""
    say "It expects a session id in \$session_id. If your line does not have one, read it from"
    say "the JSON on stdin with: jq -r '.session_id // empty'"
    return 0
  fi

  if grep -q "$CHIPS_MARKER" "$host_script" 2>/dev/null; then
    say "Already wired: $host_script prints the chips."
    return 0
  fi

  say "Your status line runs this script:"
  say "  $host_script"
  say ""
  say "One block added near the end of it, before any final exit, is all it takes:"
  say ""
  emit_chips_block
  say ""

  if [ "$INSERT_CHIPS" -ne 1 ]; then
    if ! ask_yes_no "Append that block to $host_script?"; then
      say "Left alone. Re-run with --insert-chips to have this appended for you."
      return 0
    fi
  fi

  preview=$host_script.mode-preview.$$
  cp "$host_script" "$preview"
  emit_chips_block >> "$preview"
  say ""
  say "This is the change:"
  diff -u "$host_script" "$preview" || true
  say ""

  if [ "$INSERT_CHIPS" -ne 1 ]; then
    if ! ask_yes_no "Write it?"; then
      rm -f "$preview"
      say "Nothing written."
      return 0
    fi
  fi

  bak=$host_script.mode-backup.$(date +%Y%m%d%H%M%S)
  cp "$host_script" "$bak"
  # Same in-place truncate as settings.json, for the same reason: this script may be a symlink too.
  cat "$preview" > "$host_script"
  rm -f "$preview"
  say "Backed up: $bak"
  say "Appended the chips block to: $host_script"
  touched "$bak: backup of your status line script"
  touched "$host_script: chips block appended at the end"
}

step "3. The status line"

if [ "$SKIP_STATUSLINE" -eq 1 ]; then
  say "Skipped, because --no-status-line was given."
  say "To wire it later, add this wherever your line is built:"
  say ""
  emit_chips_block
else
  install_chips_resolver || true
  say "It finds the plugin fresh on every render, so a plugin update cannot silently unwire it."
  say ""

  if [ -L "$SETTINGS" ]; then
    WAS_SYMLINK=1
    real=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$SETTINGS")
    say "Note: $SETTINGS is a symlink to"
    say "  $real"
    say "Anything written goes through the link rather than over it, so it stays a link."
  fi

  sl_state=$(read_statusline "$SETTINGS")
  sl_kind=$(printf '%s\n' "$sl_state" | head -1)
  sl_value=$(printf '%s\n' "$sl_state" | tail -n +2)

  case $sl_kind in
    MISSING)
      say "No settings file yet, so the plugin can own the status line."
      install_fresh_statusline || true
      ;;
    ABSENT)
      say "No status line set yet, so the plugin can own it."
      install_fresh_statusline || true
      ;;
    PRESENT)
      cmd=$(printf '%s' "$sl_value" | python3 -c '
import json, sys
try:
    v = json.load(sys.stdin)
except Exception:
    v = None
if isinstance(v, dict):
    print(v.get("command", ""))
elif isinstance(v, str):
    print(v)
')
      if [ -n "$cmd" ]; then
        handle_existing_statusline "$cmd"
      else
        say "A statusLine is set but has no command this script understands, so it stays untouched."
        say "Add the chips yourself with:"
        say ""
        emit_chips_block
      fi
      ;;
    INVALID)
      warn "$SETTINGS is not valid JSON, so nothing was written to it."
      warn "Fix the file and run this again, or wire the status line by hand."
      ;;
  esac

  # Self-check, because this failure is otherwise silent: git status stays clean either way.
  if [ -e "$SETTINGS" ] && [ ! -L "$SETTINGS" ] && [ "$WAS_SYMLINK" = "1" ]; then
    warn "A symlinked settings.json came out of this as a regular file. That is a bug, report it."
  fi
fi

# ---------------------------------------------------------------- 4. bare command aliases

emit_alias_style() {
  cat <<'EOF'
---
description: Set the style slot for this conversation.
argument-hint: "[<name>|auto|off]"
---

Shorthand for `/mode:style`. A UserPromptSubmit hook has already read this message and set the
style slot, so do not run `mode style set` over it.

Say in one line which style is active now and what changes because of it.
EOF
}

emit_alias_approve() {
  cat <<'EOF'
---
description: Record approval for a named plan or spec.
argument-hint: "<slug>"
disable-model-invocation: true
---

Shorthand for `/mode:approve`. A UserPromptSubmit hook has already recorded the approval against
the slug, scoped to whichever mode is active, so do not run `mode approve` over it.

Say what the approval unblocks.
EOF
}

write_alias() {
  target=$USER_COMMANDS/$1.md
  if [ -e "$target" ]; then
    say "Left alone, a file already exists: $target"
    return 0
  fi
  mkdir -p "$USER_COMMANDS"
  "emit_alias_$1" > "$target"
  say "Created: $target"
  touched "$target: lets you type /$1 instead of /mode:$1"
}

step "4. Short names for the two commands"

say "Plugin commands are namespaced, so out of the box they are /mode:style and /mode:approve."
say "Two small files in your own commands directory let you type /style and /approve instead."

if [ "$WRITE_ALIASES" -eq 1 ]; then
  write_alias style
  write_alias approve
elif [ "$SKIP_ALIASES" -eq 1 ]; then
  say "Skipped, because --no-aliases was given."
elif ask_yes_no "Create them?"; then
  write_alias style
  write_alias approve
else
  say "Skipped. The namespaced /mode:style and /mode:approve work either way."
  say "Re-run with --aliases to add them later."
fi

# ---------------------------------------------------------------- what you have now

step "Done. What you have now:"

if [ -x "$MODE_BIN" ]; then
  catalogue=$("$MODE_BIN" list 2>/dev/null || true)
  if [ -n "$catalogue" ]; then
    say ""
    printf '%s\n' "$catalogue" | sed 's/^/  /'
  fi
fi

say ""
say "A mode changes how the work is done. A style changes how Claude talks. The two slots are"
say "set independently, and neither outlives the conversation."
say "Type /mode or /mode:style to pick one, or just ask for it by name."

say ""
say "Paths this touched:"
if [ -n "$TOUCHED" ]; then
  printf '%s\n' "$TOUCHED" | sed 's/^/  /'
else
  say "  nothing, everything was already in place"
fi

say ""
say "Restart Claude Code, or start a new conversation, for the status line to pick this up."
