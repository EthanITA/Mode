---
name: showpiece-prompt
description: Author a high-performing one-shot generative prompt (demo page, visualization, artifact, "write me a prompt for X") using the six-slot anatomy: pre-decided architecture, term-of-art retrieval keys, banned shortcuts, quantified acceptance, named references, feasibility pre-clearance. Load when the user asks to write/craft/improve a prompt for a generative deliverable, or says "showpiece prompt". Do NOT load for prompts that are agent system prompts or for ordinary task instructions.
user-invocable: true
disable-model-invocation: false
args: "<what the prompt should make the model build>"
---

# Showpiece Prompt

**Goal: turn a vague "make something impressive" idea into a prompt where every decision the executing model handles badly is already made, so the model is used as an expert executor, not an architect.** The output is the prompt itself: dense, enumerable, one-shot-able.

## The anatomy lives in `create-artifact`

**Read the `create-artifact` skill's `references/showpiece.md` first.** It is the canonical statement of the task-selection gate, the six slots and the per-medium hardening list. It is not repeated here, because two copies drift and the copy nobody edits is the one that gets read.

The difference between the two skills is only who executes. There, the user is building and settles the slots for themselves. Here, the slots get written into a prompt for a model that will build. Same six, same gate, same hardening.

**If the user wants the thing rather than a prompt for the thing, that is `create-artifact`.** This skill's deliverable is text they will paste somewhere else.

## What is specific to writing the prompt

### Research the architecture yourself

Pick the known-good design and validate it this session, from docs or a reference implementation. The prompt must state the architecture **and the reason it works**, because the stated reason is what the executor preserves when it hits a decision you did not anticipate.

### Format

- **One concern per line**, roughly eight imperative lines: constraints, visuals, mechanics, content, motion, performance, delivery. The structure is a checklist the executor iterates over.
- **One named deliverable with a binary run condition.** "A directly runnable index.html." "Runs from a basic static server."
- A role line ("You are a senior graphics engineer") is optional garnish. Vocabulary density does most of that work already.

### Lint before delivering

- Is each of the six slots present? Anything missing is a delegated decision, so confirm it is one the executor is actually good at.
- Is every acceptance criterion checkable **by the executor**? Only ask for verification results when it can genuinely run the thing. In pure chat that line produces fabricated verification.
- Are the numbers counted rather than decorative? An uncheckable "21 parameters" invites claimed compliance.

## Condensed few-shot, the shape to hit

> Visualize satellite trajectories (CelesTrak TLE + satellite.js) as a real-time 3D globe.
> **Data**: CelesTrak TLEs, ~12,000 satellites. No registration, API key, or rate limits.
> **The clever part**: fetch TLEs once per ~2h; satellite.js runs SGP4 propagation in-browser, so positions compute locally at any timestamp. Real time comes from physics, not polling.
> **Visual bar**: thousands of Starlink satellites as a glowing shell; orbital paths plus coverage footprints. References: Track The Sky, satellitemap.space.
> **Difficulty**: minimal. Frontend-only, no backend.

Every sentence is one slot doing its job: architecture and why, pre-clearance, quantified scale, references, scope cap.
