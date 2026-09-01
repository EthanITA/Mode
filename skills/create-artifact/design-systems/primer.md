# Primer — GitHub

**Kind:** public brand · **Selector:** `data-ds="primer"` · **Stylesheet:** `doc-system.css` + `themes.css`

## Identity
Functional, dense, engineer-facing. Pure-white canvas with a cool grey-blue second surface, near-black ink, and GitHub's `#0969da` blue for every link and action. Small radii (6px), thin `#d1d9e0` hairlines, no decorative shadow. The dark theme is the recognisable one: `#0d1117` with `#f0f6fc` text.

## Tokens
| Role | Light | Dark |
|---|---|---|
| bg / surface / surface-2 | `#ffffff` · `#ffffff` · `#f6f8fa` | `#0d1117` · `#151b23` · `#010409` |
| ink / muted / faint | `#1f2328` · `#59636e` · `#818b98` | `#f0f6fc` · `#9198a1` · `#656c76` |
| border | `#d1d9e0` | `#3d444d` |
| accent / accent-soft | `#0969da` · `#ddf4ff` | `#4493f8` · `#388bfd1a` |
| ok / warn / bad | `#1a7f37` · `#9a6700` · `#d1242f` | `#3fb950` · `#d29922` · `#f85149` |
| ok-soft / warn-soft / bad-soft | `#dafbe1` · `#fff8c5` · `#ffebe9` | `#2ea04326` · `#bb800926` · `#f851491a` |
| radius | `6px` | — |

**Type:** the GitHub stack — `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial`. All system fonts, nothing CDN-blocked. Display weight 600, never heavier.

## Signature moves
- **Flat by default.** GitHub uses borders, not shadows, to separate surfaces. `--shadow-sm` is present but should stay off most panels.
- **State labels as pills** — the `.chip--met/new/open` set maps directly onto GitHub's open/closed/merged language.
- **Monospace carries meaning**, not just code: SHAs, branch names, file paths.

## Do / don't
- **Do** keep the radius at 6px everywhere; Primer's tell is the small, consistent corner.
- **Do** let tables be dense — Primer is comfortable with information.
- **Don't** add gradients, glass, or coloured hero blocks. There are none in Primer.

## Provenance
Every value above read verbatim this session from the vendor's published CSS — `@primer/primitives/dist/css/functional/themes/light.css` and `dark.css` on unpkg. Only `--border-strong` (`#b7bfc7` light) is derived; Primer has no such token.
