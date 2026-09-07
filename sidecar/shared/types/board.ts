export type BoardCategory = "AI" | "USER" | "WAIT"
export type BoardStatus = "pending" | "in_progress" | "completed"

export interface BoardTask {
  id: string
  text: string
  category: BoardCategory
  status: BoardStatus
  done: boolean
  owner?: string
  blocks: string[]
  blockedBy: string[]
}

export interface BoardSummary {
  tasks: BoardTask[]
  count: number
  waitingOnMarco: number
}
