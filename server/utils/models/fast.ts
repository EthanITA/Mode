import { execFile } from "node:child_process"
import { promisify } from "node:util"
import Anthropic from "@anthropic-ai/sdk"
import type { FastModelReply, FastModelRequest, FastTask } from "../../../shared/types/models"

const execFileAsync = promisify(execFile)

const SYSTEM_INSTRUCTION =
  "You are a fast editor for a document. For an edit task, return the replacement text for the selection only, keeping the document's register and format, and nothing else. For answer and chat, reply in two or three short sentences."

const DELEGATE_RULE =
  "When the instruction needs a decision rather than a rewording (the instruction asks you to choose, restructure, add content whose facts you do not have, or the selection is longer than about 1200 characters), answer with exactly the single line DELEGATE and nothing else."

const HAIKU_SYSTEM_PROMPT = `${SYSTEM_INSTRUCTION} ${DELEGATE_RULE}`
const GEMINI_SYSTEM_PROMPT = SYSTEM_INSTRUCTION

export interface FormatReplyOptions {
  task: FastTask
  text: string
  by: "haiku" | "gemini"
}

function formatReply({ task, text, by }: FormatReplyOptions): FastModelReply {
  if (task === "edit") {
    return { kind: "edit", replacement: text, by }
  }
  return { kind: "answer", text, by }
}

function isDelegateReply(reply: string): boolean {
  const firstLine = reply
    .split("\n")
    .map((line) => line.trim())
    .find((line) => Boolean(line))
  return firstLine === "DELEGATE"
}

function buildUserMessage(request: FastModelRequest): string {
  const parts: string[] = [`Task: ${request.task}`]
  if (request.context) {
    parts.push(`Surrounding passage:\n"""\n${request.context}\n"""`)
  }
  if (request.selection) {
    parts.push(`Selection:\n"""\n${request.selection}\n"""`)
  }
  parts.push(`Instruction:\n${request.instruction}`)
  return parts.join("\n\n")
}

function buildHaikuMessages(request: FastModelRequest): Anthropic.MessageParam[] {
  const userMessage = buildUserMessage(request)
  if (request.task === "chat" && request.history && request.history.length > 0) {
    const messages: Anthropic.MessageParam[] = []
    for (const entry of request.history) {
      messages.push({ role: entry.role, content: entry.text })
    }
    messages.push({ role: "user", content: userMessage })
    return messages
  }
  return [{ role: "user", content: userMessage }]
}

function buildGeminiPrompt(request: FastModelRequest): string {
  const parts: string[] = [GEMINI_SYSTEM_PROMPT]
  if (request.task === "chat" && request.history && request.history.length > 0) {
    const historyText = request.history
      .map((entry) => `${entry.role === "user" ? "User" : "Assistant"}: ${entry.text}`)
      .join("\n\n")
    parts.push(`Conversation history:\n${historyText}`)
  }
  parts.push(buildUserMessage(request))
  return parts.join("\n\n")
}

async function runGemini(request: FastModelRequest): Promise<string> {
  const prompt = buildGeminiPrompt(request)
  const { stdout } = await execFileAsync(
    "agy",
    ["-p", prompt, "--model", "gemini-3.8-flash-low", "--output-format", "text"],
    { timeout: 60_000 },
  )
  return stdout.trim()
}

export async function fast(request: FastModelRequest): Promise<FastModelReply> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw createError({
      statusCode: 503,
      statusMessage: "ANTHROPIC_API_KEY is not set in the server's environment",
    })
  }

  const client = new Anthropic()
  let haikuOutcome: { ok: true; text: string } | { ok: false } = { ok: false }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      system: HAIKU_SYSTEM_PROMPT,
      messages: buildHaikuMessages(request),
    })
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
    haikuOutcome = { ok: true, text }
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      haikuOutcome = { ok: false }
    } else {
      throw err
    }
  }

  if (haikuOutcome.ok && !isDelegateReply(haikuOutcome.text)) {
    return formatReply({ task: request.task, text: haikuOutcome.text, by: "haiku" })
  }

  try {
    const geminiText = await runGemini(request)
    return formatReply({ task: request.task, text: geminiText, by: "gemini" })
  } catch {
    throw createError({
      statusCode: 502,
      statusMessage: "Both fast models failed",
    })
  }
}
