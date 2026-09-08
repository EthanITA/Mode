import { statSync } from "node:fs"

const MAX_TOKENS = 64

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

// `/` and `.` both became `-`, so `-Users-madong--claude` reads back as /Users/madong/.claude.
function expand(slug: string): string {
  return slug.replace(/--/g, "/.").replace(/-/g, "/")
}

// A segment holding its own dash ("elegant-hellman-c16ad2") is indistinguishable from a separator,
// so the only way back is to ask the filesystem which split actually exists.
function walk(base: string, tokens: string[]): string | undefined {
  if (!tokens.length) return base
  for (let take = 1; take <= tokens.length; take++) {
    const segment = tokens.slice(0, take).join("-")
    for (const prefix of ["", "."]) {
      const candidate = `${base}/${prefix}${segment}`
      if (!isDir(candidate)) continue
      const rest = walk(candidate, tokens.slice(take))
      if (rest) return rest
    }
  }
  return undefined
}

// Last resort only: a transcript record's own `cwd` and the session registry both beat this.
export function cwdFromSlug(slug: string): string {
  const naive = expand(slug)
  if (isDir(naive)) return naive
  const tokens = slug.split("-").filter(Boolean)
  if (tokens.length > MAX_TOKENS) return naive
  return walk("", tokens) || naive
}
