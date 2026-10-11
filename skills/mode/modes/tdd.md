---
name: tdd
summary: No implementation line exists before a test that fails for the right reason.
color: green
enter-when: tdd|test-driven|test driven|test first|test-first|write a failing test|write the test first|write tests first
exit-when: manual
deliverables: change
no-code-without-red: true
steps: cases, reduce, direction, red?@test-fail, green@test, refactor
loops: refactor>red
---

# TDD mode

One rule holds the mode up: no implementation line exists before a test that failed for the right reason. Written loosely it degrades into writing a test at some point, which needs no mode; written tightly it forces three decisions before the first assertion and one discipline inside every lap.

`enter-when` matches somebody asking for the discipline by name, the term of art and the phrases people type, and none is a bare `test` or `tests` on purpose: "the tests fail" is a symptom for debugging, and "add tests for the parser" may be a backfill over working code, useful but not this. `exit-when: manual`: only `/mode off` ends it, because a session carries several behaviours and clearing on the first green would leave every later lap unprotected.

For each behaviour, enumerate cases from structure rather than memory, reduce to the minimum set and pick a direction by grepping for an existing caller, once and in that order, before any test is written. Then lap: red (watch the assertion fail, and fix a test that died on an import or a typo), green with the least code, refactor with the suite green, and the next behaviour starts a new red, until the minimum set is green and nothing is left to redden.

## 1. Enumerate

Never list cases from memory. Induct on the behaviour's structure along five axes:

- **What grows**: the quantity that gets larger each step (items in a list, tree depth, retries, bytes buffered), with the base case at zero and the step from n to n plus one.
- **Degenerate cases**: empty, exactly one, absent, the maximum, one past it, anything a loop can run zero times.
- **Preconditions of each transition**: every edge of anything with states has something that must hold before it is legal, earning two cases, taken when it should be and refused when it should not.
- **Termination**: what stops the loop, and what happens when that never arrives.
- **Out-of-domain events**: the unplanned input in the unplanned state, a cancel during a retry, a second call before the first returned.

The edge-induction skill ships with this plugin, and this is the gate that loads it.

## 2. Reduce

Two cases driving the same branch to the same observable outcome collapse into one test. Observable means what a caller can see: a return value, a raised error, a recorded side effect. Internal state no caller can reach deserves no test. A suite hitting one branch nine ways costs nine times the maintenance and catches the same one bug, so keep the clearest case, drop the rest, and note in one line what collapsed into what, keeping the coverage claim honest. Exhaustive was the input; the minimum set is the target.

## 3. Direction

Outside-in or inside-out turns on whether the contract is already frozen, and one grep for an existing caller of the identifier answers it. Nothing found means it is not fixed yet, so go outside-in: the test names the interface before it exists, putting design pressure on the signature while moving it is free. A caller found means it is frozen, so go inside-out with real objects, because a mock of a frozen contract only re-asserts what you believe. Say which you took and what the grep found, so the choice can be argued with later.

## 4. Red, green, refactor

One behaviour per lap, since a lap covering three has three chances to go green for the wrong reason. **Red**: write the test, run it, read the failure, which must be on the assertion. **Green**: the least code that passes, not the general or elegant version, because generality before a second case is a guess wearing a pattern's name. **Refactor**: clean up with the suite green, adding no behaviour, since new behaviour needs a new red.

**Red means the assertion fired.** A test dying on an import error, a missing fixture, a syntax error or a typo in a name is broken, not red, proving only that the file does not run. Read the failure text before writing implementation: a `ModuleNotFoundError`, a `NameError` in the test's own scaffolding or a collection error means fix the test and run again, and only an assertion message describing the behaviour you meant to pin passes the gate. A test passing on its first run is not red either: the behaviour already exists, so find out what it really asserts, or the assertion is vacuous. The failure message is part of the test, so a stranger reading that line alone learns what broke, and `assert result == 3` is worse than one naming the behaviour.

So a test is never written after the code works, cases come from a structured pass then a reduction, a frozen contract gets real objects rather than convenient mocks, and the report is "it failed on the assertion with this message, then passed", never just "the tests pass". Refactoring happens green and never rides with new behaviour.

## A hook enforces this

`no-code-without-red` arms a guard that refuses the edit rather than reminding you: writing the implementation first is denied, not discouraged. It judges only a file whose extension carries behaviour, outside a test directory, with a name that is not test shaped. It never judges Markdown, JSON, YAML, CSS, fixtures or any test file wherever it lives, so the test is always writable. It opens on one condition, a suite the recorder watched exit non-zero with no passing run after it, the red read off the run rather than a claim. A green closes the lap, and the next implementation edit waits for a new red.

- **The guard cannot see why a run failed.** An import error exits non-zero and opens it, so keeping red meaning the assertion is still yours. It stops the common failure, skipping the test entirely, without certifying the assertion fired.
- **The test file is never refused**, since writing, fixing and rerunning it is the only way to reach a red.
- **It can be switched off.** `"guards": "off"` in `~/.claude/mode/config.json` disarms every guard and `/mode off` ends the mode, neither a loophole to reach for mid lap, but a way to drop out loud a rule that is wrong for this repo rather than work around it.

`mode why` prints whether the gate is open now and what would open it.

## Standing reminder

- No implementation line before a test you watched fail for the right reason.
- Red is the assertion firing. An import error or a typo is a broken test, not a red one.
- Enumerate the cases, reduce to the minimum set, pick a direction and say which.
- A guard refuses the edit while no red stands. Say which lap you are on, and quote the red.
