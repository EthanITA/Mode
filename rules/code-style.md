---
paths:
  - "**/*.{ts,tsx,mts,cts,vue,js,jsx,mjs,cjs,css,swift,py,sh,bash,zsh,sql,java,kt,go,rs,rb}"
---

# Code style

**Purpose:** how code is written, in every language and every repo: comments, shared modules, structure, errors, change over time, and the TypeScript, Vue and Nuxt idiom.
**Loads:** automatically the moment a source file in any language is read or touched, and on demand before writing, planning or reviewing code when no source file is open yet.
**Never put here:** a repo's domain, stack or product policy goes to that repo's `CLAUDE.md` · how work is verified or a turn runs goes to `~/.claude/includes/` · prose people read about the code, such as MR descriptions and tickets, goes to `on-demand/outbound-writing.md`.

**Every repo, no exceptions: a repo's own `CLAUDE.md` gets no style override.** Most of what such a file says about style is this file echoed back; the remainder is drift, usually from AI-generated code. Where a repo's stated convention contradicts a rule here, this file wins: follow the global rule in new code, treat the local habit as debt, and never migrate the repo as a side effect of an unrelated change.

Every section up to **Languages** binds in every language. From **TypeScript and Vue** on, the rules are TypeScript, Vue and Nuxt specifics.

## Comments · fires: every line, every language

**Comment why, never what. Default: zero comments.** Every comment is LOC bloat until proven otherwise.

Explicitly banned, no exceptions:

- **File-header blurbs**: a comment block at the top of a file describing what the file does. Usage goes in the README or `package.json`, not the source.
- **Usage / example blocks.**
- **Docstrings that restate the signature.** `/** The full question. */` above `question: string` is noise. So is `/** True when the event comes from an editable field. */` above `isEditableTarget()`.
- **A comment on a variable, a field or a line inside a body.** A why sits above the function, store or class it explains, so the reader meets it at the declaration.
- What the code does, types and signatures, section banners, PR/ticket context (that's the commit message), obvious idempotency or no-ops.

Add a comment ONLY when one of these holds:

- **(a)** The logic is genuinely complex or non-obvious and the comment saves real reading effort.
- **(b)** The code intentionally diverges from what a reader would expect, for a specific reason: a hidden constraint or invariant the code can't express, a bug/quirk workaround (link it), or a deliberately-rejected obvious alternative.

Neither holds means no comment. Prose-essay comments fail even when they explain a why: keep it to one terse line.

When sweeping a file, **delete** redundant comments. Applies everywhere, including scripts and tooling.

This is the most commonly violated rule. Weight it accordingly.

## Shared modules over inline logic · fires: before writing any logic

**Logic that could serve more than one caller is a shared module named in the domain's own words, never written inline where it happens to be needed.** This is the structural rule that matters most, because it is what keeps code readable by domain: the call site reads as the domain (`bus.publish("transcript.grew", growth)`) while the mechanism lives once, under a name you can find. A pub/sub wired by hand at each producer is a bus asking to exist, and the same holds for polling, retries, caches, watchers and locks.

- **Look before writing.** Grepping the repo and reading the dependency list is part of writing the line, not a step before it. When a module already does the job, extend it in place rather than writing a second one beside it. Two mechanisms for one job, such as a second emitter, a listener `Set` or a per-connection watcher next to an existing bus, are the tell.
- **Where the mechanism comes from.** The platform first (`Date`, `Intl`, `URL`, `structuredClone`, `AbortSignal.timeout`, `crypto.randomUUID`), then the framework's own helpers (Nitro's cache and hooks, vueuse's `useEventSource` and `useIntervalFn`), then a dependency already installed. Past that, a small pattern whose vocabulary is ours, such as a bus or an event log, is a shared module written once and generically, and a pattern full of edge cases we would keep fixing, such as cross-platform file watching, locks, retry with jitter or scheduling, is the well-known library for it. A library that makes the code read better is reason enough to add one. A framework is never rebuilt, so it is Nitro, Pinia and zod, never a home-made server, store or validator.
- **Generic means typed by the caller.** A shared module takes its domain types as parameters (`createBus<Events>()`), so each app gets full call-site safety and the module itself knows nothing about any one domain.
- **One bus per app.** An app has exactly one typed pub/sub. A source has one producer (one watcher, never one per open connection), consumers subscribe and keep their own logic, and a new event joins the bus rather than adding a mechanism. An event that crosses a process goes through the app's one durable log.
- **A second reaction to the same happening means the bus is due.** Once two things react to one event, the producer publishes it and each reaction subscribes, even in a small app. A producer calling each reaction itself, such as an audit line written from the store and again from the watcher, is the tell.
- **A hand-cut regex for a standard format is the loudest tell.** `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/` is an ISO-8601 check that `Date.parse` and every date library already do, and the hand-rolled one is now yours to keep correct. When nothing covers the job, say so in one line rather than building in silence.
- **Reuse the design system before writing a component; this IS code style, not a nicety.** Inventory what exists and map each piece to a builtin. Reviewers keep flagging re-implementation. When a builtin misses the feature you need, **extend the builtin itself** (never fork it, never re-implement beside it); the per-project policy (approvals, breaking-change limits, comparison artifacts) lives in that project's `CLAUDE.md`.

## Structure · fires: every new file, module, folder or branch

- **Readability first**: readable, low-verbosity, simple. Prefer concise over defensive/verbose. Avoid needless abstraction/wrappers/indirection.
- **Lines stay within the formatter's width.** A repo with no formatter config keeps them under 120 columns, and a long call, expression or object literal breaks one item per line rather than running on.
- **"Simplify" means consumer DX, not LOC**: attack friction (autocomplete noise, file size, prefix repetition, hidden hierarchy), recursively until further splitting/renaming would hurt. Don't widen a module-local `const` to an `export` unless a consumer needs it: that's added surface, not simplification.
- **Folders are the framework's kinds on top and domains inside.** Keep the framework's kind folders (`components`, `composables`, `stores`, `server/api`, `server/utils`) and group by domain inside each one, with one curated `index.ts` per domain. Outside a framework, the top level is domains.
- **A file you touch past about 300 lines, or holding a second concern at any length, is split by domain in the same change.** The boundary is the file you touched: never sweep the repo, and never half-migrate.
- **Name variant files after the discriminant value.** A component dispatching on `chartType: 'bar'|'line'|'pie'` splits into `chart/bar.tsx`, `chart/line.tsx`, `chart/pie.tsx`, nested in a by-concern subfolder, not flat PascalCase files (`PieChart.tsx`) in the component root.
- **Effects live at the edge.** Domain logic takes data and returns data. The edge that owns the job (a route handler, a Nitro plugin, a composable, a CLI command) does the I/O, holds the timers and catches what it is accountable for, so the logic is testable without mocks.
- **External input is parsed once, at the edge, through one schema.** Files, CLI flags, environment variables, request bodies and foreign JSON go through a schema that both validates and types them (zod in TypeScript, the platform's decoder elsewhere), so everything past the edge holds data already known to be right. A cast on parsed input (`JSON.parse(raw) as Message`), a bare `Number(flag)` or a hand check per field is the tell, because whatever those miss gets stored as `null` or `NaN`.
- **A state with several phases is one value.** A discriminated union held in one place and changed only through one `next(from, event)`, whose transitions are a `Record` keyed on the event kind rather than a `switch`. Never several booleans that separate functions flip and every reset has to remember one by one.
- **Branching stays flat.** Return early, never `else` after a return, and at most one level of ternary. Deeper branching on a value is a `Record` lookup keyed on it.
- **Configuration is never hardcoded.** Users, passwords, environments, URLs, file and folder paths, intervals and limits come from config or the environment, with a default where one makes sense. A file you touch has its hardcoded ones moved there, and a new one never starts hardcoded.
- **A value lives where it is read.** A constant one function uses sits inside that function. A module-level or auto-imported constant is for values several files share, because a reader has to be able to see where a value comes from. This is about constants: logic that belongs to a shared concern, such as formatting money for one more output, goes into that concern's module even while it has a single caller.
- **A name that exists in code is referenced, never retyped as a string**: `BackfillWorkflow.name` or the exported constant, not `"BackfillWorkflow"`.

## Errors and logging · fires: every call that can fail

- **Logic throws.** An async function rejects on failure and resolves to the value on success, with no `{ ok }` result object to check at every call. The one exception is a reactive UI composable, which exposes failure as state so Vue can react to it: `const { state, data } = useApi()`.
- **The accountable caller handles a failure, nobody else.** It is caught by the code that can act on it, with `.catch()` on that call (`const user = await getUser(id).catch(toNotFound)`). Everything in between lets it propagate to the parent that owns it, and `try` only wraps several awaits that fail together. A catch that records the failure and rethrows makes two owners, so one failure gets handled twice: handle it there and stop, or let it pass untouched.
- **Logs are for failures and a trail.** Temporary debug logs come out before commit. Every catch and crash path logs once, with the context needed to act on it, through the project's logger when it has one. Long-running things (workers, agents, watchers, a resident app) also log one info line per meaningful state change, so a crash has a trail behind it.

## Change over time · fires: when a bug is fixed, or a feature, stored data or a contract changes shape

- **A change solves the problem, not the symptom.** Find what made the bug possible, or what the new requirement exposes in the code's shape, and fix that rather than adding a guard, a flag or a special case where the symptom showed up. A value stored as `NaN` is fixed by parsing the input through its schema at the edge, not by checking for `NaN` where it surfaced.
- **An abstraction models the behaviour as it is now, so a feature that changes shape gets its code reshaped, not patched.** Before writing the change, ask whether the code would be designed this way had the new requirement been there from the start. When it would not, refactor to that design first, in its own commit, then add the change as one more case of it. A patch shows as a flag or mode parameter threaded through existing functions, the same `if (kind === …)` in every function that touches the thing, a sibling copied and edited, an optional field only one case ever fills, or an adapter turning the new shape back into the old one.
- **Migrate, never keep compatibility.** Stored data changes through a one-off migration script run separately against the database URL, carrying its own snapshot of the types it reads, because app types move on and a migration has to keep meaning what it meant. The app keeps no read-time mapping of old values and no dual-shape support. A contract changes in one go, with every caller updated in the same change.
- **A contract the user defined changes only when asked.** Reshaping a getter or a consumer interface to suit an implementation is out of scope, however tidy it looks.
- **An MR carries only what the change needs, and the reshaping it forces is part of that.** A refactor the change makes necessary is not an unrequested one: it rides in the same MR as its own commit, kept apart from the behaviour, and stops at the code the feature's shape reaches, never a repo sweep or half a migration. When the reshaping would dwarf the feature, say so with its size before writing either, rather than patching to keep the diff small. Anything else that came up is its own change, so the diff a reviewer reads stays the size of the ask.

## Languages · fires: choosing what to write a script, hook or tool in

- **TypeScript by default: author `.ts` (`.tsx`/`.vue`), never `.mjs`/`.cjs`/`.js`, and no new Python, jq or shell logic**, including scripts, hooks, ESLint rules, config helpers and other tooling. `node` runs a `.ts` file directly, so there's no need to drop to plain JS for "just a script." A shell launcher exists only when a tool must sit on `PATH`, and it does nothing but exec `node` on the `.ts`. Server logic lives in the app's own TypeScript server, never in a side script in another language.
- **Existing Python and shell follow every rule above but are not rewritten unless asked.** Swift and SQL follow the sections above, plus their platform's own conventions.
- **A repo's shell helpers live in its `.envrc`**, never in the user's `.zshrc`.

## TypeScript and Vue · fires: every .ts, .tsx or .vue edit

- **Functions are const arrows**, top level and inline: `export const load = (id: string): Promise<User> => {...}`. A `function` declaration only where overloads or `this` need it.
- **`interface` for object shapes, `type` for unions, mapped and derived types.**
- **`for...of` over `forEach` and `reduce`, and `await` over `.then` chains**, with `.catch()` kept for the accountable call.
- **Files are kebab-case or one word**, never camelCase or PascalCase.
- **Single-row queries**: array-destructure inline, `const [row] = await db.select()...; return row;`. Never an intermediate `rows` var.
- **`undefined`, not `null`, for "no value"**: return types, refs, optional fields. `null` only when an external contract demands it (DB columns, foreign JSON, drizzle inserts). A helper you author returning `Promise<T | null>` is wrong; return `Promise<T | undefined>`. **Optionality is `?:` and nothing else**: `quantity?: number`, never `quantity: number | undefined`, never `quantity?: number | null`. **Never test absence by comparison**: `!adj` / `!!adj` / `Boolean(adj)`, never `adj !== undefined` or `adj !== null`. Needing `0` or `""` to survive that guard means the field wants a real default, not a comparison back to `undefined`.
- **3+ positional params is a smell**: take a single destructured options object, export its type, give optional fields defaults in the destructure, keep the explicit return type. When asked to fix this, sweep **every** function in the file, not just the one named.
- **Vue props**: destructure for defaults, `const { type = "default" } = defineProps<{ type?: string }>()`. `const props = defineProps(...)` is sometimes fine.
- **`<button>` always carries `type="button"`** unless it genuinely submits a form: HTML defaults to `submit`, so an unmarked button inside a form navigates instead of doing its job.
- **`ref` is never nullable by default**: `ref<T>()` (implicitly `T | undefined`), not `ref<T | null>(null)`. Matches the `undefined`-over-`null` rule above.
- **Vue classes**: reuse the project's stylesheet classes. Static styling goes in `class="..."`; a reactive override or append goes in `:class`. Lists via array `['c1', dyn]`; conditionals via object `{ 'c': cond }`, never ternaries inside arrays.
- **`:data-*` bindings are the raw value; the CSS matches it explicitly.** `:data-floating="floating"` with `[data-floating="true"]`. Never coerce to make a presence selector work: `value || undefined`, `value ? '' : undefined` and friends hide both states behind a trick. A state whose _presence_ is the whole meaning (no false case) may bind the value directly and be selected bare.
- **Style with Tailwind and the design system's tokens, never hand-written CSS or an arbitrary value.** A scoped `<style>` keeps semantic selectors whose bodies `@apply` existing tokens, not a template full of utilities, which sit in `@layer utilities` and lose to any scoped rule on the same element. Take the design system as the reference (`@cela/design` in a Cela product): type is a `typo-*` utility plus a `font-*` when the weight differs, radii are `rounded-box`, `-field`, `-selector` or Tailwind's scale, colours, durations and eases are the palette's, and a size is the spacing scale or a fraction, so `text-[12.5px]` or `rounded-[20px]` snaps to the nearest token, and an override of a radius the design system's own component already sets is deleted. A token a component needs goes into `@theme` so it has a utility, a helper several components share is an `@utility`, and a bracket or raw declaration stays only where no token can say it: a keyframe `animation`, SVG geometry such as a designed `stroke-width` or a transform origin, which keeps the design's value rather than snapping, `content`, a `calc()` over a runtime variable, a one-off grid template.
- **Reach the design system through `@apply`, not a `:class` object.** A `:class="{ 'glass': variant === 'glass' }"` beside a `:data-variant` stamps the same state twice, once as styling in the template. Register the look as an `@utility` so the `[data-*]` rule can `@apply` it. In Tailwind 4 a class defined in a plain `@layer utilities` block is _not_ `@apply`-able; only `@utility` registers it.
- **Markup, style and behaviour stay in their own layer.** Script decides what is _true_, CSS decides what that _looks like_, template says where it goes. A computed returning a class string is styling that leaked into TypeScript: put the state on the element (`:data-status`, `:data-variant`) and let CSS select on it. A per-state `Record<State, string>` of Tailwind classes in `.ts` is the tell.

## Domain namespaces · fires: every export

Every top-level export is a tax on every keystroke, forever. `googleLogin`/`googleSignout`/`gsapInit` scatter one domain across the global surface and are findable only if you already know the name; `Google.login()` lets you type the domain and have the language server enumerate the rest.

- **A shared prefix is a namespace asking to exist**: collapse it before the second export. Split the domain by concern behind one curated `index.ts`: an **allowlist, never `export *`**, so what you omit stays private. Merge value and type under one name (`export const Slack = {…}` with `export namespace Slack { export type … }`) or a flat `SlackOAuthSuccess` survives beside it.
- **Name it after the capability you own, not the vendor you rent**: `motion` not `gsap`, `mail` not `resend`. Swapping the library must not rename a call site.
- **Namespace the return, don't ship siblings** (`useThreadMode(id)` returns `{ mode, defaultMode }`), and stop before ceremony: a lone function needs none, don't pre-split, two levels is the ceiling.

## Nuxt · fires: every Nuxt project

- **SPA only: `ssr: false` in every Nuxt project's `nuxt.config.ts`.** All rendering is client-side; never add SSR or assume server-render. Content that must render **outside the running app** (offline preview, or publish-time pre-render of a document) uses a **standalone build script**: Vue `renderToString`, or a headless-Chromium snapshot for components that aren't SSR-safe. That's a build tool, not a change to `ssr: false`.

- **Shared state is a Pinia store, never `useState`.** Anything two components read or write lives in `app/stores/<name>.ts`, setup-style `defineStore`, exported as `$<name>` with no id (`export const $artifact = defineStore(() => {...})`): the build takes the id from the variable. Use it whole, `const artifact = $artifact()` then `artifact.isFull = true` and `artifact.open()`, and never destructure its state, which cuts it off from the store. The `$` marks a store and `use` marks a composable, so never `use<Name>Store`. A composable is reusable logic, not a home for state.

## Typing · fires: every exported surface

Type safety is a deliverable, not optional: consumer DX (autocomplete, type hints, compile-time errors at the call site) depends on it.

- **Type every function thoroughly.** Public/exported surface: explicit param types and an **explicit return type** (guards against silent widening, sharpens hints); inference is fine for locals/internals. This includes exported composables and hooks: `export const useThreadMode = (id: string) => {...}` with an inferred return type is a miss.
- **No implicit `any`; prefer `unknown` plus narrowing over `any`.** Explicit `any` in a throwaway script is still `any`: the rule has no script carve-out.
- **Reach for the precise tool, the simplest that gives full call-site safety** (readability-first still holds; no generics or conditionals as decoration): **generics** to relate input to output (never collapse to a wider type that drops info); **overloads** when distinct call shapes map inputs to outputs in ways one signature can't; **conditional types with `infer`** for type-level transforms; **`satisfies`** to check a const's shape without widening; **discriminated unions dispatched through a `Record` keyed on the discriminant** for variants, typed `{ [K in Kind]: … }` so a missing case fails to compile, rather than a `switch`.
- **No `as` on data.** External input is parsed by its schema at the edge, never asserted, and inside the code a type guard or `satisfies` says what `as` would. `as const` is not an assertion and stays.
- **enum vs string-union, the decision rule:** default to a **string-literal union** (`type X = "a" | "b"`; type-only, zero runtime). Need the values at runtime (iterate, validate, map, send over the wire)? Use an **`as const` object or array** and derive the type: `const Role = { Admin: "admin", Member: "member" } as const; type Role = (typeof Role)[keyof typeof Role]`. Gives namespaced autocomplete (`Role.Admin`), a runtime object, the union type and clean `z.enum` interop, with none of enum's costs. **Avoid `enum` in new code:** emits non-erasable runtime, `const enum` is unsafe under `isolatedModules`, numeric enums are loosely typed. Use a real `enum` only to interop with code that demands one.
- **Zod v4**: `import z from "zod"`. v4 idioms: `z.url()`, `z.email()`, and `z.enum()` accepting a TS enum directly (it replaces `z.nativeEnum()`). Full reference: `https://zod.dev/llms-full.txt`.

## Tests · fires: when a change carries risk, or tests are asked for

- **Default: no new tests.** Most changes ship without them. Add tests only when the change carries real risk (money flow, state machines, parsing, a security property) or when asked. Throwaway verifier scripts stay throwaway: run, quote the output, delete.
- **A test proves the behaviour the user sees, through the real path.** Unit tests of helpers written in the same change prove nothing about it.
- **Bare test files.** Few essential cases, each proving something distinct. No repetitive case grids, no near-duplicate `it`s; comments follow the comment rule (mostly none). Retargeting a shape change means the existing file gets slimmer, never bigger.
- **Fold, don't multiply.** Put new cases in the nearest existing test file when one fits; a new file per module is the smell.

## Commits and diffs · fires: every commit

- **Commit by logical group**: separate behavioral change from pure structural refactor. Not one big commit, not one per file. Reconstruct intermediate file states if needed so each commit is clean.
- **Commit message, one line, always**: `<type>(<scope>): <description>`, e.g. `feat(auth): add token refresh`. Scope is the file, function, package or area. **Never a body, bullet list or trailing paragraph**: reasoning, context and detail belong in the MR/PR description, which is the thing people actually read. No signature, no `Co-Authored-By`.
- **Formatter scope: don't let `--write` balloon a diff.** Running `biome`/`prettier`/`eslint --fix` on a file that isn't _already_ fully compliant reformats the **whole file** (arrow parens, trailing commas, quotes), burying a targeted change in unrelated churn. On a scoped edit only your own lines should move; if the formatter rewrote untouched lines, `git checkout -- <file>` and re-apply just your change by hand, leaving the pre-existing non-compliance for a separate cleanup.
