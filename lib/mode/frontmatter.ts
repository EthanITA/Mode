import { STANDING } from "./constants.ts";
import { lines, strip } from "../text.ts";

export type Meta = Record<string, string>;

export function trimLines(rows: string[]): string {
  const out = [...rows];
  while (out.length && !strip(out[0] ?? "")) out.shift();
  while (out.length && !strip(out.at(-1) ?? "")) out.pop();
  return out.join("\n");
}

export function unquote(value: string): string {
  const v = strip(value);
  const quote = v[0];
  if (v.length > 1 && quote === v.at(-1) && (quote === '"' || quote === "'")) return v.slice(1, -1);
  return v;
}

export function splitFrontMatter(text: string): { meta: Meta; body: string } {
  const rows = lines(text);
  if (!rows.length || strip(rows[0] ?? "") !== "---") return { meta: {}, body: trimLines(rows) };
  const meta: Meta = {};
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i] ?? "";
    if (strip(line) === "---") return { meta, body: trimLines(rows.slice(i + 1)) };
    const sep = line.indexOf(":");
    if (sep >= 0) meta[strip(line.slice(0, sep))] = unquote(line.slice(sep + 1));
  }
  // An unterminated fence is body text that happens to open with a rule, not front matter.
  return { meta: {}, body: trimLines(rows) };
}

export function standingBlock(text: string): string {
  const rows = lines(text);
  const start = rows.findIndex((line) => line.startsWith("## ") && strip(line.slice(3)).toLowerCase() === STANDING);
  if (start < 0) return "";
  const rest = rows.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return trimLines(end < 0 ? rest : rest.slice(0, end));
}
