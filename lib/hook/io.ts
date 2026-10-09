import { readFileSync } from "node:fs"

export type Payload = { [key: string]: unknown }

type ContextEvent = "UserPromptSubmit" | "SessionStart" | "PostToolUse"

export function isRecord(value: unknown): value is Payload {
  return typeof value === "object" && !!value && !Array.isArray(value)
}

export function record(value: unknown): Payload {
  return isRecord(value) ? value : {}
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : ""
}

// Anything but a JSON object on stdin reads as no payload, so the hook lets the call through.
export function payload(): Payload | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(0, "utf8"))
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function emit(output: object): void {
  process.stdout.write(JSON.stringify(output) + "\n")
}

export function deny(reason: string): void {
  emit({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })
}

// A PostToolUse guard's note stays visible in the transcript, so it carries no suppressOutput.
export function postContext(text: string): void {
  emit({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: text } })
}

export function context(event: ContextEvent, text: string): void {
  emit({ hookSpecificOutput: { hookEventName: event, additionalContext: text }, suppressOutput: true })
}

// A Stop guard's nudge: the model reads the context and the user sees the one-line message.
export function zap(text: string, message: string): void {
  emit({ hookSpecificOutput: { hookEventName: "Stop", additionalContext: text }, systemMessage: `⚡ ${message}`, suppressOutput: true })
}

export function systemMessage(message: string): void {
  emit({ systemMessage: message, suppressOutput: true })
}

export function blockTask(reason: string): void {
  emit({ decision: "block", reason })
}
