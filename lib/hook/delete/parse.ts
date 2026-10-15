export type Part =
  | { kind: "text"; text: string; quoted: boolean }
  | { kind: "var"; name: string; fallback?: string; quoted: boolean }
  | { kind: "sub"; script: string; quoted: boolean };
export type Word = Part[];
export type Redirect = { op: string; target: Word };
export type Step = { kind: "command"; words: Word[]; redirects: Redirect[] } | { kind: "open" } | { kind: "close" };

type Heredoc = { delimiter: string; strip: boolean };

const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;
const SPECIAL = /[0-9@*#?$!-]/;
const PARAMETER = /^([A-Za-z_][A-Za-z0-9_]*)(?:(:?[-=?])(.*))?$/s;
const ANSI_ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"' };

// Index of the bracket closing the one at `open`, skipping quoted text, or -1 when the script ends first.
function closing(script: string, open: number, left: string, right: string): number {
  let depth = 0;
  for (let i = open; i < script.length; i++) {
    const c = script[i];
    if (c === "\\") i++;
    else if (c === "'") {
      const end = script.indexOf("'", i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (c === '"') {
      for (i++; i < script.length && script[i] !== '"'; i++) if (script[i] === "\\") i++;
    } else if (c === left) depth++;
    else if (c === right && --depth === 0) return i;
  }
  return -1;
}

export function literal(word: Word): string | undefined {
  let text = "";
  for (const part of word) {
    if (part.kind !== "text") return undefined;
    text += part.text;
  }
  return text;
}

// A shell script as the commands it runs, with each word's quoting kept so expansion can tell `*` from `'*'`.
export function parse(script: string): Step[] {
  const steps: Step[] = [];
  let words: Word[] = [];
  let redirects: Redirect[] = [];
  let word: Word | undefined;
  let pending: string | undefined;
  let delimiter: { strip: boolean } | undefined;
  let heredocs: Heredoc[] = [];

  const push = (part: Part): void => {
    word ??= [];
    const last = word.at(-1);
    if (part.kind === "text" && last?.kind === "text" && last.quoted === part.quoted) last.text += part.text;
    else word.push(part);
  };
  const endWord = (): void => {
    if (!word) return;
    if (delimiter) heredocs.push({ delimiter: literal(word) ?? "", strip: delimiter.strip });
    else if (pending) redirects.push({ op: pending, target: word });
    else words.push(word);
    delimiter = undefined;
    pending = undefined;
    word = undefined;
  };
  const endCommand = (): void => {
    endWord();
    pending = undefined;
    if (words.length || redirects.length) steps.push({ kind: "command", words, redirects });
    words = [];
    redirects = [];
  };

  const dollar = (i: number, quoted: boolean): number => {
    const next = script[i + 1] ?? "";
    if (next === "(") {
      const end = closing(script, i + 1, "(", ")");
      if (end < 0) return script.length;
      if (script[i + 2] === "(") push({ kind: "var", name: "", quoted });
      else push({ kind: "sub", script: script.slice(i + 2, end), quoted });
      return end + 1;
    }
    if (next === "{") {
      const end = closing(script, i + 1, "{", "}");
      if (end < 0) return script.length;
      const found = PARAMETER.exec(script.slice(i + 2, end));
      const [, name = "", op = "", rest] = found ?? [];
      push({ kind: "var", name, fallback: op.endsWith("-") || op.endsWith("=") ? rest : undefined, quoted });
      return end + 1;
    }
    if (next === "'" && !quoted) {
      let text = "";
      let j = i + 2;
      for (; j < script.length && script[j] !== "'"; j++) {
        if (script[j] === "\\" && j + 1 < script.length) text += ANSI_ESCAPES[script[++j] ?? ""] ?? script[j];
        else text += script[j];
      }
      push({ kind: "text", text, quoted: true });
      return j + 1;
    }
    if (NAME_START.test(next)) {
      let j = i + 1;
      while (j < script.length && NAME_CHAR.test(script[j] ?? "")) j++;
      push({ kind: "var", name: script.slice(i + 1, j), quoted });
      return j;
    }
    if (SPECIAL.test(next)) {
      push({ kind: "var", name: /\d/.test(next) ? next : "", quoted });
      return i + 2;
    }
    push({ kind: "text", text: "$", quoted });
    return i + 1;
  };

  const backtick = (i: number, quoted: boolean): number => {
    let j = i + 1;
    while (j < script.length && script[j] !== "`") j += script[j] === "\\" ? 2 : 1;
    push({ kind: "sub", script: script.slice(i + 1, j), quoted });
    return j + 1;
  };

  const skipHeredocs = (from: number): number => {
    let i = from;
    for (const { delimiter: end, strip } of heredocs) {
      while (i < script.length) {
        const stop = script.indexOf("\n", i);
        const line = script.slice(i, stop < 0 ? script.length : stop);
        i = stop < 0 ? script.length : stop + 1;
        if ((strip ? line.replace(/^\t+/, "") : line) === end) break;
      }
    }
    heredocs = [];
    return i;
  };

  let i = 0;
  while (i < script.length) {
    const c = script[i] ?? "";
    const two = script.slice(i, i + 2);
    if (c === " " || c === "\t" || c === "\r") {
      endWord();
      i++;
    } else if (c === "\n") {
      endCommand();
      i = skipHeredocs(i + 1);
    } else if (c === "#" && !word) {
      const stop = script.indexOf("\n", i);
      i = stop < 0 ? script.length : stop;
    } else if (c === "\\") {
      if (script[i + 1] !== "\n" && i + 1 < script.length)
        push({ kind: "text", text: script[i + 1] ?? "", quoted: true });
      i += 2;
    } else if (c === "'") {
      const end = script.indexOf("'", i + 1);
      push({ kind: "text", text: script.slice(i + 1, end < 0 ? script.length : end), quoted: true });
      i = end < 0 ? script.length : end + 1;
    } else if (c === '"') {
      word ??= [];
      let j = i + 1;
      let text = "";
      const flush = (): void => {
        if (text) push({ kind: "text", text, quoted: true });
        text = "";
      };
      while (j < script.length && script[j] !== '"') {
        const d = script[j] ?? "";
        if (d === "\\" && '$`"\\\n'.includes(script[j + 1] ?? "")) {
          if (script[j + 1] !== "\n") text += script[j + 1];
          j += 2;
        } else if (d === "$") {
          flush();
          j = dollar(j, true);
        } else if (d === "`") {
          flush();
          j = backtick(j, true);
        } else {
          text += d;
          j++;
        }
      }
      flush();
      i = j + 1;
    } else if (c === "$") {
      i = dollar(i, false);
    } else if (c === "`") {
      i = backtick(i, false);
    } else if ((c === "<" || c === ">") && script[i + 1] === "(") {
      const end = closing(script, i + 1, "(", ")");
      push({ kind: "sub", script: script.slice(i + 2, end < 0 ? script.length : end), quoted: false });
      i = end < 0 ? script.length : end + 1;
    } else if (c === "<" || c === ">") {
      const fd = word && word.length === 1 && word[0]?.kind === "text" && /^\d+$/.test(word[0].text);
      if (fd) word = undefined;
      else endWord();
      const op = /^(?:<<<|<<-|<<|<>|<&|>>|>\||>&|<|>)/.exec(script.slice(i))?.[0] ?? c;
      i += op.length;
      if (op === "<<" || op === "<<-") delimiter = { strip: op === "<<-" };
      else pending = op;
    } else if (two === "&&" || two === "||" || two === "|&" || two === ";;" || two === ";&") {
      endCommand();
      i += 2;
    } else if (script.startsWith("&>", i)) {
      endWord();
      pending = script.startsWith("&>>", i) ? "&>>" : "&>";
      i += pending.length;
    } else if (c === ";" || c === "&" || c === "|") {
      endCommand();
      i++;
    } else if (c === "(" && !word && !words.length) {
      endCommand();
      steps.push({ kind: "open" });
      i++;
    } else if (two === "()") {
      endCommand();
      i += 2;
    } else if (c === ")") {
      endCommand();
      steps.push({ kind: "close" });
      i++;
    } else {
      let j = i + 1;
      while (j < script.length && !" \t\r\n\\'\"$`<>&|;()".includes(script[j] ?? "")) j++;
      push({ kind: "text", text: script.slice(i, j), quoted: false });
      i = j;
    }
  }
  endCommand();
  return steps;
}
