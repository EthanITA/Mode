---
paths:
  - "**/*.{ts,tsx,mts,cts,vue,js,jsx,mjs,cjs}"
---

# Code style

You are touching code. These rules apply to what you write.

**Every repo, no exceptions: a repo's own `CLAUDE.md` gets no style override.** Most of what such a file says about style is this file echoed back; the remainder is drift, usually from AI-generated code. Where a repo's stated convention contradicts a rule here, this file wins: follow the global rule in new code, treat the local habit as debt, and never migrate the repo as a side effect of an unrelated change.

## Comments

**Comment why, never what. Default: zero comments.** Every comment is LOC bloat until proven otherwise.

Explicitly banned, no exceptions:
- **File-header blurbs**: a comment block at the top of a file describing what the file does. Usage goes in the README or `package.json`, not the source.
- **Usage / example blocks.**
- **Docstrings that restate the signature.** `/** The full question. */` above `question: string` is noise. So is `/** True when the event comes from an editable field. */` above `isEditableTarget()`.
- What the code does, types and signatures, section banners, PR/ticket context (that's the commit message), obvious idempotency or no-ops.

Add a comment ONLY when one of these holds:
- **(a)** The logic is genuinely complex or non-obvious and the comment saves real reading effort.
- **(b)** The code intentionally diverges from what a reader would expect, for a specific reason: a hidden constraint or invariant the code can't express, a bug/quirk workaround (link it), or a deliberately-rejected obvious alternative.

Neither holds means no comment. Prose-essay comments fail even when they explain a why: keep it to one terse line.

When sweeping a file, **delete** redundant comments. Applies everywhere, including scripts and tooling.

This is the most commonly violated rule. Weight it accordingly.

## Language

- **Always TypeScript: author `.ts` (`.tsx`/`.vue`), never `.mjs`/`.cjs`/`.js`**, including scripts, ESLint rules, config helpers, and other tooling. The toolchain (jiti/tsx/Nuxt/ts-node) transpiles; there's no need to drop to plain JS for "just a script."
- **Readability first**: readable, low-verbosity, simple. Prefer concise over defensive/verbose. Avoid needless abstraction/wrappers/indirection.
- **"Simplify" means consumer DX, not LOC**: attack friction (autocomplete noise, file size, prefix repetition, hidden hierarchy), recursively until further splitting/renaming would hurt. Don't widen a module-local `const` to an `export` unless a consumer needs it: that's added surface, not simplification.
- **Single-row queries**: array-destructure inline, `const [row] = await db.select()...; return row;`. Never an intermediate `rows` var.
- **`undefined`, not `null`, for "no value"**: return types, refs, optional fields. `null` only when an external contract demands it (DB columns, foreign JSON, drizzle inserts). A helper you author returning `Promise<T | null>` is wrong; return `Promise<T | undefined>`. **Optionality is `?:` and nothing else**: `quantity?: number`, never `quantity: number | undefined`, never `quantity?: number | null`. **Never test absence by comparison**: `!adj` / `!!adj` / `Boolean(adj)`, never `adj !== undefined` or `adj !== null`. Needing `0` or `""` to survive that guard means the field wants a real default, not a comparison back to `undefined`.
- **3+ positional params is a smell**: take a single destructured options object, export its type, give optional fields defaults in the destructure, keep the explicit return type. When asked to fix this, sweep **every** function in the file, not just the one named.
- **Vue props**: destructure for defaults, `const { type = "default" } = defineProps<{ type?: string }>()`. `const props = defineProps(...)` is sometimes fine.
- **`<button>` always carries `type="button"`** unless it genuinely submits a form: HTML defaults to `submit`, so an unmarked button inside a form navigates instead of doing its job.
- **`ref` is never nullable by default**: `ref<T>()` (implicitly `T | undefined`), not `ref<T | null>(null)`. Matches the `undefined`-over-`null` rule above.
- **Vue classes**: reuse the project's stylesheet classes. Static styling goes in `class="..."`; a reactive override or append goes in `:class`. Lists via array `['c1', dyn]`; conditionals via object `{ 'c': cond }`, never ternaries inside arrays.
- **`:data-*` bindings are the raw value; the CSS matches it explicitly.** `:data-floating="floating"` with `[data-floating="true"]`. Never coerce to make a presence selector work: `value || undefined`, `value ? '' : undefined` and friends hide both states behind a trick. A state whose *presence* is the whole meaning (no false case) may bind the value directly and be selected bare.
- **Reach the design system through `@apply`, not a `:class` object.** A `:class="{ 'glass': variant === 'glass' }"` beside a `:data-variant` stamps the same state twice, once as styling in the template. Register the look as an `@utility` so the `[data-*]` rule can `@apply` it. In Tailwind 4 a class defined in a plain `@layer utilities` block is *not* `@apply`-able; only `@utility` registers it.
- **Markup, style and behaviour stay in their own layer.** Script decides what is *true*, CSS decides what that *looks like*, template says where it goes. A computed returning a class string is styling that leaked into TypeScript: put the state on the element (`:data-status`, `:data-variant`) and let CSS select on it. A per-state `Record<State, string>` of Tailwind classes in `.ts` is the tell.

## Domain namespaces: the autocomplete surface is designed, not incidental

Every top-level export is a tax on every keystroke, forever. `googleLogin`/`googleSignout`/`gsapInit` scatter one domain across the global surface and are findable only if you already know the name; `Google.login()` lets you type the domain and have the language server enumerate the rest.

- **A shared prefix is a namespace asking to exist**: collapse it before the second export. Split the domain by concern behind one curated `index.ts`: an **allowlist, never `export *`**, so what you omit stays private. Merge value and type under one name (`export const Slack = {…}` with `export namespace Slack { export type … }`) or a flat `SlackOAuthSuccess` survives beside it.
- **Name it after the capability you own, not the vendor you rent**: `motion` not `gsap`, `mail` not `resend`. Swapping the library must not rename a call site.
- **Namespace the return, don't ship siblings** (`useThreadMode(id)` returns `{ mode, defaultMode }`), and stop before ceremony: a lone function needs none, don't pre-split, two levels is the ceiling.

## Nuxt

- **SPA only: `ssr: false` in every Nuxt project's `nuxt.config.ts`.** All rendering is client-side; never add SSR or assume server-render. Content that must render **outside the running app** (offline preview, or publish-time pre-render of a document) uses a **standalone build script**: Vue `renderToString`, or a headless-Chromium snapshot for components that aren't SSR-safe. That's a build tool, not a change to `ssr: false`.

## Typing

Type safety is a deliverable, not optional: consumer DX (autocomplete, type hints, compile-time errors at the call site) depends on it.

- **Type every function thoroughly.** Public/exported surface: explicit param types and an **explicit return type** (guards against silent widening, sharpens hints); inference is fine for locals/internals. This includes exported composables and hooks: `export const useThreadMode = (id: string) => {...}` with an inferred return type is a miss.
- **No implicit `any`; prefer `unknown` plus narrowing over `any`.** Explicit `any` in a throwaway script is still `any`: the rule has no script carve-out.
- **Reach for the precise tool, the simplest that gives full call-site safety** (readability-first still holds; no generics or conditionals as decoration): **generics** to relate input to output (never collapse to a wider type that drops info); **overloads** when distinct call shapes map inputs to outputs in ways one signature can't; **conditional types with `infer`** for type-level transforms; **`satisfies`** to check a const's shape without widening; **discriminated unions with an exhaustive `switch`** (`assertNever(x: never)`) for variants.
- **`as` assertions only at trust boundaries** (freshly parsed external input); elsewhere use type guards or `satisfies`.
- **enum vs string-union, the decision rule:** default to a **string-literal union** (`type X = "a" | "b"`; type-only, zero runtime). Need the values at runtime (iterate, validate, map, send over the wire)? Use an **`as const` object or array** and derive the type: `const Role = { Admin: "admin", Member: "member" } as const; type Role = (typeof Role)[keyof typeof Role]`. Gives namespaced autocomplete (`Role.Admin`), a runtime object, the union type and clean `z.enum` interop, with none of enum's costs. **Avoid `enum` in new code:** emits non-erasable runtime, `const enum` is unsafe under `isolatedModules`, numeric enums are loosely typed. Use a real `enum` only to interop with code that demands one.
- **Zod v4**: `import z from "zod"`. v4 idioms: `z.url()`, `z.email()`, and `z.enum()` accepting a TS enum directly (it replaces `z.nativeEnum()`). Full reference: `https://zod.dev/llms-full.txt`.

## Tests

- **Default: no new tests.** Most changes ship without them. Add tests only when the change carries real risk (money flow, state machines, parsing, a security property) or when asked. Throwaway verifier scripts stay throwaway: run, quote the output, delete.
- **Bare test files.** Few essential cases, each proving something distinct. No repetitive case grids, no near-duplicate `it`s; comments follow the comment rule (mostly none). Retargeting a shape change means the existing file gets slimmer, never bigger.
- **Fold, don't multiply.** Put new cases in the nearest existing test file when one fits; a new file per module is the smell.

## Structure

- **Name variant files after the discriminant value.** A component dispatching on `chartType: 'bar'|'line'|'pie'` splits into `chart/bar.tsx`, `chart/line.tsx`, `chart/pie.tsx`, nested in a by-concern subfolder, not flat PascalCase files (`PieChart.tsx`) in the component root.
- **Never re-derive something that common sense says already exists.** Date and URL parsing, deep clone, debounce, number and date formatting, collection helpers, casing, UUIDs, retry, timeouts. Reach in this order: the platform (`Date`, `Intl`, `URL`, `structuredClone`, `AbortSignal.timeout`, `crypto.randomUUID`), then a library already in `package.json`, then a helper the repo already exports, and only then write one. A hand-cut regex for a standard format is the loudest tell: `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/` is an ISO-8601 check that `Date.parse` and every date library already do, and the hand-rolled one is now yours to keep correct. Grepping the repo and reading the dependency list is part of writing the line, not a step before it. Conclude that nothing covers it and say so in one line rather than building in silence.
- **Reuse the design system before writing a component; this IS code style, not a nicety.** Inventory what exists and map each piece to a builtin. Reviewers keep flagging re-implementation. When a builtin misses the feature you need, **extend the builtin itself** (never fork it, never re-implement beside it); the per-project policy (approvals, breaking-change limits, comparison artifacts) lives in that project's `CLAUDE.md`.
- **Commit by logical group**: separate behavioral change from pure structural refactor. Not one big commit, not one per file. Reconstruct intermediate file states if needed so each commit is clean.
- **Commit message, one line, always**: `<type>(<scope>): <description>`, e.g. `feat(auth): add token refresh`. Scope is the file, function, package or area. **Never a body, bullet list or trailing paragraph**: reasoning, context and detail belong in the MR/PR description, which is the thing people actually read. No signature, no `Co-Authored-By`.
- **Formatter scope: don't let `--write` balloon a diff.** Running `biome`/`prettier`/`eslint --fix` on a file that isn't *already* fully compliant reformats the **whole file** (arrow parens, trailing commas, quotes), burying a targeted change in unrelated churn. On a scoped edit only your own lines should move; if the formatter rewrote untouched lines, `git checkout -- <file>` and re-apply just your change by hand, leaving the pre-existing non-compliance for a separate cleanup.
