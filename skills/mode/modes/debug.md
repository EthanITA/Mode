---
name: debug
summary: Find it, prove it reproduces, fix it, and draw why it happened.
color: yellow
enter-when: not working|broken|fail|still not|an error|the error|stack trace
exit-when: approved
steps: instrument, reproduce?@test-fail, fix@commit, explainer@artifact, approval?@approve, mr
loops: reproduce>instrument, approval>explainer
---

# Debug mode

Something is wrong and the user does not know where or why. Had the location been known it would have been named, so the work cannot start at the fix: it starts at visibility, stays in the investigation until the bug reproduces on demand, and only then decides how to solve it. Three deliverables, all required: a fix on a branch, an explainer artifact saying why it happened, and a merge request opened once the explainer is read and approved.

Instrument to make the failure observable, form a hypothesis with the result that would kill it, run one experiment with one change, and loop back to instrumenting while it does not reproduce. Once it reproduces on demand, take the correct fix on a branch by default, or a workaround with the follow-up written down when it is burning. Then write the explainer, and on `/approve` of its slug open the merge request and end; changes asked send you back to the explainer. The only gate that matters is the reproduce edge: nothing moves forward on a bug never seen failing.

## When it starts and when it ends

`enter-when` matches a symptom report while the slot is `auto`. It says `fail` rather than every ending because matching anchors at a word's start and runs free at its end, so one stem covers fails, failed, failing and failure. The error alternatives are phrases for the reverse reason: a bare `error` would fire on "add error handling to the parser", a feature request, while `an error` and `the error` only match somebody describing one they hit. A second failed attempt on the same file and the same complaint arriving twice are signals for the hook rather than you, both meaning the ordinary approach already failed, which is when this contract earns its place.

`exit-when: approved` reads the approval record, which remembers the mode active when the yes was given, so an approval recorded here satisfies this mode and nothing else. Otherwise approving this explainer would quietly satisfy a gate another contract guards and unlock work against a plan nobody saw.

## Instrument before guessing

The first move is always visibility: logs, a trace, a print in the suspect path, a script that exercises the thing, whatever makes the failure observed rather than described. Then name a hypothesis out loud with the result that would kill it ("I think the cache is stale, so clearing it before the call makes the failure go away") and run that experiment. One whose outcome you cannot state in advance is not an experiment.

Where a plausible cause would ordinarily get a fix attempt, here a named hypothesis gets an experiment with the killing result stated first. Change one thing at a time, because a fix bundled with a tidy-up proves nothing about either. Report a failed attempt with what it eliminated and never retry it or slide quietly to an adjacent one. Nothing is fixed until the failing case has been run and watched to pass. The explanation is a deliverable too, drawn, so the second occurrence is cheaper. Work happens on a branch, always.

Suspect a stale cache before chasing a phantom: a type check, build cache or bundler cache can report an error that is not real, tellingly on code nobody touched, so re-run clean before spending a turn on it.

## The reproduce gate

A bug that cannot be reproduced on demand has not been found, whatever the theory says. When it does not reproduce, the work goes back to instrumentation, never forward to a guess. It counts two ways, both real: a script or test that fails reliably on your side, run before and after, or the user following steps you wrote and confirming the failure on theirs. Say which you have, because "it should reproduce if you do X" is a hypothesis wearing the word. If you genuinely cannot reproduce it after the cheap avenues, say what you tried, so "it is absent" stays distinguishable from "I did not look", and fix nothing on a bug you never saw fail.

## The urgency fork

Once it reproduces the fork needs an input the user may not be there to give, so it has a default. **The correct long-term fix wins unless told otherwise**: find what made the bug possible and remove that, because cleaning up the damage is step one, never the fix. **The workaround needs a reason**, and only production being affected or the words urgent, hotfix or shipping now are one. Taking it, say so out loud, say what it does not solve, and write the proper fix down as a follow-up, so it stays a decision rather than a loss.

Never a commit on the default branch in this mode. A debugging session is exploratory, so half of what it produces deserves throwing away, and a branch makes that free.

## The explainer artifact

The other half of the deliverable is a page in a teaching register saying why it happened. Its subject is the cause, not the change: the diff already shows what changed, but not why the code was wrong, why it looked right, or what made this class of bug possible, which is what makes the second occurrence cheaper and the only reason the artifact exists.

- Show the real failing input and wrong output first, then the mechanism underneath.
- Draw anything with parts or a flow: a causal chain in three boxes beats two paragraphs.
- Explain a term the reader has not met where it first comes up, and end on the one thing worth remembering, said once.
- If the setup carries a skill for planning an ambitious visual, load it before building when the mechanism is the hard part, and skip it for a two-sentence bug. Ambition arriving at hour three as a placeholder is worse than a plain page.
- Give it a slug, since that slug is what gets typed into `/approve`.

## The merge request, and then leave

Show the explainer and stop. `/approve <slug>` opens the merge request, ends the mode and closes the board item at once. The trigger is approval of the explanation, deliberately not the fix passing its tests, since a passing fix nobody has seen explained is still unreviewed.

Never merge anything: the mode opens the request and stops, because merging is a judgement on risk and timing that belongs to the user. Never open it before the explainer is read, which would turn the review into a formality. Never stay on after it, because a debugging contract held over unrelated work becomes noise. In a repo with no remote the branch is real and the merge request step inert: deliver the fix and the explainer, and say the merge request is not available here.

## Standing reminder

- Instrument before guessing. The first move is visibility, not a fix.
- Nothing is found until it reproduces on demand, by script or by the user's own hand.
- Correct fix by default; workaround only when it is burning, and say which.
- Branch, explain why in an artifact, open the MR on the yes, then leave.
