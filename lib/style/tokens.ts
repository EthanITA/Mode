import { head, quote, strip } from "../text.ts";

export const STYLED = new Set([".vue", ".css"]);
// Built output, and the stylesheets that define a design system rather than consume one: its css/ and the artifact packs.
export const EXEMPT_PATH =
  /\.gen\.|(^|\/)(dist|node_modules|\.output|design-systems)\/|(^|\/)design\/css\/|\/skills\/[^/]+\/assets\//;

// A custom property is a token being defined, the one place a raw value belongs.
const DEFINITION = /^\s*--[\w-]+\s*:/;
const EXEMPT = /no token/i;
const COMMENT = /\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(?<![:\w])\/\/.*$/g;
// A fallback inside var() still names the token first.
const FALLBACK = /var\([^()]*\)/g;

const COLOUR =
  /(?<![\w&#-])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[\d.]/i;
const TIMED = /transition|duration|delay/i;
const KEYFRAMED = /^\s*animation[\w-]*\s*:/i;
const TIME = /(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g;
const SCRIPT_TIME = /\b(?:duration|delay)\s*:\s*\d{2,}\b/;
const CURVE = /cubic-bezier\(/i;
// Only a bracket a token could replace: a length, a time or a hex colour, never em, vh, %, fr or a calc().
const ARBITRARY = /(?<![\w-])[a-z][\w-]*-\[(?:#[0-9a-f]{3,8}|-?\d*\.?\d+(?:px|rem|ms|s))\]/i;
const SIZE =
  /\b(?:font-size|border-radius|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|gap|row-gap|column-gap|letter-spacing)\s*:[^;]*?(?<![\w.-])(?:[2-9]|[1-9]\d+)(?:\.\d+)?px\b/;

// A keyframe animation and a reduced-motion reset (0ms, 0.01ms) stay literal, as the code-style rule allows.
function timed(line: string): boolean {
  if (SCRIPT_TIME.test(line)) return true;
  if (KEYFRAMED.test(line) || !TIMED.test(line)) return false;
  return [...line.matchAll(TIME)].some(([, value, unit]) => Number(value) * (unit === "s" ? 1000 : 1) > 1);
}

const CHECKS: [(line: string) => boolean, string][] = [
  [(line) => COLOUR.test(line), "a raw colour, so name a palette token (`var(--primary)`, `bg-raised`, `text-muted`) the theme can flip"],
  [timed, "a raw duration, so use a `--duration-*` token (`MOTION_DURATION` in script)"],
  [(line) => CURVE.test(line) && !KEYFRAMED.test(line), "a hand-written curve, so use an `--ease-*` token (`EASE_CSS` in script)"],
  [(line) => ARBITRARY.test(line), "an arbitrary Tailwind value, so snap it to the nearest token or utility"],
  [(line) => SIZE.test(line), "a raw size, so type is a `typo-*` utility, a radius `rounded-*` and a gap or padding the spacing scale"],
];

export function offenders(added: string): string[] {
  const findings: string[] = [];
  added.split("\n").forEach((raw, index) => {
    if (EXEMPT.test(raw) || DEFINITION.test(raw)) return;
    const line = raw.replace(COMMENT, "").replace(FALLBACK, "var()");
    const hit = CHECKS.find(([test]) => test(line));
    if (hit) findings.push(`line ${index + 1} ${quote(head(strip(raw), 70))} → ${hit[1]}`);
  });
  return findings;
}
