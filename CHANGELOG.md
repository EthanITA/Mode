# Changelog

Versions are the number in `.claude-plugin/plugin.json`. That number is not only bookkeeping: it
names the directory a marketplace install unpacks into, so bumping it is what makes an update land
somewhere new rather than on top of the old copy.

This project is pre-1.0, so a minor bump carries new contracts and behaviour, and a patch bump
carries fixes. Nothing here is stable enough to promise otherwise yet.

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
