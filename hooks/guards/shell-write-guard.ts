import { armed } from "../../lib/hook/guard.ts"
import { deny, payload, record, str } from "../../lib/hook/io.ts"
import { strip, words } from "../../lib/text.ts"

const MASK = "\x01"

// The harness tells the model to prefer Bash while bypass-permissions is on; these are the calls that rule loses.
const AUTHORING = new Set(["cat", "echo", "printf"])
const READERS = new Set(["cat", "head", "tail", "sed"])
const IN_PLACE = new Set(["sed", "gsed", "perl", "ruby"])
const WRAPPERS = new Set(["sudo", "command", "nohup", "time", "exec", "env"])

const IN_PLACE_FLAG = /^(?:--in-place|-[A-Za-z]{0,4}i(?:\.[A-Za-z0-9]{1,8})?)$/
const BYTE_FLAG = /^(?:-[A-Za-z]*c|--bytes)/
const ASSIGNMENT = /^[\p{L}\p{N}_]+=/u
const SUBSTITUTION = /[$<]\(/
const HEREDOC = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/
const REDIRECT = /\p{Nd}?>>?\s*(&?[^\s;|&<>]+)/gu
const DEV_TARGET = new RegExp(String.raw`^(?:&\p{Nd}|/dev/(?:null|stdout|stderr|fd/\p{Nd}+))$`, "u")
const PATHISH = new RegExp(`[/.~$${MASK}]`)
const SEGMENTS = /\n|;|&&|\|\|/

// A heredoc body is data, not shell: its `>` and `|` characters must not read as redirects or pipes.
function stripHeredocBodies(command: string): string {
  const lines = command.split("\n")
  const kept: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ""
    kept.push(line)
    const found = HEREDOC.exec(line)
    i++
    if (found) {
      while (i < lines.length && strip(lines[i] ?? "") !== found[2]) i++
      i++
    }
  }
  return kept.join("\n")
}

function maskQuotes(text: string): string {
  let out = ""
  let i = 0
  while (i < text.length) {
    const char = text[i] ?? ""
    if (char === "'" || char === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== char) j += char === '"' && text[j] === "\\" ? 2 : 1
      out += MASK
      i = j + 1
    } else {
      out += char
      i++
    }
  }
  return out
}

const nameOf = (token: string): string => token.split("/").pop() ?? ""

// `sudo cat f` and `FOO=1 cat f` are still a cat: the real command hides behind the wrapper.
function unwrap(tokens: string[]): string[] {
  let i = 0
  while (i < tokens.length && (WRAPPERS.has(nameOf(tokens[i] ?? "")) || ASSIGNMENT.test(tokens[i] ?? ""))) i++
  return i < tokens.length ? tokens.slice(i) : tokens
}

function flagsOf(tokens: string[]): string[] {
  return tokens.filter((token) => token.startsWith("-") && token !== "-")
}

function argsOf(tokens: string[]): string[] {
  return tokens.filter((token) => !token.startsWith("-"))
}

function verdict(command: string): string {
  const masked = maskQuotes(stripHeredocBodies(command))
  const piped = masked.replaceAll("||", "").includes("|")

  for (const segment of masked.split(SEGMENTS)) {
    const stages = segment.split("|").map(words).filter((tokens) => tokens.length).map(unwrap)
    const [first] = stages
    if (!first) continue
    const head = nameOf(first[0] ?? "")

    for (const stage of stages) {
      const name = nameOf(stage[0] ?? "")
      if (IN_PLACE.has(name) && flagsOf(stage.slice(1)).some((flag) => IN_PLACE_FLAG.test(flag))) {
        return `\`${name}\` edits the file in place. Use Edit, or Write for a full replacement.`
      }
    }

    const targets = [...segment.matchAll(REDIRECT)].map((match) => match[1] ?? "").filter((target) => !DEV_TARGET.test(target))
    const tees = stages.filter((stage) => nameOf(stage[0] ?? "") === "tee")
    if (AUTHORING.has(head) && (targets.length || tees.length)) {
      return `\`${head}\` is authoring file content into ${targets[0] ?? "a file"} from the shell. Use Write for a new file, Edit to change one.`
    }
    if (HEREDOC.test(segment) && targets.length) return `a heredoc redirected into ${targets[0]} is a file write. Use Write.`

    if (!piped && !targets.length && READERS.has(head)) {
      const flags = flagsOf(first.slice(1))
      if (head === "tail" && flags.some((flag) => flag.startsWith("-f") || flag === "--follow")) continue
      // `-c` is a byte slice of something Read cannot render, and a substitution is command output, not a file.
      if (flags.some((flag) => BYTE_FLAG.test(flag)) || SUBSTITUTION.test(segment)) continue
      if (argsOf(first.slice(1)).some((arg) => PATHISH.test(arg))) {
        return `\`${head}\` is reading a file. Use Read, which gives you line numbers and an offset.`
      }
    }
  }
  return ""
}

function check(): void {
  const data = payload()
  if (data?.tool_name !== "Bash") return
  const reason = verdict(str(record(data.tool_input).command))
  if (!reason) return
  deny(
    `shell-write-guard — ${reason}\n\nThe rule this guard enforces: reading and ` +
      "changing files goes through Read, Edit, Write, Glob and Grep, never the shell. This " +
      "overrides the bypass-permissions harness line that tells you to prefer Bash: that line is " +
      "the harness talking, not the user. Bash keeps git, package managers, test runs and pipelines " +
      "no builtin can express. Reissue with the builtin tool; do not narrate the block.",
  )
}

if (armed()) {
  try {
    check()
  } catch {}
}
