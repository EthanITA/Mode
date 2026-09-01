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
This script sets up what the plugin cannot do for itself: the bare commands, the status line,
and a directory for contracts you write yourself.

Usage: ./install.sh [options]

  --name NAME        Accepted for compatibility and ignored: contracts say "the user", and
                     Claude already knows who it is talking to.
  --config-dir DIR   Claude config directory. Defaults to CLAUDE_CONFIG_DIR, then ~/.claude.
  --insert-chips     If a status line already exists, append the chips block to its script.
                     Off by default, because that file is yours and not the installer's.
  --no-status-line   Skip the status line entirely.
  --aliases          Write /mode, /style, /approve and /why into your commands directory. This is
                     the default: the plugin cannot register an un-namespaced command, so without
                     these four files the bare commands do not exist at all.
  --no-aliases       Skip them.
  --force            Overwrite a status line script this installer wrote that has since changed.
  --yes              Do not ask anything. Never implies --insert-chips.
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
# Printed here so a re-run after an update shows at a glance which copy was just wired up.
if [ -x "$MODE_BIN" ]; then
  VERSION=$("$MODE_BIN" version 2>/dev/null) || VERSION=""
  [ -n "$VERSION" ] && say "  version       $VERSION"
fi

# ---------------------------------------------------------------- sanity

[ -x "$MODE_BIN" ] || die "No executable at $MODE_BIN. Run this script from inside the plugin directory."
if [ -n "$NAME" ]; then
  say "Note: --name is no longer needed. Contracts say \"the user\", and Claude already knows who that is."
fi

# ---------------------------------------------------------------- 1. your own contracts

step "1. A place for contracts you write yourself"

for sub in modes styles rules design-systems; do
  target=$USER_CONTRACTS/$sub
  if [ -d "$target" ]; then
    say "Already there: $target"
  else
    mkdir -p "$target"
    say "Created: $target"
    touched "$target: your own contracts, layered over the ones the plugin ships"
  fi
done

say "Anything you drop in there wins over a plugin file of the same name, and survives a plugin"
say "update. A contract needs front matter with name, summary, color and enter-when; a rules file"
say "needs only name and summary, and an empty body silences the shipped rule of the same name."

# ---------------------------------------------------------------- 2. the status line

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
  IFS= read -r root < "\$pointer" || root=""
  root=\${root%\$'\r'}
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

step "2. The status line"

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

# ---------------------------------------------------------------- 3. bare command aliases

# Greppable ownership mark, so a re-run can refresh a file it wrote and must leave yours alone.
ALIAS_MARKER="mode-plugin:alias"

emit_alias_mode() {
  cat <<EOF
---
description: Set the mode for this conversation, or list what exists.
argument-hint: "[mode] [style] | auto | off"
disable-model-invocation: true
---

<!-- $ALIAS_MARKER -->
A UserPromptSubmit hook has already read this message and performed any switch it names, so never
run \`mode mode set\` or \`mode style set\` over it.

- A name was given: the slot is set and its contract is in your context. Confirm in one line what
  is active and what changes. Two names fill both axes in either order, and the first name given
  for an axis wins.
- No name: run \`$MODE_BIN list\` and show what exists and what is held.
- \`auto\`: say the slot now chooses per message, and name what it holds right now.
- \`off\`: confirm which slot is empty. The other one is untouched.
- An unknown name: nothing switched, so show the real names rather than guessing.
EOF
}

emit_alias_style() {
  cat <<EOF
---
description: Set the style slot for this conversation.
argument-hint: "<style> [mode] | auto | off"
disable-model-invocation: true
---

<!-- $ALIAS_MARKER -->
A UserPromptSubmit hook has already read this message and performed the switch, so do not run
\`mode style set\` over it.

A name goes to whichever axis owns it, so this is not limited to the style slot. \`/style tdd\`
fills the mode slot, and \`/style tdd native\` fills both, the first name per axis winning.
Only \`auto\` and \`off\` stay tied to this command. Read what is in your context rather than
assuming a style was set.

Say in one line what is active now and what changes because of it.
EOF
}

emit_alias_approve() {
  cat <<EOF
---
description: Record approval for a named plan or spec.
argument-hint: "<slug>"
disable-model-invocation: true
---

<!-- $ALIAS_MARKER -->
A UserPromptSubmit hook has already recorded the approval against the slug, scoped to whichever
mode is active, so do not run \`mode approve\` over it.

Say what the approval unblocks.
EOF
}

emit_alias_why() {
  cat <<EOF
---
description: Show what is steering this conversation: slots, pipeline, gates and ground rules.
argument-hint: ""
disable-model-invocation: true
---

<!-- $ALIAS_MARKER -->
A UserPromptSubmit hook answers this one before the turn starts, so the report is already above and
there is nothing left to run.

If it is not there, the hook could not reach the tool. Run \`$MODE_BIN why\` and show what it prints.
EOF
}

# Takes its description as an argument: a hyphenated name cannot be a shell function.
write_skill_alias() {
  name=$1
  target=$USER_COMMANDS/$name.md
  mkdir -p "$USER_COMMANDS"
  if [ -e "$target" ] && ! grep -q "$ALIAS_MARKER" "$target" 2>/dev/null; then
    say "Left alone, a file this installer did not write: $target"
    return 0
  fi
  cat > "$target" <<EOF
---
description: $2
argument-hint: "[what to work on]"
---

<!-- $ALIAS_MARKER -->
Use the \`mode:$name\` skill, which ships with the mode plugin, and follow it for this request.

\$ARGUMENTS
EOF
  say "Wrote: $target"
  touched "$target: the bare /$name command"
}

write_alias() {
  target=$USER_COMMANDS/$1.md
  mkdir -p "$USER_COMMANDS"
  if [ -e "$target" ] && ! grep -q "$ALIAS_MARKER\|Shorthand for \`/mode:" "$target" 2>/dev/null; then
    say "Left alone, a file this installer did not write: $target"
    return 0
  fi
  if [ -e "$target" ] && "emit_alias_$1" | diff -q - "$target" >/dev/null 2>&1; then
    say "Already there: $target"
    return 0
  fi
  "emit_alias_$1" > "$target"
  say "Wrote: $target"
  touched "$target: the bare /$1 command"
}

step "3. The bare commands: /mode, /style, /approve and /why"

say "A plugin cannot register an un-namespaced command, so these four live as small files in"
say "your own commands directory. Without them the bare names do not exist."

if [ "$SKIP_ALIASES" -eq 1 ]; then
  say "Skipped, because --no-aliases was given. /mode, /style, /approve and /why will not resolve."
else
  write_alias mode
  write_alias style
  write_alias approve
  write_alias why
  write_skill_alias create-artifact "Build a visual artifact in a named design system."
  write_skill_alias edge-induction "Generate an edge-case checklist by inducting on the problem's structure."
  write_skill_alias design "Guidance on UI polish, component design and animation decisions."
  write_skill_alias showpiece-prompt "Author a one-shot generative prompt using the six-slot anatomy."
fi

# ---------------------------------------------------------------- 4. the per-contract shortcuts

step "4. The per-contract shortcuts"

say "mode sync writes one palette entry per contract: /mode:<name> for a mode inside the plugin,"
say "and style:<name>.md in your commands directory, so a style arrives bare as /style:<name>."

if "$MODE_BIN" sync 2>&1; then
  say "Synced."
else
  warn "mode sync failed, so the per-contract shortcuts may be stale. Run it by hand."
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
say "Type /mode or /style to pick one, or just ask for it by name."

say ""
say "Paths this touched:"
if [ -n "$TOUCHED" ]; then
  printf '%s\n' "$TOUCHED" | sed 's/^/  /'
else
  say "  nothing, everything was already in place"
fi

say ""
say "To update later, see Updating in README.md. Which commands you need depends on whether you"
say "installed through a marketplace or as a skills directory, and \`claude plugin list\` says which."
say "\`$MODE_BIN version\` prints what this copy is, to check an update landed."

say ""
say "Restart Claude Code, or start a new conversation, for the status line to pick this up."
