import { armed } from "../../lib/hook/guard.ts";
import { payload, str, zap } from "../../lib/hook/io.ts";
import { Transcript, Turns } from "../../lib/hook/transcript.ts";
import { head, strip } from "../../lib/text.ts";

// Lines begin only after \n here, not after the \r or U+2028 a JS `m` flag would also honour.
const FENCED = /```[\s\S]*?(?:```|$)/g;
const INLINE = /`[^`\n]+`/g;
const QUOTED = /(?<![^\n])[ \t]*>[^\n]*/g;
// The X/Y/Z template mandates its label dash, so the label prefix is exempt but the line's content is not.
const XYZ_PREFIX = /(?<![^\n])([ \t]*(?:[-+][ \t]+)?(?:\*\*|__)?[XYZ](?:\*\*|__)?[ \t]*)[—–][ \t]*/g;
const BANNED = /[—⇒∩≥≤∴≠≈→]| – /;

function offendingLines(reply: string): string[] {
  const text = reply.replace(FENCED, "").replace(QUOTED, "").replace(INLINE, "").replace(XYZ_PREFIX, "$1");
  return text
    .split("\n")
    .filter((line) => BANNED.test(line))
    .map(strip);
}

if (armed()) {
  try {
    const data = payload();
    if (data && !data.stop_hook_active) {
      const entries = Transcript.read(str(data.transcript_path));
      const blocks = Turns.blocks(entries);
      const reply = (blocks.at(-1) ?? []).join("\n");
      if (strip(reply) && !Transcript.alreadyZapped(entries, "prose-check")) {
        const hits = offendingLines(reply);
        if (hits.length) {
          const sample = hits
            .slice(0, 4)
            .map((line) => `  | ${head(line, 160)}`)
            .join("\n");
          const extra = hits.length > 4 ? `\n  (+${hits.length - 4} more lines)` : "";
          zap(
            "Your reply carries AI-slop fingerprints banned by rules/prose.md (em dashes, " +
              `math/logic symbols or arrow chains in prose):\n${sample}${extra}\n` +
              "Post a follow-up that rewrites ONLY these lines in the human register: a period or a " +
              "joining word instead of the dash, never a colon or parentheses standing in for it; plain " +
              "words instead of symbols. Keep it short and do not restate the rest of the reply.",
            "prose-check: slop fingerprints in the reply (em dash / math symbols) — rewriting.",
          );
        }
      }
    }
  } catch {}
}
