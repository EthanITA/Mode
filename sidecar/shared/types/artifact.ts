export interface ArtifactMeta {
  slug: string
  title: string
  url?: string
  target?: string
  ds?: string
  updated?: string
  path: string
}

export interface ThreadAnchor {
  label?: string
  quote?: string
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
  body: string
  status: "open" | "resolved"
  anchor?: ThreadAnchor
  replies: ThreadReply[]
}

export interface ArtifactDetail extends ArtifactMeta {
  threads: ReviewThread[]
}
