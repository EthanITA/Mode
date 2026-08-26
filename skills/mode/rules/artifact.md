---
name: artifact
summary: The theming contract every HTML deliverable meets, injected when one is on the way.
when: artifact|mockup|html page|landing page|one-pager|one pager|dossier|design lab|web page
---

## HTML deliverables

- Light mode is the default, always. The base `:root` block carries the complete light palette, and `@media (prefers-color-scheme: dark)` never decides the initial theme: dark is opt-in.
- Every page ships a small light and dark toggle, fixed top right, without being asked. Icon only, an `aria-label` naming the destination theme, a visible `:focus-visible` state. It flips `data-theme` on `document.documentElement`, so it composes with whatever theme the host stamps.
- Both themes are designed properly, through `:root[data-theme="dark"]` and `[data-theme="light"]` token blocks rather than ad hoc overrides. A colour whose only definition sits inside a media or theme block renders one theme's text on the other theme's ground.
- The page reads with zero JavaScript: content is visible by default and enhanced after, and `body` paints an explicit token background, since a transparent body borrows the host's ground.
