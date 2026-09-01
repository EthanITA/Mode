---
name: edge-induction
description: Generate an exhaustive, structured edge-case checklist for ONE domain by inducting on the problem's structure (base cases + inductive step + termination) instead of listing cases from memory. Load when implementing or specifying something NEW or STATEFUL/RISKY: a new schema/table/migration, a state machine, expiration/scheduling/timers, order/money/trade flows, retries/queues, auth/session lifecycle, a new endpoint contract, concurrency. A subagent handed one such task invokes this FIRST, before writing code, to expand its own checklist. Do NOT load for trivial changes with no state surface: copy/text tweaks, styling, a single rename, config value bumps.
user-invocable: true
disable-model-invocation: false
args: "<the one task/domain to analyse>"
---

# Edge Induction

Find the edge cases of **one** feature by *generating* them from the problem's structure, not recalling them from memory. Recalling is the lazy path; this skill replaces "let me list some edge cases" with a decomposition that *forces* the non-obvious ones into view.

**Scope: exactly one domain.** If you were handed several things to build, this runs on ONE of them. Splitting a multi-item request into single domains is the caller's job; this skill is what each single-domain agent invokes.

## What it is (and is not)

Induction proves a claim about infinitely many cases with two checks, a **base case** and an **inductive step**, plus **termination**. Applied to edge-case discovery it is a *generator and a coverage discipline*, **not a completeness proof**. It converts the unanswerable "did I think of everything?" into three checkable questions:

1. Did I cover every **base case** (degenerate/smallest instance)?
2. Did I interrogate every **inductive step**'s preconditions (each state transition)?
3. Did I check **termination** (does every path reach a terminal state)?

Honest limit: it cannot find an edge case in a dimension you never modelled. If the network's unreliability isn't in your model, no amount of inducting surfaces the duplicate-delivery bug. It guarantees structured coverage of the model you *have*, so widen the model first (read the code, the schema, the sibling features) before you induct.

## Step 0: the X/Y/Z read of the assigned task (always first)

Before decomposing, understand the task you were handed. Do NOT trust the one-line subject.

- **X**: what the task literally says.
- **Y**: what it actually requires. Read the real code, schema, and sibling features it touches; widen the model here.
- **Z**: the adjacent work it forces (a migration needs a rollback; a timer needs a cancel path).

Skipping Step 0 means inducting over the wrong domain: you get a tidy, exhaustive checklist for a problem that isn't the one asked.

## The worth-it gate: run or skip?

| Run edge-induction | Skip it (just do the task) |
|---|---|
| New schema / table / migration | Copy / text / i18n string change |
| State machine, status transitions | Styling, spacing, colour, class rename |
| Expiration, scheduling, timers, TTL | A single symbol rename |
| Order / money / trade / balance flows | A config value bump with no logic |
| Retries, queues, at-least-once delivery | Adding a log line |
| Auth / session / token lifecycle | Pure formatting / lint fix |
| New endpoint or contract | Deleting dead code |
| Anything concurrent or time-dependent | |

Rule of thumb: **if the thing has state, time, money, or a lifecycle, run it. If it's cosmetic or stateless, skip it** and say you skipped it (one line) so the skip is visible, not silent.

## The five buckets: each one emits checklist items

Work them in order. Each bucket is a prompt you answer *against the real code*, and every answer becomes a task via `TaskCreate`.

```
 1. INDUCTION VARIABLE(S) — what grows or advances?
        time · size · depth · event-count · retries · quantity · position-in-book
        Pick ALL that apply. The axis you choose decides which edges you find:
          induct on TIME        → timer / expiry / clock bugs
          induct on EVENT STREAM → ordering / race / idempotency bugs
          induct on STATE        → invalid-transition bugs
        A thorough pass inducts on every axis that applies.

 2. BASE CASES — the minimal / degenerate instances (most bugs live here)
        zero · null · empty · one · already-done · past-dated · boundary "== now"
        For each axis: what is its smallest value, and what does the code do there?

 3. INDUCTIVE STEP — for each transition sⁿ → sⁿ⁺¹, list its PRECONDITIONS.
        Each precondition that can be violated = one edge case.
        The preconditions ARE the invariant (what must hold at every step).
        TWO steps firing at once = the concurrency edges (race, double terminal-state).

 4. TERMINATION / well-foundedness — does every path reach a base/terminal state?
        What stalls the shrink? (tick never arrives, clock runs backward, clock skew,
        orphaned timer, infinite retry) — these are the LIVENESS bugs, the
        "no floor under the dominoes". Missing here = the feature silently never finishes.

 5. OUT-OF-DOMAIN — events before the base or after the terminal state.
        A confirmation arriving AFTER we already finished · a duplicate terminal event ·
        an action on an entity that already left the domain for another reason.
```

## Output: a checklist, not prose

Emit the findings as a `TaskCreate` sub-checklist for this one domain, grouped by bucket, each item phrased as a concrete decision or test:

- Base: "expiry == now: decide inclusive vs exclusive boundary; add test."
- Step: "partial fill at expiry: decide remaining-qty vs whole-order expiry; guard the race."
- Termination: "timer lost on restart: prove every live order reaches a terminal state."

Then implement against that checklist. Tick a box only when the item is decided *and* covered (code and test), so a tick is a receipt rather than an intention. Report the count: N base, N step, N termination, N out-of-domain, and the ones you consciously ruled out-of-scope, so the coverage is auditable.

## One worked pass (reference): "expiration for a trading order"

- **Variables**: wall-clock time *and* the event stream (both apply).
- **Base**: expiry in the past at creation, expiry `== now` (inclusive?), zero or negative duration, no expiry set (GTC null), already filled before expiry runs.
- **Step**: partial fill at the boundary, cancel racing expiry (double terminal-state), amendment changes expiry with a timer already armed, duplicate expiry event (idempotency), DST and session-close vs midnight.
- **Termination**: tick never arrives (GC or restart), clock runs backward (NTP), clock skew between matching engine and expiry service.
- **Out-of-domain**: fill confirmation arrives after we expired the order, forcing reconciliation of a trade break.

Buckets 3 and 4 produced the non-obvious ones (clock-backward, duplicate-expiry idempotency, fill-after-expiry): proof the method beats listing from memory.

## Conclusion

Induct on structure and you get a checklist, not a guess. Base, step and termination is the whole ritual; the checklist it emits is auditable and the skips are visible. Not a completeness proof, but it turns "did I miss something?" into three questions you can actually answer.
