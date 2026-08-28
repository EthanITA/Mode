# mode

**Two slots for a Claude Code session. One holds a way of working, the other holds a way of talking.**

Sessions drift. You say "be brief" on Monday and by Thursday you are reading three paragraphs again. You agree a careful procedure at the top of a conversation and forty turns later nobody is following it. The usual fix is to repeat yourself, which works until you forget.

This plugin makes the contract hold with a hook instead of with Claude's goodwill. Both slots show in your status line, so you can always see what is running:

<p align="center">
  <img src="assets/statusline.svg" alt="A status line with one chip per axis: the mode chip holding ~debug, the style chip holding ship. A second row shows both slots reading off." width="560">
</p>

New here? The [visual guide](GUIDE.md) explains how it works and how to write your own contracts.

---

## Install

You need `python3` and `jq` on your path. The installer checks both and tells you which is missing rather than failing halfway.

There are two routes, and the one you pick decides how you update later.

### Route one: a marketplace plugin

The normal route. Take this if you just want it installed.

```bash
git clone <this-repo> ~/src/mode
cd ~/src/mode
./install.sh
```

Then register it with Claude Code, pointing the marketplace at that same clone so only one copy exists on disk:

```text
/plugin marketplace add ~/src/mode
/plugin install mode@mode
```

Restart Claude Code, or open a new conversation.

> [!NOTE]
> Claude Code copies the plugin into its own cache, into a directory named after the version. Your clone is the marketplace *source*; the copy that actually runs lives elsewhere. That distinction is invisible until you try to update.

### Route two: a skills directory

Claude Code loads any directory under `~/.claude/skills/` as a plugin, hooks and commands included. Point that name at your clone and there is no cache copy at all:

```bash
git clone <this-repo> ~/src/mode
ln -s ~/src/mode ~/.claude/skills/mode
cd ~/src/mode
./install.sh
```

Take this route if you plan to write your own contracts or change the plugin, because an edit is live in the next session with nothing to reinstall. The cost is that keeping the clone current is now your job.

Either way, `claude plugin list` tells you which one you ended up with.

### What the installer does

Three things, none of which a plugin can do for itself. It never asks your name: contracts say "the user", and Claude already knows who it is talking to.

| It does | Because |
|---|---|
| Writes `/mode`, `/style` and `/approve` into your commands directory | A plugin cannot register an un-namespaced command, so without these files those names do not resolve at all |
| Creates `~/.claude/mode/{modes,styles,rules}/` | Somewhere for contracts you write yourself that a plugin update never overwrites |
| Wires the status line | `statusLine` is a key in your `settings.json`, and no plugin can set it |

It then runs `mode sync`, which adds one palette entry per contract.

On the status line it emits and does not own. `bin/mode chips` prints one entry per axis and your existing line embeds that output, so nothing you already render gets wiped:

| What you have | What it does |
|---|---|
| No status line | Writes a small one whose only job is to print the chips |
| A status line already | Never overwrites it. Shows the block to add, offers to append, shows the diff first |
| A settings file that is a symlink | Resolves it and writes through it, so it stays a symlink |

> [!WARNING]
> That last row is not hypothetical. Claude Code replaces `settings.json` with a regular file whenever it writes a setting, and if yours is a symlink into a dotfiles repo, the repo copy quietly stops being the live one with nothing to tell you. The installer takes a timestamped backup first and prints every path it touched.

Run it twice and the second run reports what is already in place and changes nothing. `./install.sh --help` lists the flags, including `--no-status-line` and `--no-aliases`.

---

## Updating

Find out where you are first. These two answer different questions:

```bash
claude plugin list          # the version Claude Code loads, and by which route
./bin/mode version          # the version of the clone you are standing in
```

> [!TIP]
> When those two disagree, the update has not landed. That is the most useful check on this page, because every failure below shows up as exactly that disagreement.

**Marketplace route** takes two commands, because the marketplace and the plugin are separate things. If the source is a local clone, `git pull` in it first, or the update re-reads the same commit and truthfully reports that nothing changed.

```bash
claude plugin marketplace update mode
claude plugin update mode@mode
```

**Skills-directory route** is just `cd ~/src/mode && git pull`. There is no second copy to bring into line.

> [!IMPORTANT]
> Either way, restart. Hooks and commands are read once when a session starts, so a running session keeps the old copy until it ends.

An update never touches contracts you wrote yourself, because they live in `~/.claude/mode/` outside the plugin. Anything you edited *inside* the plugin directory is a different story: the cache copy stops being used, or `git pull` conflicts with it.

---

## Using it

```text
/mode              # list what exists, and say what is held
/mode debug        # hold debug
/mode off          # empty the mode slot

/style             # the same three, for the style slot
/style edu
/style off
```

Every contract also has its own palette entry, so you can type `/mode:` or `/style:` and pick from the list rather than recalling names. Both spellings do the identical thing.

**A bare name goes to whichever axis owns it**, so you do not have to remember which is which: `/mode maintainer` fills the *style* slot, because `maintainer` is a style. You can set both at once, in either order, and two commands in one message both land:

```text
/mode tdd maintainer     # a mode and a style in one go
/mode:debug /style:edu   # the same thing, as two shortcuts
```

The slots are independent. Setting one never touches the other, and `off` on one leaves the other exactly as it was.

Both also accept `auto`, which lets a contract be picked from what you write. A contract you set by hand is never overridden, a message matching two contracts picks neither, and anything chosen for you is marked with a leading tilde in the status line, so `~debug` means the chooser filled the slot and plain `debug` means you typed it.

### The modes

A **mode** is how the work runs: steps, gates, and a point where you can say it finished.

| Mode | Reach for it when | It ends |
|---|---|---|
| `ic` | **The default.** Any ask, one pair of hands, you in the room. Borrows each specialist's discipline without the ceremony. | you say so |
| `copilot` | The work splits into several independent domains and you want a team to build it while you watch | you say so |
| `swarm` | The same team without the spec. A standing roster of owners, each holding one domain, and every ask routed to whoever owns it | you say so |
| `autopilot` | You want a result and you are walking away. Every decision is Claude's, one report waits. Typed only, never auto-chosen. | the MR opens |
| `debug` | Something is broken and nobody knows where. Instrument, reproduce, fix the cause, explain why. | you approve the explainer |
| `tdd` | You want the test to exist before the code, failing for the right reason | you say so |
| `prove` | You do not trust that a change works, and want it run before and after through something that can disagree | you say so |
| `tester` | A feature somebody else built needs sweeping, and you want a verdict rather than a fix | you say so |
| `studio` | You are thinking something through and want the ideas on a page that grows as you talk | you say so |

### The styles

A **style** is how Claude sounds while any of that runs. It has no steps of its own.

| Style | Reach for it when |
|---|---|
| `edu` | You want to understand, not just be updated. Top down, plain words, carried by pictures |
| `fast` | You are in a hurry. It gets made to work and nothing gets polished |
| `ship` | It is going out, so it has to be maintainable: readable, named, grouped by domain |
| `maintainer` | Other people depend on this. Tests, docs and the changelog move with the code |
| `native` | Somebody else's codebase. Match the local idiom and add none of your own |
| `creative` | The safe first answer is not good enough. Go wide, several real options, boldness spent in one place |
| `xyz` | You write short and expect the rest inferred. Every reply opens with the read |

### Picking a pair

Most combinations just work. Three are worth knowing:

- `tdd` with `fast` contradicts itself, since one wants a failing test before every line and the other wants tests skipped.
- `studio` with `ship` fights too, because studio deliberately ships nothing.
- `debug` with `fast` picks the workaround over the durable fix, which is what you want while production is burning. `debug` with `ship` picks the other half of that fork.

---

## Writing your own

One markdown file in `~/.claude/mode/modes/` or `~/.claude/mode/styles/`. It is live as soon as you save it.

```markdown
---
name: recon
summary: A codebase you have not seen. Build the map before touching anything.
color: cyan
enter-when: new repo|unfamiliar|where do I start
exit-when: manual
---

# Recon mode

The full contract, at whatever length it needs. Read once, at the switch.

## Standing reminder

- Read before writing. Entry points, data flow, conventions, the test command.
- Report the map, then propose.
- No edits in the first pass.
```

| Key | Meaning |
|---|---|
| `name` | Must equal the filename without its extension |
| `summary` | One line, under 80 characters. It is what the listing prints and the chip shows |
| `color` | One of red, green, yellow, blue, magenta, cyan, grey, sky, pink |
| `enter-when` | Alternatives split on a vertical bar, matched at a word boundary. Only consulted while the slot holds `auto` |
| `exit-when` | `manual`, `approved`, or `mr-opened` |

The four-line cap on `## Standing reminder` is real: it is the only part that repeats, on every prompt, for as long as the slot is held. A file of yours named the same as a shipped contract wins.

There is a third kind of file too, `~/.claude/mode/rules/`, holding **ground rules** that are always on and injected once per conversation rather than switched. The [guide](GUIDE.md#ground-rules-the-third-kind-of-file) covers those.

---

## Limitations

Every item here is a real thing this release does not do.

**Nothing persists across conversations.** Both slots are keyed to the conversation and die with it. There is no project default and no way to say "always use `maintainer` in this repo". That is a design choice for now, because a contract that outlives the work it was set for is worse than no contract.

**Only one mode enforces anything.** `copilot` has a real gate: a hook refuses to spawn a teammate until you have approved a spec. That is the entirety of the enforcement. `tdd` is the clearest gap, since the rule it wants would refuse an edit to an implementation file while no failing test is on record. Take every other mode as a written agreement Claude is reminded of every turn, which is useful and is not the same as a guarantee.

**The one gate that exists checks that you approved, not that there was anything to approve.** Typing `/approve` followed by any word at all opens it. Read it as "a person deliberately typed a yes", not as "the spec was written and reviewed".

**The deliverable is routed but not pinnable.** A ground rule names the form and routes it, but there is no slot holding it for a session.

**`auto` matches plain substrings at a word boundary.** It is deliberately simple and will sometimes pick wrong. Leave the slots on manual and type the name if that bothers you.

---

## Licence

MIT, in `LICENSE`. This is a small tool made of markdown contracts and one script, and the point is that people copy it, cut it down, and paste their own contracts in.
