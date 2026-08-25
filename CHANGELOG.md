# Changelog

Versions are the number in `.claude-plugin/plugin.json`. That number is not only bookkeeping: it
names the directory a marketplace install unpacks into, so bumping it is what makes an update land
somewhere new rather than on top of the old copy.

This project is pre-1.0, so a minor bump carries new contracts and behaviour, and a patch bump
carries fixes. Nothing here is stable enough to promise otherwise yet.

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
