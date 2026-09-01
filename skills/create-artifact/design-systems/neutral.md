# Neutral — the house default

**Kind:** house default (brand-free) · **Selector:** `data-ds="neutral"` (also the bare `:root` fallback) · **Stylesheet:** `doc-system.css` + `themes.css`

## Identity
Deliberately unbranded. A warm off-white canvas, near-black warm ink, one restrained indigo accent, 12px corners and soft shadows. It is what you use when the artifact should look considered but shouldn't claim anyone's identity — a personal doc, a scratch RFC, a report that will be read outside any one company.

**This is the default when no design system is specified and the context doesn't imply one.**

## Tokens
| Role | Light | Dark |
|---|---|---|
| bg / surface / surface-2 | `#fbfaf9` · `#ffffff` · `#f4f2f0` | `#0f1012` · `#17181b` · `#1f2024` |
| ink / muted / faint | `#1a1a19` · `#6b6a67` · `#9a9894` | `#eceef1` · `#a1a5ad` · `#71757d` |
| border / border-strong | `#e6e3df` · `#d3cfc9` | `#2a2c31` · `#3a3d44` |
| accent | `#4f46e5` | `#818cf8` |
| ok / warn / bad / info | `#2d8a56` · `#b8730a` · `#c92a42` · `#2563eb` | `#4ade80` · `#fbbf24` · `#f87171` · `#60a5fa` |
| radius | `12px` / `8px` | — |

**Type:** the system sans stack, display weight 650, tracking `-0.015em`. Nothing to load, nothing CDN-blocked.

## Do / don't
- **Do** load the `artifact-design` skill and let it drive treatment — with no brand to obey, the design judgement is the whole deliverable.
- **Do** use this for personal artifacts and for anything shared outside a single company.
- **Don't** bolt a company logo or brand colour onto it. If it needs a brand, pick that brand's pack.

## Provenance
Not a brand. Every value is a house choice made for this pack, tuned for legibility in both themes — there is nothing here to attribute or verify against a vendor.
