import { join } from "node:path";
import { isFile, listMd, readTextSafe } from "../files.ts";
import { strip } from "../text.ts";
import { STANDING_LINES } from "./constants.ts";
import { alternatives, hits, substitute, truthy } from "./contracts.ts";
import { splitFrontMatter, standingBlock, type Meta } from "./frontmatter.ts";
import { rulesDirs } from "./paths.ts";
import { statePath, writeState } from "./state.ts";

const GROUNDED =
  "# Ground rules\n\nThese rules hold for this entire conversation. They are injected " +
  "once, here, and never repeated, except a rule that outranks the contracts, whose " +
  "reminder comes back every turn. Keep applying all of them without being reminded.";

type Rule = { stem: string; meta: Meta; body: string };

// A user file sharing a shipped stem replaces that rule, and an empty body silences it.
function groundRules(): Rule[] {
  const picked = new Map<string, string>();
  for (const dir of rulesDirs()) for (const file of listMd(dir)) picked.set(file.slice(0, -3), join(dir, file));
  return [...picked.keys()].sort().map((stem) => ({ stem, ...splitFrontMatter(readTextSafe(picked.get(stem)) ?? "") }));
}

// Each rule declaring `outranks`, with its standing reminder, which announce repeats every turn.
export function outranking(): { stem: string; reminder: string }[] {
  return groundRules().flatMap(({ stem, meta, body }) => {
    const block = standingBlock(body);
    return truthy(meta, "outranks") && block
      ? [{ stem, reminder: block.split("\n").slice(0, STANDING_LINES).join("\n") }]
      : [];
  });
}

// Each rule once per conversation, a `when:` rule only once a prompt matches it; undefined when nothing is due.
export function rulesDue({ session, message = "" }: { session?: string; message?: string }): string | undefined {
  const base = statePath(session, ".rules");
  // With no session nothing remembers they were told, and telling every turn is what this exists to prevent.
  if (!base) return undefined;
  const lowered = message.toLowerCase();
  const baseDue = !isFile(base);
  const bodies: string[] = [];
  let toldBase = false;
  for (const { stem, meta, body } of groundRules()) {
    if (!strip(body)) continue;
    const when = alternatives(meta, "when");
    if (when.length) {
      const marker = statePath(session, `.rule-${stem}`) ?? "";
      if (isFile(marker) || !lowered || !hits(lowered, when)) continue;
      writeState(marker, "told");
      bodies.push(strip(body));
    } else if (baseDue) {
      bodies.push(strip(body));
      toldBase = true;
    }
  }
  if (toldBase) writeState(base, "told");
  return bodies.length ? substitute(`${GROUNDED}\n\n${bodies.join("\n\n")}`) : undefined;
}

export function ruleState(sid?: string): { told: string[]; waiting: { name: string; until?: string }[] } {
  const baseTold = isFile(statePath(sid, ".rules"));
  const told: string[] = [];
  const waiting: { name: string; until?: string }[] = [];
  for (const { stem, meta, body } of groundRules()) {
    if (!strip(body)) continue;
    const when = alternatives(meta, "when");
    if (!when.length) {
      if (baseTold) told.push(stem);
      else waiting.push({ name: stem });
      continue;
    }
    // Three alternatives and a count, since a scoped rule's pattern runs to a dozen phrases.
    const until = when.slice(0, 3).join(" | ") + (when.length > 3 ? ` and ${when.length - 3} more` : "");
    if (isFile(statePath(sid, `.rule-${stem}`))) told.push(stem);
    else waiting.push({ name: stem, until });
  }
  return { told, waiting };
}
