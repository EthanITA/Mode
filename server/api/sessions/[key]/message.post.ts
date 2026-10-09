import { deliver, type DeliverResult } from "~~/server/utils/sessions/inbox";

type MessageResponse = DeliverResult;

type MessageBody = { text: string; slug?: string };

function payloadOf(raw: unknown): MessageBody | undefined {
  if (typeof raw !== "object" || !raw) return undefined;
  const record = raw as Record<string, unknown>;
  const text = record.text;
  if (typeof text !== "string" || !text) return undefined;
  const slug = record.slug;
  return { text, slug: typeof slug === "string" && slug ? slug : undefined };
}

export default defineEventHandler(async (event): Promise<MessageResponse> => {
  const key = getRouterParam(event, "key") || "";
  const body = payloadOf(await readBody(event));
  if (!key || !body) return { delivered: false, reason: "refused-by-inbox" };
  return deliver({ key, text: body.text, slug: body.slug });
});
