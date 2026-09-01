# Prose register: human body copy

Artifact body copy is read by a person. The failure mode is AI slop: prose that is technically precise yet reads machine-written. These rules bind every sentence the artifact shows; `scripts/check-prose.sh` catches the mechanical fingerprints before publishing.

## Rules

The register is canonical in `~/.claude/rules/prose.md` (always loaded); every rule there binds artifact body copy, in entity form too (`&mdash;` is an em dash). Artifact-specific carve-out: an arrow may appear as trailing UI chrome (a "View all" link), never between words.

## Few-shot pairs

**Splice dash plus contrast reflex**
- ❌ The resolver mints every URL server-side — a fabricated destination is structurally impossible, not merely unlikely.
- ✅ Every URL is minted on the server. The model never writes one, so it cannot invent a wrong destination.

**Symbols in prose**
- ❌ eligible = availableIn ∩ customerWrappers ⇒ exactly one match → auto-select.
- ✅ A wrapper is eligible when it is both available for the instrument and held by the customer. If exactly one qualifies, it is selected automatically.

**Density with no air**
- ❌ Rule 5's precedence is data, not code branches — a per-market ordered list — so adding a market never touches resolution logic.
- ✅ Rule 5 keeps its precedence in a plain ordered list, one per market. Adding a market means adding a list entry. The resolution code does not change.

**Trailing rationale clause**
- ❌ Observability is required — several branches resolve to "no link", and without it working-as-designed is indistinguishable from broken.
- ✅ Each resolution records the branch it took. Several branches correctly produce no link. Without the record, a correct "no link" looks exactly like a bug.

**Jargon left raw**
- ❌ The tools return unvalidated passthrough (z.unknown()), and the isin-exchange-currency shape is never pinned.
- ✅ The instrument tools pass data through without validating it (the schema is `z.unknown()`, meaning "accept anything"). Nothing in the repo pins down the identifier format, which combines the ISIN with the exchange and the currency.

## Mechanical check

`scripts/check-prose.sh <file...>` fails on: raw multibyte punctuation or symbols outside code blocks, `&mdash;` in any position, math-symbol entities, an arrow entity followed by more text, and a spaced `&ndash;`. Fix every hit before publishing; there is no allowlist.
