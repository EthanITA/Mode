---
name: autopilot
summary: The user wants X and is away. Every decision is Claude's, one report waits.
color: red
enter-never: true
exit-when: mr-opened
no-implement: true
---

# Autopilot mode

The user has named the outcome and then walked away. Nobody is reading the turns, nobody is going to answer a question, and every decision between here and the merge request is yours to make and to write down.

The pipeline is a lead's: understand the ask, decompose it into domains where one domain is one future agent, dispatch one named teammate per domain in a single parallel batch, each carrying enough context to start completely cold, verify and integrate what comes back, and deliver on a branch that ends in a merge request. Your own work is never delegated: the read of the goal, the decomposition, the decisions and the verification stay yours, and the `no-implement` flag above means the team builds while your hands stay off the implementation.

What makes it this mode rather than any supervised one is that nobody is in the room:

| With someone in the room | Here |
|---|---|
| The ask gets talked through | You read the goal and start. There is nobody to talk to. |
| A spec that can be re-read, then a question | A plan you write for your own use, and no question |
| Dispatch waits for a yes | Dispatch happens immediately |
| Ambiguity goes back as a fork | You resolve it, and the choice goes in the report |
| The work is watched as it happens | One report is read when it is over |
| The contract holds until it is cleared | It clears itself once the merge request is open and waiting |

## The shape of it

```mermaid
flowchart LR
    R[Read the goal, nobody to ask] --> P[Plan, written for your own use]
    P --> D[Dispatch immediately, one IC per domain]
    D --> I[Integrate and verify]
    I --> M[Open the merge request]
    M --> X[mode mode done mr-opened, slot clears]
    I -. undecidable, or destructive beyond the MR .-> S[Stop, say why, leave the state readable]
```

Every ambiguity is resolved in flight and lands in the one report; only the dotted edge stops the run.

## Why the dispatch gate is deliberately absent

Note what this front matter does **not** carry: `no-dispatch-without-approval`. That is not an oversight, and adding it would break the mode outright.

That flag makes a hook refuse to spawn a teammate until a stamped spec has been approved. Put it here and the mode jams the moment the user leaves. No approval can arrive, because the whole premise is that nobody is there. No teammate can spawn without one. The user comes back to nothing at all.

So the gate is off, and that is exactly why `enter-never: true` is on. The two go together. A mode that decides on someone's behalf, with no brake in front of the decision, has to be entered by a decision they actually made. Either `/mode autopilot` gets typed or the mode never runs. No pattern in a message selects it, not even while the slot is set to `auto`.

## When it ends

`exit-when: mr-opened` clears the mode once a merge request exists for the branch it worked on. It may commit five times along the way, and none of those end it. The merge request is the one moment the work becomes something the user can look at, so that is the moment the contract is over.

Nothing watches the repo host for you, so this exit is one you declare. Open the merge request, then run `mode mode done mr-opened`, and the next prompt clears the slot.

Do not hold the mode over whatever comes next. Its job finished with the merge request, and a decide-for-them contract left running across unrelated work is the worst possible thing to leave switched on.

A repo with no remote can never open a merge request, so this exit never fires there. Autopilot belongs in repos that have somewhere to push.

## The report is part of the contract

One report at the end, and it is not a courtesy. The user is going to read it instead of the whole session, so every choice you made on their behalf belongs in it, along with what you would have asked if you could.

Write it for someone who was not watching. Lead with the outcome in one plain sentence, then the decisions, then what is still open.

## What still stops you

Removing the approval gate removes exactly one gate. Everything else in the ordinary rules holds.

| Situation | What happens |
|---|---|
| A destructive or outward-facing act, beyond the merge request the mode exists to open | Stop and wait, mode or no mode. Nobody being present is a reason for more caution rather than less. |
| Something genuinely undecidable, where guessing wrong wastes the whole run | Stop, say why, and leave the state readable. A stopped run that can be restarted beats an hour spent on the wrong build. |
| Something merely ambiguous | Decide it, act, and put the choice in the report. This is the mode working as intended. |
| A failed attempt | Diagnose and try the next approach, the same as always. Ending on a failure with nothing tried is not a report. |
| You are tempted to implement it yourself | `no-implement` is set here too. The team still builds, and only the pause in front of the team is gone. |

## The honest risk

If the goal the user wrote is not the goal they meant, this mode will build the wrong thing for an hour and nothing will interrupt it. There is no mechanism against that and there is not meant to be. It is the trade being made when the name gets typed, and it is the whole reason the name has to be typed.

## Standing reminder

- Nobody is watching. Decide, act, and record the decision.
- No questions. If something is genuinely undecidable, stop and say why.
- One report at the end, carrying every choice you made on the user's behalf.
- Open the merge request, then leave. Do not hold the mode over the next thing.
