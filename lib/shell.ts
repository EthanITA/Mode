export function shellWords(line: string): string[] | undefined {
  const words: string[] = []
  let word = ""
  let started = false
  let quote: "'" | '"' | undefined
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? ""
    if (quote === "'") {
      if (c === "'") quote = undefined
      else word += c
    } else if (quote === '"') {
      if (c === '"') quote = undefined
      else if (c === "\\" && (line[i + 1] === '"' || line[i + 1] === "\\")) word += line[++i]
      else word += c
    } else if (c === "'" || c === '"') {
      quote = c
      started = true
    } else if (c === "\\") {
      if (i + 1 >= line.length) return undefined
      word += line[++i]
      started = true
    } else if (" \t\r\n".includes(c)) {
      if (started) words.push(word)
      word = ""
      started = false
    } else {
      word += c
      started = true
    }
  }
  if (quote) return undefined
  if (started) words.push(word)
  return words
}
