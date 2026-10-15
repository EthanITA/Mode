export function failReason(error: unknown): string | undefined {
  if (typeof error !== "object" || !error) return undefined;
  const { data, statusMessage } = error as { data?: unknown; statusMessage?: unknown };
  const body = typeof data === "object" && data ? (data as { message?: unknown; statusMessage?: unknown }) : {};
  // The body's message first, because h3 strips anything outside ASCII from statusMessage.
  return [body.message, body.statusMessage, statusMessage].find(
    (said): said is string => typeof said === "string" && Boolean(said),
  );
}
