export interface ReceiptCommand {
  command: string
  description?: string
  failed?: boolean
  background?: boolean
}

export interface TurnReceipt {
  turn: number
  at: number
  prompt?: string
  // Absent when only the session itself acted; named subagents are listed here.
  by?: string[]
  read: string[]
  wrote: string[]
  deleted: string[]
  ran: ReceiptCommand[]
}

export interface ReceiptsSlice {
  turns: TurnReceipt[]
  offset: number
}
