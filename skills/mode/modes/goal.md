---
name: goal
summary: Loop until it is truly done, verified for real and audited clean, twice in a row.
color: cyan
enter-when: loop until|keep going until|keep iterating|iterate until|until it passes|goal mode
exit-when: manual
deliverables: change
steps: implement, verify@test, audit@agent
loops: verify>implement, audit>implement, audit>verify
---

# Goal mode

The user named an outcome and wants it genuinely reached, not plausibly. "It works" is half of done; "it holds the bar this project sets" is the other half, and they interact, since a compliance fix can break behaviour and a behavioural fix can break compliance. So the mode is a loop that ends only when both gates pass twice in a row. It exists to stop the almost-finished deliverable: the change that ran once, read well to its author, and came back next day with three faults a stranger saw in a minute. The author is the one person sure to miss them, so the second gate is never run by you.

Implement, then verify for real, back to implementing on a failure. A pass with its output quoted goes to a fresh audit, and findings send you back to implementing. A clean audit counts a round; until two clean rounds run in a row, verify again; then report the rounds and the receipts. Any fix, functional or compliance, restarts the count, because a change is unverified by definition.

## Gate one: it runs, and something real says so

A claim is not a receipt. The gate is a channel, anything that answers from outside your reading of the code: a test run, a command's exit code and output, an HTTP response body, a log line appearing after the action that writes it, a row read back from the store, a page driven in a browser. Rereading the diff is not a channel, because it cannot disagree with you.

- Exercise the real path, running the app, the flow or the command, not only the type check, with the setup's skill for running the project if it has one.
- With no channel, build one first: a throwaway script that calls the thing and prints what came back costs less than being confidently wrong.
- The first time a channel is trusted, break the change once on purpose and watch it notice, then put it back, since a check passing against broken code was never watching.
- Quote the real output in the round's report. Driving a browser to prove behaviour is allowed here; judging how anything looks stays the user's.

## Gate two: fresh eyes, and no help

Never audit your own diff in the context that wrote it, because author bias survives every reread. Each round spawns a new subagent given only the working directory and the list of touched files: no summary, rationale or defence, since the diff must speak for itself as it will to the next reader. The auditor reads the project's bar itself (the stated conventions, the lint and formatter configuration, the cleanest neighbouring files) and judges the diff hunk by hunk against that bar and the scope of the ask. A finding is a location, the rule it breaks and the fix; a pass is per rule with the evidence; "looks fine" is not a result. A new subagent each time is what makes two consecutive clean rounds independent by construction.

## The loop

Implement, or take the work as it stands. A gate-one failure is diagnosed and fixed and the loop restarts. Every gate-two finding is fixed and the loop restarts, because a compliance fix ships unverified otherwise. A round where both gates pass clean is a clean round, and done is two in a row. Report the rounds taken, what gate one executed with its quoted output, and the audit's verdicts. Never end a turn mid-round: end on a clean round, a restarted loop with its reason named, or a blocker you can name and provably cannot clear.

- **Scope.** The audit judges what this diff introduced. Older debt is reported, never absorbed, and the loop never widens into a sweep of the repo.
- **Convergence.** When two rules genuinely collide and block a clean round, that fork is the user's: name the exact collision and stop rather than oscillate between the fixes.
- **Honesty.** A verdict with no receipt is not a pass on either gate, and confidence is stated in words: executed, read but not run, inferred.

`enter-when` matches an ask to keep at the work until it is truly finished, usually after a first attempt was called done and was not. `exit-when: manual`: only `/mode off` ends it, because two clean rounds finish the ask, not the contract, and the next outcome earns the same loop.

The recorder sees the verify runs and each audit spawn, so the pipeline moves on real events. No hook can see whether a round was honestly clean, so the two-in-a-row claim rests on the receipts you quote, which is why they get quoted.

## Standing reminder

- Done is two consecutive clean rounds: verified through a channel that can disagree, then a fresh audit with no findings.
- The audit is a new subagent handed the touched files and no defence. It reads the project's bar itself.
- Every fix restarts the loop, and a verdict without a quoted receipt is not a pass.
- Never end a turn mid-round: end on a clean round, a restarted loop, or a named blocker.
