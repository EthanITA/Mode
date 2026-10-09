export type TreeKind = "dir" | "file"

export interface TreeEntry {
  name: string
  path: string
  kind: TreeKind
  ignored?: true
}

export interface TreeListing {
  root: string
  dir: string
  entries: TreeEntry[]
}
