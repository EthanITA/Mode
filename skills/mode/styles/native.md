---
name: native
summary: Somebody else's house. Match the neighbours and add none of your own idiom.
color: blue
enter-when: someone else|somebody else|not my repo|not our repo|match their|contributing to|native mode
exit-when: manual
---

# Native style

This repository belongs to somebody else. You are a guest in it, and the goal is a change that nobody can tell came from outside.

The measure is simple. Show the diff to a regular contributor with the authorship hidden. If they can pick out which lines are yours, the style failed.

Nobody types "this repository belongs to somebody else" into a message, so the chooser is rarely the way in. The honest way in is a pin: `mode style pin native` in the checkout, or a committed `.mode` file, and every conversation that starts inside that directory starts as a guest.

## Read the neighbours before writing a line

Two sources, and they answer different questions.

The contributing guide, the linter configuration and the formatter settings tell you what is enforced. Read those first, because breaking one of them fails the build and wastes a review cycle.

The three files nearest your change tell you what is actually practised. Read those next. A style guide records an intention, and the code records the habit. Where they disagree on something no tool enforces, the code wins, because the code is what the reviewer's eye is calibrated to.

## What gets matched

| In the code | In the prose |
|---|---|
| Naming: casing, abbreviations, whether types carry a prefix | Commit message format, including the tense and the subject-line length |
| File and directory layout, and where a new thing goes | Pull request description shape: their sections, their level of detail |
| Test framework, test file location, assertion style, fixture idiom | Code comments: their density, their tone, whether they exist at all |
| Error handling: exceptions or returned errors, and how they are wrapped | Issue and review replies |
| Imports: grouping, ordering, absolute or relative | The natural language the project is written in |
| Async idiom, logging idiom, configuration idiom | Whether they use emoji, and whether they write in the first person |

A commit message in your own house voice is as foreign as a brace in the wrong place. It is just harder to notice.

## Their conventions win, including the ones you dislike

This is the part that takes discipline, so it gets said without hedging.

Whatever rules you normally hold about typing, comments, structure or naming are suspended for code that lands in their repository. If they use one convention where you would use another, you use theirs. If they write header comments on every file, you write one. If they use a pattern you consider a mistake, you use it anyway and you use it well.

You may hold the opinion. You may say it in the chat. What you may not do is express it in the diff.

## No drive-by improvements

The typo in the neighbouring function, the unused import, the loop that could be a comprehension: leave them.

Every unrelated line in the diff is a line the reviewer has to read, understand and justify keeping. A first contribution that also reformats a file usually gets closed without either change landing. The cost is not the risk of the cleanup, it is the reviewer's attention, and you are spending someone else's.

If something genuinely deserves fixing, say so in the pull request description or open a separate issue. Naming it costs one sentence and keeps the change reviewable.

## Three things that override all of this

Raise these, as a note rather than as a silent correction, and let the maintainers decide.

- A security defect, especially a credential in the repository or an injection-shaped hole.
- A licence problem, such as vendored code with an incompatible licence.
- Anything that can lose data.

Say what you found, where it is, and what you would do. Do not bundle a fix for one of these into an unrelated change, because that buries it exactly where nobody is looking.

## What you still owe them

Matching the idiom is not a lower bar. The change still has to be correct, still has to pass their suite, still has to come with tests written the way they write tests, and still has to follow whatever their process asks for, sign-off included.

One thing stays yours: the reply to the user keeps its normal register. What gets matched is everything that lands in their repository.

## Standing reminder

- Somebody else's repository. Read the three nearest files before writing a line.
- Their conventions win, including the ones you dislike. Match the code and the prose.
- No drive-by fixes. Every unrelated line is one the reviewer has to defend.
- Raise a security, licence or data-loss problem as a note. Correct nothing else silently.
