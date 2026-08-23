---
name: init
description: Set up the mode plugin on this machine. Writes the installer's name into the identity config, offers to wire the status line, and creates a directory for contracts they write themselves. Load when someone types /init for this plugin, asks to install or set up mode, or when a mode command reports that no identity config exists yet.
user-invocable: true
disable-model-invocation: false
---

# Installing mode

A session holds one **mode**, a way of working, and one **style**, how Claude talks. Two independent slots, both keyed to the conversation, both gone when it ends.

Three things a plugin cannot do for itself, which is the whole reason this skill exists:

| What | Why it needs a person |
|---|---|
| The identity config | Contracts ship with a literal `{{USER}}` placeholder so no name is baked in. The tool substitutes it at injection time, and something has to write the name down first. |
| The status line | `statusLine` is a key in the user's `settings.json`. No plugin can set it. |
| The user contracts directory | Somewhere under the Claude config dir that a plugin update never overwrites, so a contract someone wrote themselves survives. |
| Short command names | Plugin commands are namespaced. `/mode` works bare because the file is named after the plugin, but style and approve arrive as `/mode:style` and `/mode:approve`. Two small files in the user's own commands directory give them the short forms. |

## The one rule that outranks the rest

**Never edit `settings.json` with `Write` or `Edit`. Shell out to `install.sh` instead.**

That file is very often a symlink into a dotfiles repo. A write that creates a temp file and renames it over the top replaces the link with a regular file, the repo copy quietly stops being the live one, and `git status` stays clean so nothing ever surfaces the drift. Claude Code has done exactly this. `install.sh` resolves the link and truncates in place, which is the only safe way, and it is tested against a symlinked fixture.

So this skill holds the conversation and `install.sh` does the writing. Do not reimplement it.

## Ask two things at most

Everything else is answerable from the filesystem. Answer it there.

**One: their name.** Do not open with a blank question. Look first, propose, and let them correct:

```
git config user.name
```

Then ask once, in the shape of a confirmation: "Contracts will call you Marco Dong. Good, or something else?" If git gives nothing, ask plainly. The name is the only thing the plugin genuinely cannot work out.

**Two: the status line, and only if they already have one.** Covered below.

Do not ask about the contracts directory, the config location, or whether they want the plugin installed. They ran the skill.

The short command names are a third question, but a cheap one, so fold it into the closing rather than asking up front. Details below.

## Run it

Check first, so a missing tool is a sentence rather than a half-finished install:

```
command -v python3 jq
```

`python3` rewrites `settings.json` without disturbing the other keys. `jq` reads the session id out of the JSON that Claude Code pipes into a status line. If either is missing, say which and stop. On macOS, `jq` comes from `brew install jq`.

Then, from the plugin root:

```
./install.sh --name "<their name>" --yes
```

`--yes` means it never blocks on a prompt, which matters because you are running it, not them. It also never touches an existing status line on its own, which is the behaviour you want.

## The status line

`bin/mode chips` prints both chips with their colour, and prints nothing at all when both slots are clear. That is all the plugin provides. **The plugin emits, it does not own the line.**

That restraint is the point. A real status line already carries other things: a task board, rate limit bars, a context gauge. An installer that writes its own line wipes all of it.

`install.sh` reports which case it found. React to it:

| What it found | What it did | What you do |
|---|---|---|
| No `statusLine` key | Wrote a small script that calls `mode chips`, and pointed `statusLine` at it | Say where the script is, and that they can add their own segments to it |
| A `statusLine` already set | Nothing. Printed the block to add and where it goes | Show them the block, then ask |
| Settings file is a symlink | Resolved it and wrote through it, so it is still a symlink | Mention it once, then move on |

In both cases it writes `chips.sh` into the user's own config directory, and that file is what finds the plugin. It re-resolves the install path on every render by reading `plugins/installed_plugins.json`, because a plugin lives at a hash-versioned cache path that changes on every update. A status line pointing straight at today's path would work at install and then go quiet after the first update, with no error anywhere. Worth one sentence to them, since it is the kind of thing that otherwise looks like a bug much later.

When a status line already exists, show the block `install.sh` printed and ask with `AskUserQuestion`, giving them a real choice:

- **Append it for me.** Re-run with `--insert-chips`. It backs the file up first and shows a diff before writing.
- **I will do it myself.** Leave the block on screen. Nothing gets written.

Never append to someone's status line script without asking. It is their file, and the plugin is a guest in it.

## Offer the short command names

`install.sh --aliases` writes `style.md` and `approve.md` into the user's own commands directory, so `/style edu` and `/approve <slug>` work as typed instead of `/mode:style` and `/mode:approve`. The stubs exist only so Claude Code accepts the command, because an unknown slash command is rejected before any hook runs. The hook then does the real work by reading the raw prompt text.

Offer it, never assume it. Someone may already have a `/style` of their own, and the namespaced forms work regardless. The installer refuses to overwrite an existing file of either name and says so. `approve.md` carries `disable-model-invocation: true`, which is what keeps approving a human act rather than something you can do for yourself.

## Close by showing what they have

Read it from the tool rather than reciting it from here, because the catalogue changes and this file will not. One call prints both lists:

```
bin/mode list
```

Then show what they can type:

- `/mode` to see the modes and pick one, `/mode <name>` to set it directly, `/mode off` to drop it.
- `/mode:style` for the style slot, or `/style` if they took the aliases.

Say plainly that the two slots are independent, that asking for a mode by name in ordinary conversation works too, and that neither slot outlives the conversation.

Finish with the one thing that is not obvious: the status line only picks this up on a new conversation, so they should restart Claude Code or start a fresh session to see the chips.
