export interface ArtifactMeta {
  slug: string
  title: string
  url?: string
  target?: string
  ds?: string
  updated?: string
  path: string
  // Not `threads`: ArtifactDetail already owns that name for the array itself.
  threadCount?: number
  preview?: string
}

export interface ThreadAnchor {
  label?: string
  quote?: string
  sel?: string
  text?: string
}

export interface ThreadReply {
  id: string
  by: string
  at: string
  body: string
}

export interface ReviewThread {
  id: string
  n: number
  by: string
  at: string
  updated?: string
  body: string
  status: "open" | "resolved"
  anchor?: ThreadAnchor
  replies: ThreadReply[]
}

export interface ArtifactDetail extends ArtifactMeta {
  threads: ReviewThread[]
}

export type ArtifactEditAction = "accept" | "apply" | "revert"

export interface ArtifactEditRequest {
  action?: ArtifactEditAction
  block?: string
  replacement?: string
  selection: string
}

export interface ArtifactEditReply {
  id?: string
}

export type ArtifactReviewAction = "create" | "reply" | "resolve"

export interface ArtifactReviewRequest {
  action: ArtifactReviewAction
  anchor?: ThreadAnchor
  body?: string
  by?: string
  id?: string
}

export interface ArtifactReviewReply {
  thread?: ReviewThread
  threads: ReviewThread[]
}
