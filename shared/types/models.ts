export type FastTask = "edit" | "answer" | "chat"

export type FastModelProvider = "haiku" | "gemini"

export interface FastChatMessage {
  role: "user" | "assistant"
  text: string
}

export interface FastModelRequest {
  task: FastTask
  instruction: string
  selection: string
  context?: string
  history?: FastChatMessage[]
}

export interface FastModelEdit {
  kind: "edit"
  replacement: string
  by: FastModelProvider
}

export interface FastModelAnswer {
  kind: "answer"
  text: string
  by: FastModelProvider
}

export type FastModelReply = FastModelEdit | FastModelAnswer
