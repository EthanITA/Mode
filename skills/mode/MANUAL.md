---
name: mode
description: Hold a working mode and a speaking style for this conversation, changing how you work and how you sound on every turn until they are cleared. A mode is a procedure with gates and a definition of done; a style is a register with no steps of its own. Modes available: autopilot, copilot, debug, ic, prove, studio, tdd, tester. Styles available: creative, edu, fast, maintainer, native, ship, xyz. Load when the user types /mode or /style with or without a name, when they type /mode off or /style off, when they name any of those contracts or say "switch to X mode", and when they ask what is currently active.
user-invocable: true
disable-model-invocation: false
args: "[<name>|auto|off]"
modes: autopilot, copilot, debug, ic, prove, studio, tdd, tester
styles: creative, edu, fast, maintainer, native, ship, xyz
---

# Mode

A session carries two slots, and each one holds a contract until the user drops it. Setting either changes how you work on every turn that follows, not only on the turn that set it.

This manual drives the switching and nothing else. It is deliberately not a registered skill: a plugin skill would sit in the palette as `mode:mode`, so the palette entry for `/mode` is a user command instead and this file stays the maintainer's reference. The state lives in `${CLAUDE_PLUGIN_ROOT}/bin/mode`, keyed on the conversation. What each contract asks of you lives in its own file, under `modes/` or `styles/`.

## Two axes, and what belongs on each

| | A **mode** | A **style** |
|---|---|---|
| Answers | How the work runs | How you sound while it runs |
| Has | Steps, gates and a definition of done | No steps at all |
| Applies to | The shape of the turn | Every step of whatever mode is running |
| Example | `copilot` stops on a question before dispatching a team | `fast` makes that question two lines instead of ten |

The split is what keeps the file count down. Eight modes and seven styles cover fifty-six combinations, so a new way of talking costs one file rather than eight rewrites.

The test for which folder a new contract belongs in is whether it has an order. If it says do this, then that, and stop here, it is a mode. If it only changes the texture of whatever you were already doing, it is a style.

## The switch protocol

The switch is not yours to perform. A `UserPromptSubmit` hook reads the message and does it before you see anything, so by the time you are reading this the slot is already set and the contract is already in your context.

| The user types | The hook already did | You do |
|---|---|---|
| `/mode <name>` | Looked up which axis owns that name and set it there, then injected the whole contract into this very prompt | Follow it from here on, and say in one line what is active and what changes. Do not run the set yourself. |
| `/mode:<name>` or `/style:<name>` | The same, from the per-contract shortcut rather than an argument | The same. The two spellings are one code path, so nothing here depends on which was typed. |
| `/mode <name> <name>` | The same for both, in either order, so `/mode tdd maintainer` fills the mode and the style at once | Confirm both, and write the line in the style if one was set |
| `/style <name>` | The same on the style slot, named outright | The same, except write that line in the style you just picked, so the change shows rather than being announced |
| `/mode` or `/style`, with no name | Nothing, because there is no name to act on | Run `mode list` for both, or `mode list style` for one, and show what exists and what is held |
| `/mode auto` or `/style auto` | Set that slot to `auto`, so a contract gets chosen from what gets written | Say the slot is on auto, and name what it holds right now if it holds anything |
| `/mode off` or `/style off` | Emptied that slot, and the mode one also dropped the recorded approval | Confirm which slot is empty. The other slot is untouched. |
| `/approve <slug>` | Recorded the yes against that slug, stamped with whichever mode is active | Say what it unblocks. The record already exists, so do not run `mode approve` over it. |
| a name that does not exist | Nothing switched, because `mode <axis> set` refuses a name with no file behind it | Run `mode list` and show the real names rather than guessing which one was meant |

Every typed form is a registered command, because Claude Code rejects an unknown slash command before any hook runs. The palette holds exactly three shapes and nothing else: `mode`, `mode:<mode name>` and `style:<style name>`. The bare `/mode`, `/style` and `/approve` are files the installer writes into the user commands directory, since a plugin cannot register an un-namespaced name. Each one carries `disable-model-invocation: true`, which is what keeps them the user's alone.

Every spelling reaches the same slot, because the hook reads the raw prompt before any command resolution happens. So `/style edu`, `/style:edu` and `/mode edu` do the identical thing.

Every contract also has a command file of its own, written by `mode sync` from the folders, so the palette hints the names rather than asking anyone to recall them. A mode ships inside the plugin's `commands/` and arrives as `/mode:tdd`. A style cannot: the plugin namespace would offer it as `/mode:style:ship`, which is exactly the palette noise this layout removes, so sync writes styles into the user commands directory as `style:<name>.md` and they arrive bare, as `/style:ship`.

Read the contract once, at the moment of the switch. It runs to whatever length it needs. From then on the standing reminder carries it.

**There is one case where you write the approval record yourself, and it is not a loophole.** A mode may ask for the yes through `AskUserQuestion` instead, which is what `copilot` does at its Approval gate. No hook can see a click, so the mode that asked runs `mode approve <slug>` once approve is picked, and says that it did. That is the weaker of the two records. The slash command comes from a human message and no agent can produce one, while this one rests on your good faith. What is banned is writing an approval that was never given. Never reach for `mode approve` to unblock yourself, to retry a dispatch a gate refused, or because the gate is in your way.

## One slot each

A session holds exactly one mode and exactly one style. Setting a new one on either axis replaces what was there, so there is no stack to unwind and no question about which contract wins.

Either slot may also be empty, and empty is the normal state. A session with a style and no mode is ordinary and useful, and so is the reverse.

## The axes never read each other

This is the load-bearing rule of the whole design, and it holds in both directions.

Mechanically, the two slots are separate state, matched separately and ended separately. `/mode off` leaves the style held. A mode reaching its exit condition does not touch the style, and a style is never chosen because of what the mode slot contains.

In the writing, no mode file changes what it asks for depending on the style, and no style file changes depending on the mode. A contract that said "unless `ship` is held" would collapse the two axes back into one and take the combinations with it.

Where the two genuinely meet, one line settles it. A mode owns what must happen; a style owns how much of it gets said and how it reads. When a style would delete something a mode requires, the mode wins. **A style never opens a gate.** Being in a hurry makes copilot's approval question shorter and never makes it optional.

## Starting and stopping by condition

Typing a name is not the only way in, and typing `off` is not the only way out. Every contract on both axes declares both ends in its own front matter.

| Key | Means | Read by |
|---|---|---|
| `enter-when` | Alternatives separated by a vertical bar. One of them matching the message selects this contract, but only while that slot is set to `auto`. | The prompt hook, matching before anything else runs |
| `enter-never: true` | This contract is never chosen and has to be typed | The same hook. Only `autopilot` carries it. |
| `exit-when: approved` | A yes was recorded with `/approve` under this contract, so its job is done | The approval record, which the tool observes on its own |
| `exit-when: mr-opened` | A merge request exists for the branch this contract worked on | Nothing observes this, so the mode that opened the merge request records it with `mode mode done mr-opened` |
| `exit-when: manual` | Only `/mode off` or `/style off` ends it | Nothing. This is the plain behaviour, now stated rather than assumed. |

Matching anchors at the **start** of a word and runs free at the end. So `fail` covers fails, failed, failing and failure, while `build the` never matches "rebuild the". The missing trailing boundary is deliberate, and it is why every alternative has to be verb-shaped or phrase-shaped. A bare noun like `build` would match "the build fails on startup" and hand a broken pipeline to the mode that spawns a team.

**`auto` is a value a slot can hold, and not a contract.** There is no `modes/auto.md`, and it never appears in the registries below. With a slot on `auto`, every `enter-when` on that axis is live and the hook fills the slot when one of them matches. That is the only setting under which a contract is ever chosen rather than typed.

Three restraints hold that behaviour together, and each matters more than the matching itself:

- A contract set by hand is never overridden by a pattern.
- An ambiguous message, where two patterns on the same axis match, chooses nothing and leaves the slot as it was.
- `enter-never` beats everything, so no message ever selects `autopilot`.

A chosen contract is marked as such. The status line writes a tilde in front of the name, so `~debug` says the chooser filled the slot and plain `debug` says the name was typed. Nobody is ever held to a contract they cannot see they did not pick. When a chosen contract reaches its exit, that slot returns to `auto` rather than to empty, because a slot that emptied itself would only ever choose once.

**An approval is scoped to the mode it was given under.** Two readers consult the same record. Copilot's dispatch gate asks whether a spec was approved, and debug's exit asks whether its explainer was. Leave the record shared and approving a debug explainer would open the dispatch gate against a spec nobody saw. So the record stores the active mode beside the slug, and each reader requires its own name to match.

When a contract clears itself, say so in that turn. One that ends in silence is one the user has to guess about.

## It sticks by mechanism, not by memory

The same `UserPromptSubmit` hook injects what is held into every prompt. On the turn a contract is entered you get the whole file. On every turn after that you get its `## Standing reminder` block and nothing more. You are not remembering the contract. Each turn, you are told it again.

That is why a standing block is capped at four lines. Two slots means up to eight injected lines per turn, which is the ceiling before a standing block reads as background and stops being seen. One rule per symptom, because a wall of doctrine is a wall.

## The ground rules, a third kind of file

Beside the two slots sits a set that is not switched at all. `skills/mode/rules/*.md`, layered under `~/.claude/mode/rules/` exactly as contracts are, is injected whole on the first prompt of every conversation, ahead of any contract, and then never again. The injected block says so itself, so keep applying those rules without being reminded. A resume or a compact drops the injected text, and the same `clear --announced` the resume hook already runs re-arms it.

Ground rules have no slot, no chip and no palette entry, because there is nothing to choose: they are always on. A rules file carries front matter with only `name` and `summary`. A user file sharing a shipped stem replaces that rule, and one with an empty body silences it, which is the supported way to opt out of a shipped rule without touching the plugin.

The point of the tier is migration. Standing text that lives in a CLAUDE.md is paid for on every request of every session; a ground rule costs one injection per conversation. Anything in a personal rule file that is not machine-specific belongs here eventually.

A rules file may also carry a `when:` pattern, alternatives split on a vertical bar exactly as `enter-when` is. Such a scoped rule stays out of the first prompt and injects once, in the same conversation-long voice, on the first prompt that matches it. The shipped `artifact` rule works this way: the HTML theming contract arrives the first time a page is asked for, and never costs a token in a conversation that builds none.

## The guards

The rules are fenced as well as stated. `hooks/guards/` holds the enforcement hooks: the board fences, the prose fence, the comment, null and shell-write guards, the memory guard, and an X/Y/Z read fence that stands only while the `xyz` style is held. Each one interrupts the specific violation it names, which is what makes a rule a mechanism rather than a request.

One switch disarms them all: `"guards": "off"` in `~/.claude/mode/config.json`. Absent means armed, matching the flag philosophy above, and the ground rules keep injecting either way, so switching the guards off changes what gets enforced and never what gets said.

## What the contracts assume about your setup

Three things appear across the files and mean the same thing everywhere.

- **An artifact** is a self-contained page written to a file, which the user can open, keep and re-read. If this setup carries a skill for building one, use it. If not, a document in the repo does the job.
- **A definition of done** is whatever the project's own `CLAUDE.md` states as the bar for delivery: pushed, merged, or committed. Read it rather than assuming one. Where no bar is written down, say so instead of inventing one.
- **"The user"** means whoever is running the session. Claude already knows who that is from its own context, so contracts name no one: a legacy `the user` token in a user-authored contract is still substituted to "the user" for compatibility.

## The mode registry

Both this table and the `Modes available:` list in the front matter are written by `mode sync`, which reads the folder. Do not hand-edit either one, and do not add a mode by adding a row here.

<!-- modes:start -->
| Name | File | Summary |
|---|---|---|
| `autopilot` | `modes/autopilot.md` | The user wants X and is away. Every decision is Claude's, one report waits. |
| `copilot` | `modes/copilot.md` | Refine it together, then a team builds it while the user watches. |
| `debug` | `modes/debug.md` | Find it, prove it reproduces, fix it, and draw why it happened. |
| `ic` | `modes/ic.md` | The all-rounder default. One senior contributor runs the whole loop, the user watches. |
| `prove` | `modes/prove.md` | Nothing is claimed working until a real channel says so, run before and after the change. |
| `studio` | `modes/studio.md` | Think together on one artifact, and it grows while you talk. |
| `tdd` | `modes/tdd.md` | No implementation line exists before a test that fails for the right reason. |
| `tester` | `modes/tester.md` | Work out what to test and how to reach it, run it for real, and report a verdict without fixing anything. |
| `off` | none | Not a mode. `mode mode set off` empties the slot. |
| `auto` | none | Not a mode. `mode mode set auto` matches each message against every `enter-when` and enters the winner. |
<!-- modes:end -->

## The style registry

Written by the same command, from `styles/`, under the same rule.

<!-- styles:start -->
| Name | File | Summary |
|---|---|---|
| `creative` | `styles/creative.md` | Go wide. Several real options, boldness spent in one place, nothing sanded down. |
| `edu` | `styles/edu.md` | Teach it top down, in plain words, carried by pictures rather than prose. |
| `fast` | `styles/fast.md` | The user is in a hurry. Make it work, say done, polish nothing. |
| `maintainer` | `styles/maintainer.md` | Other people depend on this. Docs, tests and the changelog move with the code. |
| `native` | `styles/native.md` | Somebody else's house. Match the neighbours and add none of your own idiom. |
| `ship` | `styles/ship.md` | Ship it properly. Readable, well named, grouped by domain, and our standard where the repo has none. |
| `xyz` | `styles/xyz.md` | Open every reply with the read. X what was typed, Y what was meant, Z what that forces. |
| `off` | none | Not a style. `mode style set off` empties the slot. |
| `auto` | none | Not a style. `mode style set auto` matches each message against every `enter-when` and enters the winner. |
<!-- styles:end -->

## Adding a thirteenth contract

One file, `modes/<name>.md` or `styles/<name>.md`, following the shape the existing twelve use. Which folder it goes in is decided by the question in *Two axes* above: an order of operations makes it a mode, and a texture makes it a style.

- Front matter with `name`, matching the filename stem, and a one-line `summary`. The summary is what `mode list` prints and what the status line chip shows.
- `enter-when`, `enter-never` and `exit-when`, per the table above. A contract with no `enter-when` can only be typed, and one with no `exit-when` behaves as `manual`. Write the line anyway, because an implied contract is one nobody can read off the file.
- Any flag the contract declares, such as `no-implement: true` or `no-dispatch-without-approval: true`. A flag is **on** whenever the key is present and not explicitly switched off, so `true`, `yes`, `1` and even a typo all count as on. It is off only when the key is absent, empty, or set to one of `false`, `no`, `off`, `n` or `0`, in any case and with quotes stripped. These flags are opt-in restrictions and nobody writes one meaning to leave it off, so a misread lands with the gate closed rather than open. Only `no-dispatch-without-approval` currently has a hook behind it; `no-implement` is a declaration that no hook reads yet.
- An optional `color`, one of red, green, yellow, blue, magenta, cyan, grey or pink, which is what the status line chip uses.
- A body carrying the full contract, at whatever length it needs.
- A `## Standing reminder` heading as the last section, holding at most four lines, where every line is a rule that binds in the moment.

Two things about the writing catch people out.

The standing block is injected into your own prompt, so write it in the voice that reads correctly there. "The user speaks only to you, and no teammate writes to them" is a rule. The same sentence turned around states the opposite one.

Use `the user` wherever the person is named, and write around a pronoun for them where you can. Where you cannot, use they and them. The installer's pronouns are not something the setup should have to ask for.

Then run `mode sync`. It rewrites both registries and both front matter lists from the folders, and writes the contract's own command file, so none of the three can drift from what is on disk. A mode gets `commands/<name>.md` inside the plugin and a style gets `style:<name>.md` in the user commands directory, which is what keeps a style out of the `mode:` namespace. Deleting a contract and syncing takes its command with it, so no shortcut is ever left pointing at a contract that is gone; the sweep only ever deletes a file carrying the generated sentence, so a hand-written command in the same folder is safe. `mode list` reads the folder directly and needs nothing.
