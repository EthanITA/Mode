export interface CardAction {
  label: string
  hint: string
  title: string
  tone: "neutral" | "primary"
  done?: string
  pending: boolean
}
