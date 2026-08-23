# mode

**Two slots for a Claude Code session. One holds a way of working, the other holds a way of talking.**

Claude Code sessions drift. You say "be brief" on Monday and by Thursday you are reading three
paragraphs again. You agree a careful procedure at the top of a conversation and forty turns later
nobody is following it. The usual fix is to repeat yourself, which works until you forget.

This plugin gives a session two slots that hold, and it holds them with a hook rather than with
Claude's goodwill.

## The two axes

A **mode** is a way of working. It is a procedure: steps, gates, and a point where you can say it
finished. A mode changes what Claude does next. `debug` is one, and it goes instrument, reproduce,
fix, explain, open the merge request, in that order, refusing to skip ahead to the fix.

A **style** is how Claude talks to you. It has no steps of its own. Instead it modulates every step
of whatever mode is running. `fast` is one, and it means do the single thing and say done.

They live on separate axes because one slot cannot say what people actually want:

```
/mode tdd      # no implementation line before a test that fails for the right reason
/style fast    # and say almost nothing while doing it
```

Fold those two into a single setting and you are made to pick, so you lose whichever mattered less
that morning. Kept apart, they compose, and the twenty five combinations are all just things you can
ask for.

Here is the question set that decides which axis something belongs on. It is worth reading before
you write a contract of your own, because most ideas sort themselves in about ten seconds.

| Ask | A mode answers | A style answers |
|---|---|---|
| Does it have steps and gates? | Yes. A procedure with a beginning and an end. | No. It has no steps of its own. |
| Does it enable something a prompt could not ask for? | Yes. A hook refuses something, or a chain of skills runs that otherwise would not. | No. It changes the register and what gets left behind. |
| Does it have a definition of done? | Yes. You can say when it finished. | No. It is held until you drop it. |
| What does it change? | What Claude does next. | How Claude talks to you. |

The second row does most of the sorting. "Write tests first" is an instruction you could type; `tdd`
earns a mode because it is a procedure with a gate in it. "Document as you go" changes what every
other procedure leaves behind, which is why it is the `maintainer` style rather than a `docs` mode.

## How it holds

Worth understanding before you install anything, because it explains the shape of everything else.

A `UserPromptSubmit` hook runs before Claude reads your message. It does two jobs in that moment.
First it performs the switch, so by the time Claude sees anything the slot is already set. Then it
injects a short standing reminder from each held contract into the prompt itself.

So Claude is never remembering which mode it is in. Every single turn, it gets told again.

That is also why a standing reminder is capped at four lines. Two slots can be held at once, giving
eight lines injected per turn, and that is roughly the ceiling before a standing block reads as
background noise and stops being seen at all. A contract can run to any length in its body. Only the
block that repeats is rationed.

## Install

You need `python3` and `jq` on your path. The installer checks for both and tells you which is
missing rather than failing somewhere in the middle.

Clone the repository somewhere it can stay, because the status line will end up pointing at this
copy:

```bash
git clone <this-repo> ~/src/mode
cd ~/src/mode
./install.sh
```

Then register it with Claude Code, using that same clone as the marketplace source so there is only
ever one copy on disk:

```
/plugin marketplace add ~/src/mode
/plugin install mode@mode
```

Restart Claude Code, or open a new conversation, and the status line picks it up.

### What the installer does, and why it is a separate step

Four things, and not one of them is something a plugin can do for itself.

**It asks your name.** The contracts refer to you through a `{{USER}}` placeholder, substituted at
injection time. This matters more than it looks. A line like "the user speaks only to you, and no
teammate writes to them" is load-bearing about which direction the rule runs, and the standing block
is read by the model rather than by you. Get the voice wrong and the sentence states the opposite
rule.

**It creates `~/.claude/mode/modes/` and `~/.claude/mode/styles/`** for contracts you write
yourself. More on those below.

**It wires the status line.** This is the awkward one. A status line is a single setting, so a
plugin that installed its own would silently wipe whatever you already had. So this plugin emits and
does not own. Running `mode chips` prints the two coloured chips and nothing else, and your existing
line calls it.

| What you have | What the installer does |
|---|---|
| No status line at all | Writes a small one whose only job is to call `mode chips`. |
| A status line already | Never overwrites it. Shows you the block to add, offers to append it, and shows the diff before writing. |
| A settings file that is a symlink | Resolves it and writes through it, so the link stays a link. |

That last row is not hypothetical. Claude Code replaces `settings.json` with a regular file whenever
it writes a setting, and if yours is a symlink into a dotfiles repo, the repo copy quietly stops
being the live one with nothing to tell you. The installer takes a timestamped backup first and
prints every path it touched.

**It offers you the short command names**, so you can type `/style` and `/approve` rather than
`/mode:style` and `/mode:approve`. That is two small files in your own commands directory, and it
asks before writing either. Declining costs you nothing but the colon.

Run it twice and the second run reports what is already in place and changes nothing. `./install.sh
--help` lists the flags, including `--no-status-line` and `--no-aliases` if you would rather wire
either yourself.

If you would rather be walked through it, ask Claude to set up the mode plugin once it is installed.
That loads the plugin's init skill, which asks the same questions in conversation and then calls the
same script. It never edits `settings.json` itself, for the symlink reason above.

## Using it

```
/mode              # list what is available, and say what is held
/mode debug        # hold debug
/mode off          # empty the mode slot

/mode:style        # the same three, for the style slot
/mode:style fast
/mode:style off
```

**A word on that colon.** Claude Code namespaces the commands a plugin brings, so the style and
approval commands arrive as `/mode:style` and `/mode:approve`. The installer offers to drop two
small files into your own commands directory so you can type `/style` and `/approve` instead, and
the rest of this README uses those short forms. Decline the offer and the namespaced spellings keep
working. `/mode` itself needs no shorthand.

The two slots are independent. Setting one never touches the other, and `off` on one leaves the
other exactly as it was.

Both slots also accept `auto`, which lets a contract be picked from what you write. Each file
declares an `enter-when` pattern, and with the slot on `auto` a matching message selects that
contract. Three restraints keep this from being annoying. A contract you set by hand is never
overridden by a pattern. A message matching two patterns picks neither and leaves the slot alone.
And a contract picked for you is marked as such in the status line with a leading tilde, so `~debug`
tells you the chooser filled the slot while plain `debug` means you typed it.

## The contracts

Five modes:

| Mode | What it is |
|---|---|
| `copilot` | You refine the work together, then a team of agents builds it while you watch. |
| `autopilot` | You want a result and you are away. Every decision is Claude's, and one report waits for you. |
| `debug` | Find it, prove it reproduces, fix it, and draw why it happened. |
| `studio` | Think something through together on one artifact, and it grows while you talk. |
| `tdd` | No implementation line exists before a test that fails for the right reason. |

Five styles:

| Style | What it is |
|---|---|
| `edu` | Teaching. Overview first, then a simple example, carried by visuals rather than walls of prose. |
| `fast` | You are in a hurry. The one thing gets done and the answer is short. |
| `maintainer` | Other people depend on this. Tests, README, API docs and changelog move with the code. |
| `ship` | Get it out today. Tests, docs and ceremony are skipped on purpose, and the debt is named. |
| `native` | Somebody else's codebase. Match the local idiom exactly and contribute none of your own. |

One mode brings a third command with it. `copilot` will not spawn a team of agents until you have
approved the spec it wrote, and `/approve <slug>` is how you say yes:

```
/approve payments-refactor
```

That one is deliberately yours alone. It carries `disable-model-invocation: true`, so Claude cannot
run it on your behalf, which is the point of having a gate at all.

Twenty five pairs are possible and most of them compose without comment. A few are worth knowing
about. Holding `tdd` and `ship` together asks for a failing test before every line and also for
tests to be skipped, so there is no order of operations that satisfies both. Holding `studio` with
`ship` is similar, since studio deliberately ships nothing. On the productive side, `debug` with
`ship` picks the workaround over the durable fix, which is what you want while production is
burning, and `debug` with `maintainer` picks the other half of that same fork.

## Writing your own

One markdown file, dropped in `~/.claude/mode/modes/` or `~/.claude/mode/styles/`. It is live as
soon as you save it, because the tool reads the folder rather than a registry you have to keep in
step.

```markdown
---
name: recon
summary: A codebase you have not seen. Build the map before touching anything.
color: cyan
enter-when: new repo|unfamiliar|where do I start
exit-when: manual
---

# Recon mode

The full contract, at whatever length it needs. This is read once, at the moment of
the switch, so there is room here to be properly explicit.

## Standing reminder

- Read before writing. Entry points, data flow, conventions, the test command.
- Report the map, then propose.
- No edits in the first pass.
```

The keys:

| Key | Meaning |
|---|---|
| `name` | Must equal the filename without its extension. |
| `summary` | One line, and keep it under 80 characters. It is what the listing prints and what the status line chip shows, so a long one wraps the line. |
| `color` | One of red, green, yellow, blue, magenta, cyan, grey. |
| `enter-when` | Alternatives split on a vertical bar, matched at a word boundary. Only consulted while the slot holds `auto`. |
| `enter-never` | Set to a literal `true` to make a contract typed-only, never picked for you. |
| `exit-when` | `manual`, `approved`, or `mr-opened`. Leave it out and the contract behaves as `manual`. |

Two details save you a debugging session. Anything other than a literal `true` counts as false, so a
half-written key never quietly turns a rule on. And an unknown key is ignored rather than being an
error, which is what lets a file written for a later version still load here.

**The four-line cap on `## Standing reminder` is real.** It is the only part of your file that
repeats, and it repeats on every prompt for as long as the slot is held. Write each line as a rule
that binds in the moment, and write it in the voice the model reads it in rather than the voice you
would say it in. Prose about your philosophy belongs in the body, where it is read once and costs
nothing thereafter.

### Where your own contracts live

In `~/.claude/mode/modes/` and `~/.claude/mode/styles/`, both created for you by the installer. If
you set `CLAUDE_CONFIG_DIR`, they follow it. That directory layers over the contracts the plugin
ships, so your files survive an update, and one of yours named the same as a shipped contract wins.
Anything you write inside the plugin directory itself is lost the next time you update.

## Limitations

Read this part. Every item here is a real thing the release does not do.

**Nothing persists across conversations.** Both slots are keyed to the conversation and both die
with it. Start a new session and you start with empty slots. There is no project default, no global
default, and no way to say "always use `maintainer` in this repo". This is the limitation people
notice first, and it is a design choice for the first release rather than an oversight, because a
contract that outlives the work it was set for is worse than no contract.

**Only one mode enforces anything.** `copilot` has a real gate: a `PreToolUse` hook refuses to spawn
a teammate until you have approved a spec. That is the entirety of the enforcement in this release.
`tdd` is the clearest gap, since the rule it wants would refuse an edit to an implementation file
while no failing test is on record, and that hook is designed but not built. So `tdd` here is a
discipline and not a fence. Two contracts also carry a `no-implement` flag that no shipped hook
reads. Take every mode except `copilot` as a written agreement that Claude is reminded of on every
turn, which is genuinely useful and is not the same thing as a guarantee.

**The one gate that exists checks that you approved, not that there was anything to approve.**
`copilot` refuses to spawn a team until an approval is on record, and that part works. What it never
checks is whether the slug you approved names a spec that was actually written. Typing `/approve`
followed by any word at all opens it. The stronger version would confirm the artifact exists and was
put in front of you, and it leaned on a personal tool that does not ship here. So read this gate as
"a person deliberately typed a yes", which is a genuine speed bump in front of a model dispatching
on its own initiative. Do not read it as "the spec was written and reviewed".

**The rule library is designed and not built.** The idea is that each enforcement is a named rule
with a hook behind it, and a contract declares the ones it needs with a `requires:` line. That would
let a contract you write turn on real enforcement rather than only asking politely. What exists
today is one hardcoded flag read by one hook, so the rule has no name and there is no way to ask for
it from a file of your own. This is the largest gap between what the system is and what it should
be.

**Only some pairs have been reasoned about.** Twenty five combinations exist and the contradictory
ones are documented above rather than refused. Nothing stops you holding `tdd` and `ship` together.
You will get incoherent behaviour and no warning.

**The `auto` slot matches on plain substrings at a word boundary.** It is deliberately simple and it
will sometimes pick wrong. If that bothers you, leave the slots on manual and type the name.

## Licence

MIT, in `LICENSE`. This is a small tool made of markdown contracts and one script, and the point is
that people copy it, cut it down, and paste their own contracts into it. MIT puts nothing in the way
of that beyond keeping the notice.
