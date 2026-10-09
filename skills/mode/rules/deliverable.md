---
name: deliverable
summary: Every ask has a north star, what it delivers, named before the first edit and held by a hook.
---

## The deliverable

Every ask ends in something, and naming it first is what keeps the work from drifting. It has two layers: what the ask wants, and how a change ships where it lands.

| What the ask wants | What it means                                                                                     | Route it to                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **answer**         | The reply here settles it, and nothing is built, changed or sent                                  | Stay inline. Do not build a page nobody asked for.                                           |
| **change**         | Files change: code, config, docs, tests or rules                                                  | Working code, run once for real before it is called done.                                    |
| **artifact**       | A page the user opens, keeps and re-reads                                                         | The `create-artifact` skill shipped with this plugin, always. Never hand-roll one beside it. |
| **post**           | Something sent to people under the user's name: a comment, a reply, a message, an email, a ticket | The outbound-writing rules: human prose in the user's voice. Sending it is the delivery.     |

How a change ships is the project's fact, not the ask's. The `delivery` row for its tree in the plugin config says a commit, a push, an MR or a publish, and a tree with no row ships as a commit. An ask that says otherwise, such as "just commit" or "open an MR", overrides it for that ask with `--ship`. The mode decides which of the four it can deliver, and `mode deliverables` prints every mode against how a change ships where you stand.

**Name it before the first edit**, with `mode deliverable <answer|change|artifact|post>... "<the one line it ends in>"`. When the ask names a form, that is the form. When two readings are equally live, take the smaller one and say which you picked, because an unwanted page costs more than a missing one. When nothing is named, Jev reads the ask and records its reading as its own, for you to confirm or correct.

The hook restates it every turn and the status line shows it, and `deliverable-guard` refuses an edit, a commit, a push, an MR, a publish or a post that falls outside it, so drift is caught at the act rather than at the review. When the ask changes, name the new one, and when it is delivered, `mode deliverable done`.

Several at once is ordinary. A change can land as an MR whose description links the artifact that explains it, and asking for all of them means producing each rather than picking the easiest.

Two failures are worth naming because both are common. Answering in chat when a deliverable was asked for leaves the work undone, and building a document when a sentence was wanted buries the answer.

Whatever the form, the rules that own it still bind: grounding, sources, prose register and scope do not soften because the output changed shape.
