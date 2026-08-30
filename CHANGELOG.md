# Changelog

Versions are the number in `.claude-plugin/plugin.json`. That number is not only bookkeeping: it
names the directory a marketplace install unpacks into, so bumping it is what makes an update land
somewhere new rather than on top of the old copy.

This project is pre-1.0, so a minor bump carries new contracts and behaviour, and a patch bump
carries fixes. Nothing here is stable enough to promise otherwise yet.

## 0.14.0

A contract can now outlive the conversation, refuse an edit, and explain itself.

### Added

- **Pins: a slot filled by the directory rather than by the conversation.** Both slots still die
  with the session, which is right for a contract set for one piece of work and wrong for the answer
  that never changes. `mode <axis> pin <name>` writes that answer against a directory, and every
  later conversation started inside it adopts it. Two layers resolve, mirroring the contract folders:
  `~/.claude/mode/pins.tsv` is personal to the machine, and a `.mode` file committed at any directory
  is shared with everybody who clones the repo, carrying `mode:` and `style:` lines a person
  hand-writes. Lookup walks up from the working directory and takes the first answer, so the deepest
  file wins and one package in a monorepo can differ from the repo around it; within one directory
  the personal layer beats the shared, because a machine outranks somebody else's default.
  `mode pins` prints what a fresh conversation here would begin in and which file decided each slot.
- **Three restraints that keep a pin a default rather than an override.** An axis anybody has already
  spoken for is never adopted into, and `off` counts as speaking for it, so `/mode off` in a pinned
  directory is not undone by the next message. Adoption runs once per axis per conversation, so a
  switch made after it is never reverted. A name this machine has no contract for is stepped over in
  silence and does not take the rest of its file down with it, so a repo pinning somebody else's
  private contract costs a stranger nothing. `mode <axis> pin off` writes a personal no that masks a
  shared file without editing the repo, and `--forget` drops the row so the shared one shows again.
- **A third source mark on the chip.** `=maintainer` says the directory pinned it, against
  `~maintainer` for the chooser and a bare name for one that was typed. Nobody should be held to a
  contract they cannot see they did not pick, which was already true of the chooser and is now true
  of a repo.
- **`no-code-without-red`, the hook `tdd` shipped without.** The contract carried a section titled
  "Nothing enforces this", naming the gate that was cut from v1. It exists now: a PreToolUse guard
  that refuses an edit to an implementation file while no watched failure stands. It opens on a suite
  the recorder saw exit non-zero and shuts again on the pass that closes the lap, which is why the
  ledger had to become ordered: read as a set it says a failure happened forever. The flag is on the
  front matter rather than in the code, so any contract can arm it, and the guard carries no mode
  name. It judges narrowly on purpose: only a file whose extension carries behaviour, outside a test
  directory, whose name is not test shaped. The test itself, prose, config and fixtures are never
  refused, because a rule blocking those would block the only route to a red.
- **`/why`, the report that says what is actually steering the turn.** Everything here is either a
  chip too small to explain itself or text injected where nobody can read it, so the plugin had no
  way to answer its most obvious question. It prints what each slot holds and how it got there, where
  the pipeline stands, every gate the mode declares with whether it is open right now and what would
  open it, which ground rules have been injected and which are still waiting on a trigger, and
  whether the next prompt costs the whole contract or the four standing lines. Answered inside the
  hook like a switch, so it costs no tokens and returns immediately. `/why`, `/mode:why` and
  `/mode why` are one code path; `/why fix the parser` puts the report in front of Claude and then
  runs the turn.
- **`mode red` and `mode <axis> pin`, `pins`, `adopt`, `why` on the CLI**, so the guard, the hooks and
  a person all read the same state through the one tool that owns it.

### Changed

- **The done ledger is ordered.** `declared` was a set, which cannot answer a question about a pair
  that cancels out. It is built on an ordered read now, and nothing else about it moved.
- **The dispatch gate is no longer the only mechanism**, so the README's limitations, the guide's
  enforcement table and the manual's flag paragraph now say two rather than one, and name
  `no-implement` as the gap that remains: no hook can tell a two-line seam between finished domains
  from a domain somebody decided to build themselves.
- **`/why` joins `/mode`, `/style` and `/approve`** as a bare command the installer writes, since a
  plugin cannot register an un-namespaced name.

## 0.13.0

The pipeline stops being a drawing and becomes state.

### Added

- **`mode <axis> step`.** Every mode already declared a `steps:` pipeline, but only the status line's
  bash ever read it, so the position was something a renderer derived and nothing else could see.
  `bin/mode` parses it now, reads the ledger, and answers where the pipeline stands: in prose for a
  turn to read, or as tab-separated rows for a renderer. The status line asks rather than parsing
  front matter itself, which is what stops the drawing and the injected text disagreeing.
- **The position is injected on every turn.** `announce` carries it under the standing reminder, in
  the same shape the rest of the plugin uses: the model is never remembering which step it is on,
  it gets told again each turn. The line names the step, what came before, what comes next, and the
  command that closes it.
- **`observe.py`, a PostToolUse hook that records what actually happened.** A step's `@event` suffix
  names the moment that closes it, and most of those moments are observable: asking the user closes
  a `@question` step, spawning an agent closes `@agent`, writing an artifact closes `@artifact`, a
  test run closes `@test` and a red one closes `@test-fail`, a commit closes `@commit`. Those advance
  with nobody remembering to say so. Steps with no event, four of `ic`'s seven, still need declaring,
  which is what the injected line asks for. Registered on `PostToolUseFailure` too, since that event
  is the only honest way to tell a passing suite from a failing one.

### Changed

- **A finished pipeline says so** rather than pointing at its last step forever.

## 0.12.0

Switching stops costing a turn.

### Added

- **A message that is only a switch ends in the hook.** `/mode debug`, `/mode:debug /style:edu` and
  `/mode off` now do the switch, print the chips back, and stop there. Claude Code's
  `UserPromptSubmit` hook can block a prompt, and a blocked prompt is never sent, so the turn costs
  no tokens and answers in roughly a quarter of a second instead of a request's worth of latency.
  This is what the mode commands were already reaching for: each one's body said "confirm the switch
  in one line", which is a whole model turn spent writing a sentence a script can print. The
  confirmation is the same chips the status line shows, with each held contract's summary under
  them, so what you read after switching matches what you look at while working. It closes on "Set.
  The status line catches up when the conversation continues." Claude Code redraws that line off the
  model's own reply and a turn ending in the hook never writes one, so the chips there are a switch
  behind until your next message. The line says the outcome and when the surface follows, which is
  what someone actually wants to know; `statusLine.refreshInterval` would redraw it on a timer, at a
  180 ms subprocess every interval in every open session, and is not worth that.
- **A bare `/mode` or `/style` answers with that axis's contracts.** Naming an axis with nothing
  after it is a question rather than a switch, and it is answered the way `/model` answers, by
  listing what you could pick. The slot is left untouched.

### Changed

- **The whole contract now lands on the first prompt that has a use for it.** It used to be spent on
  the turn you switched, which was usually a turn that did no work. A switch-only message leaves the
  announcement unspent, so the next real message is the one that carries the contract. Nothing
  changes for a message that switches and asks in the same breath.
- **A switch carrying real words still runs.** `/mode debug fix the parser` sets the slot and then
  goes to work, and so does a message with another plugin's command in it. The rule is whether a
  word is left over that only the model can answer, which is why an unrecognised word after the
  contract name is enough to keep the turn. `/mode:approve` is untouched and still runs a turn,
  since an approval exists to let work continue rather than to record a fact.

## 0.11.0

A ninth mode: the team, reached without a spec.

### Added

- **`swarm` mode.** Copilot's team with the spec and the approval removed, which leaves a gateway
  rather than a lead. It keeps a standing roster of owners, one per domain, held on the board so it
  survives the turn that built it, and routes each ask to whoever owns that domain. Nobody owning it
  means one gets hired, chartered by the files it takes, and there is no cap on how many. What
  replaces the approval gate is triage: an ask unclear on something that would change what gets
  built is refused in one line rather than guessed at, because with no spec there is nothing else
  standing between a wrong read and a fleet building the wrong thing. The register is close to
  silent, normally one or two lines a turn naming who got the work, and the file is explicit that
  terseness removes the narration and never the verification. One rule carries the whole design: a
  domain is a set of files no other owner writes to, which is what stops a swarm degrading into one
  agent per file. Sky chip, `no-implement` declared, no dispatch gate.
- **A ninth chip colour, `sky`.** The eight modes already held all eight colours, and no two
  contracts on one axis may share one, so a ninth mode needed a ninth name. ANSI 94, bright blue,
  distinct from `blue` on both light and dark terminals. The manual now says out loud that the modes
  have taken the whole palette again, so a tenth mode means a tenth colour.

### Changed

- **The manual's "Adding a thirteenth contract" heading loses its count.** It had already drifted by
  three, since nothing recomputes a number written into a heading. It is "Adding another contract"
  now, and the numbers that remain are the ones a reader would notice going wrong.

## 0.10.0

A seventh style, and the deliverable stops being implicit.

### Added

- **`creative` style.** The failure it exists to stop is the average answer: the first plausible
  approach, competently built, that nobody would have missed. It widens the search before anything
  gets built, asks for several genuinely different options rather than one and its variations,
  spends the boldness in one place and names what that risk cost, and keeps the rejected idea
  visible with its reason. One boundary is absolute: creativity lives in the approach and never in
  the facts, so the grounding rules bind exactly as hard here as anywhere. Pink chip, paired with
  `ic` in the colour map, since the everyday all-rounder with the imagination turned up is a pair
  that means something.
- **`deliverable` ground rule.** What lands was previously welded into each mode, which is why
  there was no way to ask for one mode's rigour with a different output. The rule names the four
  forms, chat, artifact, merge request and MVP, requires the form to be stated before it is
  produced, and routes each one: an artifact always goes through the `create-artifact` skill, a
  merge request follows the outbound-writing rules, an MVP is code that was run once for real.
  Several at once is ordinary. Whatever the form, grounding, sources, prose and scope still bind.

### Known limits

- The deliverable is routed but not pinnable: there is no slot holding it for a whole session, so
  a mode whose exit depends on its own output keeps that dependency. Whether it becomes a third
  slot, or a `delivers:` key each mode declares, is open.

## 0.9.0

The artifact rule becomes a contract about interactivity.

### Changed

- **An artifact is operated, not read.** The `artifact` ground rule grew from a theming note into
  the full contract, folding in the method from a vendor artifact skill and two of our own best
  pages. It now fixes what the reader must be able to *do* per subject: reproduce the bug, switch
  the mockup variants, run the backend scenario, explore the real rows. Two tests decide whether it
  shipped: strip every control and see whether the page still says the same thing, then ask whether
  a reader can reach a conclusion nobody wrote into it.
- **Sources are links, not labels.** Every load-bearing claim carries a clickable receipt that
  resolves outside the page, to a repository permalink pinned at the line, an observability query
  already filtered, the ticket or the pipeline. Monospace `file:line` text is not a source.
- **No tab bars, and every visual is data-driven.** A wall of text behind five tabs is five walls
  with a nav in front, so the shape is a hero and scroll chapters, each carrying a figure the
  reader operates. Scenes are rendered from exported records rather than invented shapes.
- **Light stays the default, explicitly.** The rule now says so against any vendor convention that
  defaults to a dark showcase, and adds the standing bar against wearing another organisation's
  brand on work that is not theirs: take the method, run it on the design system the work belongs
  to.
- **Verification splits behaviour from taste.** Proving the controls work is required and is done
  headlessly; judging how it looks stays the user's, so no browser is driven for appearance.

## 0.8.2

### Fixed

- **Two commands in one prompt both land.** `/mode:debug /style:edu` set only the mode: the whole
  prompt was read as a single command, so the second command became an argument of the first,
  failed the name lookup, and was dropped in silence. The parser now splits a prompt into command
  chunks and obeys each, in any order, while a single command with words after it (`/mode ic fix`)
  is still one command. Another plugin's command sitting between two of ours is skipped rather
  than swallowing what follows.

## 0.8.1

### Fixed

- **A slash command led by `<command-message>` now switches the slot.** A real invocation reaches
  the hook as tags in no fixed order, and a plugin command leads with `<command-message>`, so the
  parser, which anchored on `<command-name>` first, saw nothing and left the slot unchanged. This
  is why `/mode:tester` silently did not switch while a differently-shaped `/style:edu` did. The
  parser now finds the command name in either tag, in either order. Restart or a new conversation
  is needed, since a running session cached the old hook.

## 0.8.0

The plugin becomes the whole system.

### Added

- **The guards.** Eleven enforcement hooks move into `hooks/guards/`: the board fences (category,
  keep, deliver, check, done), the prose fence, the comment, null and shell-write guards, the
  memory guard, and an X/Y/Z read fence that stands only while the `xyz` style is held. One switch
  disarms them all, `"guards": "off"` in `~/.claude/mode/config.json`, with absent meaning armed.
  Their messages cite the rule they enforce rather than a file on one person's machine.
- **Scoped ground rules.** A rules file may carry a `when:` pattern; it stays out of the first
  prompt and injects once on the first prompt that matches. The new `artifact` rule ships this
  way, delivering the HTML theming contract the first time a page is asked for.
- **Every mode draws its shape.** Each contract now carries a mermaid diagram of its own
  procedure, readable in the file and rendered wherever the repo is browsed.

### Changed

- **`ic` is the flagship default.** Rewritten from a thin sketch into the all-rounder contract:
  one senior contributor runs the whole loop, read, ground, build, verify, deliver, borrowing each
  specialist discipline without its ceremony, asking only the forks whose wrong guess wastes the
  task, and offering a team mode when independent domains pile up.
- **Contracts are isolated.** No mode or style names another. Each file stands alone, and
  cross-catalogue comparisons live only in the README and the manual.
- **Nobody's name.** The identity config, `mode init`, the installer's name prompt and the
  `{{USER}}` machinery are gone: contracts say "the user", and Claude already knows who that is. A
  legacy token in a user-authored contract is still substituted for compatibility.

## 0.7.0

The ground rules.

### Added

- **A third kind of file: ground rules.** `skills/mode/rules/*.md`, layered under
  `~/.claude/mode/rules/` the way contracts are. Their bodies are injected whole on the first
  prompt of every conversation, ahead of any contract, and never repeated; a resume or a compact
  re-arms them, since either drops the injected block. No slot, no chip, no palette entry: they
  are always on. A user file sharing a shipped stem replaces that rule, and an empty body silences
  it. Five ship, extracted from a working setup: an evidence bar, scope discipline, a live task
  board, collaboration defaults, and a prose register. The point is economics: a rule in a
  CLAUDE.md is paid for on every request of every session, and a ground rule costs one injection
  per conversation.
- **`mode rules`**, the command behind it. It prints once per session and exits 1 ever after,
  refuses to print at all without a session to remember by, and is re-armed by the same
  `clear --announced` the resume hook already runs.
- The installer creates the user rules directory beside modes and styles.

## 0.6.0

A sixth style.

### Added

- **`xyz` style.** Every substantive reply opens with a three-line read before any work happens:
  X what was typed, Y what was actually meant, inferred from the repo and the conversation rather
  than asked, and Z the adjacent work those two force into existence. A Z inside the topic that the
  user would ask for anyway gets done in the same turn and reported; examples are treated as
  illustration to complete, never as the spec; open questions are resolved by lookups instead of
  being handed back. Red chip, paired with `autopilot` in the colour map, since being away makes
  the read the only interpretation pass the work gets.

## 0.5.0

The clean palette, and an eighth mode.

### Added

- **`ic` mode.** Copilot with the spec step removed: the same shared intake, then Claude builds it
  himself. No spec artifact, no approval gate, no team; a real fork is asked as it appears, and the
  board is the record. A read-only search agent is fine, but the moment an agent writes code the
  contract says to offer copilot instead. It takes the new `pink` chip colour, since the eight
  modes outgrew the seven-colour set.

### Changed

- **The palette holds three shapes and nothing else: `mode`, `mode:<mode>` and `style:<style>`.**
  The skill that sat in the palette as `mode:mode` is `MANUAL.md` now, deliberately unregistered,
  and the init skill is `INIT.md` for the same reason. `/mode`, `/style` and `/approve` are small
  files the installer writes into the user commands directory, because a plugin cannot register an
  un-namespaced command. The style shortcuts moved out of the plugin too: inside it they arrived as
  `/mode:style:<name>`, so `mode sync` now writes `style:<name>.md` beside the bare files and they
  arrive as `/style:<name>`. Always-on token cost fell from about 556 to about 154 per session.
- **`ship` stands alone and carries the whole standard.** Every reference to the fast style is
  gone, and the contract now spells out the rules it holds work to: comments that say why or
  nothing, names that mean something, grouping by domain, explicit types on the exported surface,
  reuse before building, splitting a touched file that outgrew itself, tests where the risk is
  real, and one-line commits by logical group. Written out in full because an install has none of
  the private rule files the old summary leaned on.
- **The first name per axis wins.** `/mode tdd debug` holds `tdd`, and `/mode tdd tdd maintainer`
  fills each slot once. Names can arrive in any order, and a duplicate is noise rather than an
  overwrite.
- **The status line gets one chip per axis.** `mode chips` always prints two entries, `🎚` for the
  mode and `💬` for the style, with `off` in an empty slot, so the segment never vanishes and the
  spacing never jumps. The host line embeds the output raw and adds nothing.
- **The installer writes the bare commands by default** and refreshes only files carrying its own
  marker, then runs `mode sync` so a fresh install gets the per-style shortcuts immediately.

### Fixed

- **The stale-shortcut sweep is sentinel-gated.** Sync deletes only a file carrying its generated
  sentence, so a hand-written command sitting in the same folder can never be swept.

## 0.4.0

The ship and fast split.

### Changed

- **`ship` no longer means hurry.** It is the quality-shipping contract now: shipped code is code
  somebody maintains, so the style optimises for the next developer. Readability, real names,
  grouping by domain, explicit types on the exported surface, and refactoring a touched file that
  has outgrown itself. Its centre is an inner compass: a repo's habits are followed when they
  amount to a standard, and where they do not, our standard applies instead of mirroring the mess.
- **`fast` carries the economy `ship` used to.** Make it work, prove it ran, polish nothing:
  no tests, no comments, no naming care, no reuse, no weighing of dependencies. The reply rules it
  already had stay, and so do the floors, since ugly is allowed and wrong is not, and speed is
  never bought from data loss, secrets or irreversibility.
- **The trigger phrases moved with the meaning.** `just ship`, `hotfix`, `quick and dirty` and
  `make it work` now select `fast`; `ship this`, `ship it`, `get it out` and `ready to ship`
  select `ship`. A message carrying both, like "just ship it", is ambiguous on purpose and
  selects nothing.

## 0.3.0

The command palette.

### Added

- **A shortcut per contract.** Type `/mode:` and every contract is listed, rather than typing
  `/mode ` and recalling what exists. A mode is its own name and a style carries its axis, so
  `/mode:tdd` and `/mode:style:ship`. The files are written by `mode sync` from the contract
  folders, so a new contract arrives with its shortcut already in place and a deleted one takes its
  shortcut with it.
- **The hook understands the colon spelling.** `/mode:tdd`, `/mode:style:ship` and `/mode:approve`
  previously matched nothing and switched nothing, so a shortcut would have autocompleted and then
  done nothing at all. One parser now covers the colon and spaced forms together.

### Fixed

- **Two components no longer answer to `mode`.** The skill and `commands/mode.md` both carried the
  name, which put two identical entries in the palette with nothing to tell them apart. The command
  is gone and the skill keeps the name.

### Known limits

- A style's command file has a colon in its filename, which Windows does not permit, so those five
  files will not check out there. Renaming them to `style-ship.md` gives `/mode:style-ship`.
- The twelve shortcuts add roughly 250 tokens to the always-on cost of every session, taking the
  plugin from about 300 to about 550.

## 0.2.0

Two new modes, and one change to how a slot is filled.

### Added

- **`prove` mode.** Nothing is claimed to work until a channel that can disagree with you says so.
  A channel is an HTTP response, a browser, a log line, a query, a test. Reading the code is not
  one, since it is the same mind that wrote the change. The lap is name the channel, take a
  baseline, make the change, prove it after, and once per behaviour break it on purpose to confirm
  the channel actually notices. It suspends the standing rule against driving a browser, because
  driving the thing is the whole contract, and it leaves taste alone: prove the button fires the
  request, never that the spacing looks right.
- **`tester` mode.** A QA sweep that reports a verdict and fixes nothing. Six phases, and the first
  four are the ones that get skipped: name the environment, make the preconditions true, enumerate
  the surface, then generate cases from its structure rather than from memory. Only then execute,
  for real, and report. It fixes nothing on purpose, because a repair mid-sweep changes what was
  being measured and leaves a report describing a system nobody ever ran.
- **`mode axis <name>`**, which answers which axis owns a contract name. It exists so the prompt
  hook can route a bare name without keeping its own copy of what exists.
- **`mode version`**, which prints what is in `plugin.json`. This is how you check that an update
  actually took.

### Changed

- **A bare name now goes to whichever axis owns it.** `/mode maintainer` reaches the style slot
  instead of failing quietly against the mode one, which previously looked like it had worked.
- **Both slots can be set in one command.** `/mode tdd maintainer` fills the mode and the style, in
  either order. Only `auto` and `off` stay tied to the command they were typed on, since neither
  names a contract.
- **Seven modes now take all seven colours**, so every style shares its chip colour with a mode.
  The pairs that share one are pairs whose combination already means something, so two chips in the
  same colour never read as an accident.

### Fixed

- **The `mode` skill is user-invocable again.** A skill named `mode` wins the `/mode` match over a
  command of the same name, so making the skill non-invocable removed the only working path to it:
  the match landed on the skill, which then refused.
- **The command bodies no longer reference the plugin root.** It only expands when Claude Code
  loads them as a real plugin, and is empty when they are loaded as project commands.
- **The bare `/style` alias carries `disable-model-invocation`.** Without it, accepting the aliases
  during install made `/style` model-invocable when the namespaced `/mode:style` is not.
- **The plugin-root pointer is read verbatim**, so an install path containing a space survives.
- **The `/style` command no longer claims it set a style.** Since a bare name routes by ownership,
  `/style tdd` fills the mode slot, and the command was telling the model to confirm the opposite.
  It now reads what is actually held. The alias the installer writes had the same wording.

## 0.1.0

The first cut. Two slots per conversation, one holding a mode and one holding a style, both
switched by a `UserPromptSubmit` hook before the model reads the message.

- Five modes: `autopilot`, `copilot`, `debug`, `studio`, `tdd`.
- Five styles: `edu`, `fast`, `maintainer`, `native`, `ship`.
- `auto` on either slot, choosing a contract from `enter-when` patterns matched at a word boundary,
  with a hand-set contract never overridden and an ambiguous message choosing nothing.
- One real gate: `copilot` refuses to spawn a team of agents until an approval is on record.
- Status line chips, emitted by `mode chips` rather than owned, so an existing line keeps whatever
  else it renders.
- `install.sh` and an interactive `init` skill, covering the identity config, the user contracts
  directory, the status line and the short command names.
