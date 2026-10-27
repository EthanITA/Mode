---
name: create-artifact
description: Produce an artifact. A brief, plan, task, one-pager or catch-up is a one-screen .md with its mermaid diagram first, built in minutes for the sidecar to render and comment on. A report, review, RFC/design doc, study guide, explainer, dossier, showpiece or app-UI mockup is a local self-contained .html in a chosen design system, with full 3D, motion, React and interactivity; it ships a neutral house style and the public brand systems (GitHub Primer, Material 3, IBM Carbon, Linear, Vercel Geist, Stripe, Notion, Apple HIG, SpaceX), resolves any design system installed in ~/.claude/mode/design-systems/, and responds in the edu style. Either way it grounds its claims in real sources, carries the receipts into the artifact, and hands it over as a path never opened for the user; publishing happens only when they ask for a link by name. Use whenever the user asks to create/produce/build/redesign an artifact, brief, plan, visual doc, report or mockup, and whenever they invoke /create-artifact.
user-invocable: true
disable-model-invocation: false
---

# Create artifact

Produce an artifact that says only true things, in the shape one profile fixes. Pick the profile, read the one file its row names, and hold the three rules below on every path.

**Invocation:** `/create-artifact <what to build> [--ds <key>]`. The `--ds` flag names the design system of an html page, as a key or a bare name (`/create-artifact the release digest --ds linear`), and `references/html.md` §4 resolves it when absent. An installation may add wrapper skills that pre-answer `--ds` with one of its own packs.

**The CLI:** `artifact` in every command is this plugin's `bin/artifact`, sitting beside `bin/mode`. Call it by path, or put the plugin's `bin` on your PATH.

## Pick the profile

Name it in one line and move on. When two fit, the tie-break is what the reader does with it: something scanned to agree or correct is a **brief**, something read start to finish is a **report**, something navigated and returned to is a **dossier**.

| Profile       | The ask sounds like                                                                                                                                    | Delivers                                | Read                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | --------------------- |
| **brief**     | a plan, a brief, a task, a digest, a one-pager, catch me up                                                                                            | a one-screen `<slug>.md`, diagram first | `references/brief.md` |
| **report**    | a report, a review, a synthesis, an RFC                                                                                                                | a local `<slug>.html`                   | `references/html.md`  |
| **explainer** | explain X, teach me, a study guide                                                                                                                     | a local `<slug>.html`                   | `references/html.md`  |
| **dossier**   | analyse X, is it worth it, the full picture with data, **make it interactive**, **navigable, something I come back to**, **a document with structure** | a local `<slug>.html`                   | `references/html.md`  |
| **showpiece** | make it impressive, a demo, visualise this                                                                                                             | a local `<slug>.html`                   | `references/html.md`  |
| **mockup**    | a mockup of the settings screen                                                                                                                        | a screen in the target repo             | `references/html.md`  |

Read nothing else up front. The file a row names loads every other reference at the step that needs it, so a path never pays for another path's references.

The finished file goes in the artifacts directory, `NOTES_ARTIFACTS` or else `~/.claude/sidecar/artifacts`, and nothing else does: sources, scripts, exports and notes live in the session's build folder, `$CLAUDE_JOB_DIR/tmp/<slug>/`.

## Three rules, on every path

1. **Read the comments first, and resolve only once the edit lands.** An artifact you are asked to change may already carry the user's comments, so read them before planning a single edit. Work each open thread as an instruction about the block it quotes and answer every one, because a thread left open with no reply is the one outcome the user cannot see. The threads belong to the [sidecar](https://github.com/cela-sage/sidecar), whose rule says how to read, answer and resolve them while it is installed. Resolving claims the artifact now does what the thread asked, so it comes after the edit. Then run `artifact review <slug>`: threads survive it by re-anchoring on the text they quote, and on a `.md` it only adds the empty `<!-- rv:seed -->` block the sidecar writes them into. In copilot mode this is the approval gate. Approve pressed with no open threads is the yes, recorded with `mode approve <slug>` before you dispatch, and Approve pressed with threads open makes those threads the work. Silence is never an approval.
2. **Say only what is true.** Every load-bearing claim rests on a source you read this session, carried beside the claim where the reader can follow it. A claim you cannot source is cut, marked as your recommendation, or marked as an open question, and rendering it as fact is never available. Only a mockup asserts nothing, and skipping the grounding is said out loud.
3. **Show it, then hand over the path and stop.** Roles, structure, flows and numbers are drawn as a diagram, a table or a chart that replaces the prose describing them, and prose keeps only what the visual cannot carry, in the register of the `prose` ground rule. Deliver the absolute path and stop. Never open the artifact, screenshot it or ask whether it looks right, because the user opens it when they choose.
