# Grounding: make the artifact true before you make it look good

An artifact that invents a fact is worse than no artifact. It looks authoritative, it gets shared, and it teaches a wrong model to everyone who opens it. A wrong sentence in a chat is corrected in the next message; a wrong sentence in a published artifact outlives the chat.

So the order is: **find out, then render.** Never render, then hope.

This is the *content* half of grounding. The *design* half — reading a pack's source of truth so the look is real — is SKILL §3. They are separate steps and both are required.

## The worth-it gate

| Ground the content | Skip it (say the skip out loud, one line) |
|---|---|
| The page asserts how a real system behaves | A pure UI mockup that asserts nothing |
| It names endpoints, tables, flags, owners | A visual study of a look or layout |
| It reports numbers, dates, statuses, money | A study guide over material the user supplied in-chat |
| It says a decision was made, or why | A restatement of a document already in hand |
| It says what a person or team did | A template with placeholder content |

Skipping is a legitimate outcome. Skipping *silently* is not: an ungrounded artifact that never says so reads exactly like a grounded one.

## The inventory

Answer these before authoring. The scale changes, the questions do not.

1. **Scope and topic guard.** One sentence: what must the reader understand, and what is deliberately out of scope? Everything later gets checked against this line.
2. **Actors.** Who or what triggers this, and who consumes the result.
3. **Contracts.** The exact interfaces at each hop: routes and methods, function signatures, table columns, message shapes, the headers or flags that change behaviour.
4. **The path end to end.** Never stop at one layer. Client, then whatever sits between, then the service, then the data. Say who owns each hop.
5. **States and branches.** The steps, the guards, what happens on failure and on replay. This is usually the thing the artifact's main diagram will show, so it needs the most care.
6. **Numbers, if the page shows any.** Where each figure came from and as of when.
7. **What you could not confirm.** Kept as an explicit list, not as a vague feeling.

## Where to look

Sweep every relevant source, not the first plausible one, and fire the independent lookups in parallel. The connected MCP servers are as cheap as a grep, so use them rather than answering from memory.

| Looking for | Go to |
|---|---|
| How the code actually behaves | `rg` and Read across the repo under `projects/`, including `node_modules` when the claim is about a dependency |
| Why a change was made | the repo history, then the merge request or pull request that carried it |
| Ticket state, acceptance criteria, who asked | the tracker MCP connected in this session |
| A decision taken in writing outside the tracker | the mail and calendar MCPs |
| Prior work on the same topic | `~/Notes/tasks/`, `~/Notes/standup/`, and the project's own `CLAUDE.md` |
| Runtime truth: volumes, latency, error rates | whatever observability the project's `CLAUDE.md` names |

That table names categories on purpose. Which servers are actually connected changes over time, so read the session's own tool list rather than trusting a hardcoded roster here. If a lookup fails because a source moved, find its new home and fix the project file that pointed at the old one.

## Fanning out on a broad surface

One service or one repo: stay inline. Reading it yourself is faster than briefing someone.

Several subsystems at once: dispatch one subagent per subsystem, in parallel, each with real anchors to start from (paths, symbols, endpoints) and each returning a short findings abstract rather than a transcript. Keep the orchestrator lean so it can still hold the whole picture. Per global rules a named subagent is an Action and needs no approval, while a `Workflow` fan-out is token-heavy and gets proposed first.

## Write the findings down

Put them in `~/Notes/analysis/<slug>-artifact-notes.md` as a structured list, one line per fact, each carrying its source. Two reasons this beats keeping them in your head. The authoring phase then reads structured facts instead of chat memory, which is where invention creeps in. And a later session refreshing the artifact starts from the findings rather than redoing the research.

If that file already exists from an earlier run, read it before you write. Update what changed and keep what still holds; never clobber a previous investigation with a fresh one that happens to be shallower.

## Termination: how you know grounding is finished

This phase has no natural end, so it needs a stated one. Grounding is done when **every load-bearing claim the artifact will make has exactly one source you read this session.**

A claim you could not source has three honest endings and no fourth:

- **Cut it.** Usually correct. The artifact is not obliged to cover everything.
- **Label it a recommendation.** For your own design calls and inferences. Mark them visibly so a reader never mistakes a judgement for a finding.
- **Label it open.** For a real question the artifact should raise but cannot answer.

Rendering it as fact anyway is the one thing that is never available.

## Receipts: carry the sources into the page

The findings are only useful if the reader can check them, so every load-bearing claim carries its source in the artifact itself, not just in your notes.

- **Inline**, a small monospace chip next to the claim: a `file:line`, an endpoint, a ticket key, a permalink.
- **Collected**, a Sources section near the end, so someone can audit the whole page at once.
- **Dated.** A receipt is true as of the session that wrote it. A `file:line` rots when the file moves, so the Sources section says when it was gathered.
- **Linked where a link exists.** A ticket key, a merge request, a message permalink and a hosted file all have URLs. Use them.
- **Honest about kind.** A finding and a recommendation look different on the page. See `information-design.md` for the anchor-visual rules that apply to both.

The stylesheets carry `.receipt`, `.sources` and `.rec-label` for exactly this. Do not invent a new citation style per artifact.

## Scale it

- **A concept with no project specifics.** Confirm the handful of facts you will teach, cite public sources, move on.
- **One service or one repo.** Read it, trace its callers and its contracts, cite as you go.
- **A flow crossing several systems.** Fan out, trace it end to end, and expect the tracker and the code to disagree somewhere. When they do, the code wins and the disagreement is itself worth putting on the page.
