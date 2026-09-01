---
name: init
description: Set up or update the mode plugin on this machine. Offers to wire the status line, writes the bare commands, and creates a directory for contracts they write themselves. Load when someone types /init for this plugin, asks to install, set up, update or upgrade mode, or asks which version of it they are running.
user-invocable: true
disable-model-invocation: false
---

# Installing mode

A session holds one **mode**, a way of working, and one **style**, how Claude talks. Two independent slots, both keyed to the conversation, both gone when it ends.

Three things a plugin cannot do for itself, which is the whole reason this walkthrough exists:

| What | Why it needs a person |
|---|---|
| The status line | `statusLine` is a key in the user's `settings.json`. No plugin can set it. |
| The user contracts directory | Somewhere under the Claude config dir that a plugin update never overwrites, so a contract someone wrote themselves survives. |
| The bare command names | Plugin commands are namespaced, so a plugin cannot register `/mode`, `/style` or `/approve` at all. Three small files in the user's own commands directory carry them, and `mode sync` puts the per-style shortcuts (`style:<name>.md`) beside them for the same reason. |

## The one rule that outranks the rest

**Never edit `settings.json` with `Write` or `Edit`. Shell out to `install.sh` instead.**

That file is very often a symlink into a dotfiles repo. A write that creates a temp file and renames it over the top replaces the link with a regular file, the repo copy quietly stops being the live one, and `git status` stays clean so nothing ever surfaces the drift. Claude Code has done exactly this. `install.sh` resolves the link and truncates in place, which is the only safe way, and it is tested against a symlinked fixture.

So this skill holds the conversation and `install.sh` does the writing. Do not reimplement it.

## Ask one thing at most

Everything else is answerable from the filesystem. Answer it there.

**The status line, and only if they already have one.** Covered below. Nobody's name is needed: contracts say "the user", and Claude already knows who it is talking to.

Do not ask about the contracts directory, the config location, or whether they want the plugin installed. They ran the skill.

The short command names are a second question, but a cheap one, so fold it into the closing rather than asking up front. Details below.

## Run it

Check first, so a missing tool is a sentence rather than a half-finished install:

```
command -v python3 jq
```

`python3` rewrites `settings.json` without disturbing the other keys. `jq` reads the session id out of the JSON that Claude Code pipes into a status line. If either is missing, say which and stop. On macOS, `jq` comes from `brew install jq`.

Then, from the plugin root:

```
./install.sh --yes
```

`--yes` means it never blocks on a prompt, which matters because you are running it, not them. It also never touches an existing status line on its own, which is the behaviour you want.

## The status line

`bin/mode chips` prints one entry per axis with its colour, `off` in an empty slot. That is all the plugin provides. **The plugin emits, it does not own the line.**

That restraint is the point. A real status line already carries other things: a task board, rate limit bars, a context gauge. An installer that writes its own line wipes all of it.

`install.sh` reports which case it found. React to it:

| What it found | What it did | What you do |
|---|---|---|
| No `statusLine` key | Wrote a small script that calls `mode chips`, and pointed `statusLine` at it | Say where the script is, and that they can add their own segments to it |
| A `statusLine` already set | Nothing. Printed the block to add and where it goes | Show them the block, then ask |
| Settings file is a symlink | Resolved it and wrote through it, so it is still a symlink | Mention it once, then move on |

In both cases it writes `chips.sh` into the user's own config directory, and that file is what finds the plugin. It re-resolves the install path on every render rather than baking in today's one, trying three sources in order: the pointer file a `SessionStart` hook writes, then `plugins/installed_plugins.json`, then the clone the installer itself ran from. That order matters because the three install routes populate different sources. A marketplace install lands in a cache directory named after the version, so the path genuinely changes on every update. A skills-directory install never appears in `installed_plugins.json` at all, and is found by the pointer or the fallback. A status line pointing straight at one of those paths would work at install and then go quiet later, with no error anywhere to explain it. Worth one sentence to them, since it otherwise looks like a bug much later.

When a status line already exists, show the block `install.sh` printed and ask with `AskUserQuestion`, giving them a real choice:

- **Append it for me.** Re-run with `--insert-chips`. It backs the file up first and shows a diff before writing. It only appends to a shell script; a `node …` or `python …` status line is left alone, because the first file on that command is the interpreter.
- **I will do it myself.** Leave the block on screen. Nothing gets written.

Never append to someone's status line script without asking. It is their file, and the plugin is a guest in it.

## The bare command names

The installer writes `mode.md`, `style.md` and `approve.md` into the user's own commands directory by default, because a plugin cannot register an un-namespaced command and without these files `/mode`, `/style` and `/approve` do not resolve at all. The stubs exist only so Claude Code accepts the command, because an unknown slash command is rejected before any hook runs. The hook then does the real work by reading the raw prompt text. It then runs `mode sync`, which puts one `style:<name>.md` per style beside them, so the palette offers `/style:edu` and friends.

The installer refreshes only files it wrote (they carry a marker) and refuses to touch a `/style` someone already had. `approve.md` carries `disable-model-invocation: true`, which is what keeps approving a human act rather than something you can do for yourself.

## Updating an install that already exists

If they came here to update rather than to install, the first job is working out which route they
took, because the two have nothing in common. Do not guess it, read it:

```
claude plugin list
```

A row reading `mode@skills-dir` with a `Path` means Claude Code is reading a directory directly.
Updating is a `git pull` in that directory and a restart. There is no `claude plugin update` to
run, and running one does nothing useful, because this route is not in `installed_plugins.json`.

Any other row means a marketplace install, and the plugin that runs is a copy in a version-named
cache directory rather than the clone they made. That takes two commands, since the marketplace and
the plugin are separate things:

```
claude plugin marketplace update mode
claude plugin update mode@mode
```

When the marketplace source is a local clone, `git pull` in it first, or the marketplace update
re-reads the same commit and truthfully reports that nothing changed.

Either way it needs a restart, which is worth saying plainly rather than leaving in a footnote:
hooks and commands are read once when a session starts, so the session they are talking to you in
keeps the old copy until it ends.

Then confirm it landed. These answer different questions and disagreeing is the whole signal:

```
claude plugin list          # what Claude Code loads
<plugin root>/bin/mode version   # what the clone on disk says
```

Nothing they need doing by hand survives an update. Contracts they wrote live in `~/.claude/mode/`
and sit outside the plugin.
`CHANGELOG.md` in the plugin root says what changed.

## Close by showing what they have

Read it from the tool rather than reciting it from here, because the catalogue changes and this file will not. One call prints both lists:

```
bin/mode list
```

Then show what they can type:

- `/mode` to see the modes and pick one, `/mode <name>` to set it directly, `/mode off` to drop it.
- `/style` for the style slot, and the palette shortcuts `/mode:<mode>` and `/style:<style>` per contract.

Say plainly that the two slots are independent, that asking for a mode by name in ordinary conversation works too, and that neither slot outlives the conversation.

Finish with the one thing that is not obvious: the status line only picks this up on a new conversation, so they should restart Claude Code or start a fresh session to see the chips.
