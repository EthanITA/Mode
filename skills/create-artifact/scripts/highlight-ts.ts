import { readFileSync } from "node:fs";

const KEYWORDS = new Set(
  (
    "const let var export import from return if else switch case default new type " +
    "interface enum as await async function void null undefined true false readonly " +
    "extends implements class this typeof keyof in of for while break continue throw " +
    "try catch finally satisfies declare namespace public private protected static"
  ).split(" "),
);

const TOKEN =
  /(?<com>\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(?<str>'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|(?<num>\b\d[\d_]*(?:\.\d+)?\b)|(?<word>[A-Za-z_$][A-Za-z0-9_$]*)|(?<op>[=+\-*/%<>!?:&|^~]+)/g;
const CLASS: Record<string, string> = { com: "t-com", str: "t-str", num: "t-num", op: "t-op" };
const BLOCK = /<pre data-ts>([\s\S]*?)<\/pre>/g;

const escape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

function highlight(code: string): string {
  let out = "";
  let pos = 0;
  for (const match of code.matchAll(TOKEN)) {
    out += escape(code.slice(pos, match.index));
    const kind = Object.entries(match.groups ?? {}).find(([, value]) => !!value)?.[0] ?? "op";
    const text = match[0];
    if (kind === "word") {
      const after = code[match.index + text.length];
      const cls = KEYWORDS.has(text) ? "t-key" : /^[A-Z]/.test(text) ? "t-typ" : after === "(" ? "t-fn" : "";
      out += cls ? `<span class="${cls}">${escape(text)}</span>` : escape(text);
    } else {
      out += `<span class="${CLASS[kind]}">${escape(text)}</span>`;
    }
    pos = match.index + text.length;
  }
  return out + escape(code.slice(pos));
}

let count = 0;
const out = readFileSync(process.argv[2] ?? "", "utf8")
  .replace(/\r\n?/g, "\n")
  .replace(BLOCK, (_, code: string) => {
    count++;
    return `<pre>${highlight(code)}</pre>`;
  });
process.stderr.write(`highlighted ${count} TypeScript blocks\n`);
process.stdout.write(out);
