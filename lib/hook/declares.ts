import { strip } from "../text.ts"
import { AUTO, FALSEY } from "../mode/constants.ts"
import { metaOf } from "../mode/contracts.ts"
import { held } from "../mode/state.ts"

// The held mode when it declares this flag. The key is matched in any case, which is how the hooks have always read it.
export function declaring(session: string | undefined, key: string): string | undefined {
  const mode = held("mode", session)
  if (!mode || mode === AUTO) return undefined
  const [, raw = ""] = Object.entries(metaOf("mode", mode)).find(([name]) => strip(name).toLowerCase() === key) ?? []
  const value = strip(raw).replace(/^["']+|["']+$/g, "").toLowerCase()
  return value && !FALSEY.has(value) ? mode : undefined
}
