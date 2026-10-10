export interface Topics {
  "artifact.created": { slug: string; title: string; path: string };
}

export type Topic = keyof Topics;

// Kafka's convention: the offset is where the next event starts, so a consumer resumes from the last one it handled.
export type SidecarEvent<T extends Topic = Topic> = {
  [K in T]: { topic: K; key?: string; at: string; offset: number; data: Topics[K] };
}[T];
