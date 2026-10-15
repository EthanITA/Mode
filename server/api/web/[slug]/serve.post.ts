import { PROXY_PORT, readRecord } from "~~/lib/web/records";
import { serve } from "~~/server/utils/web/proxy";
import type { WebServeReply } from "~~/shared/types/web";

const MOVES = 5;

function isTaken(error: unknown): boolean {
  return typeof error === "object" && !!error && "code" in error && error.code === "EADDRINUSE";
}

export default defineEventHandler(async (event): Promise<WebServeReply> => {
  const slug = getRouterParam(event, "slug") ?? "";
  if (!readRecord(slug)) throw createError({ statusCode: 404, statusMessage: `no web entry '${slug}'` });
  const parent = getRequestHeader(event, "origin") ?? getRequestURL(event).origin;
  // Another program on the port moves every artifact to the next free one, where sites' storage starts over.
  for (let port = PROXY_PORT; ; port += 1) {
    try {
      await serve({ parent, port });
      return { port };
    } catch (error) {
      if (!isTaken(error) || port === PROXY_PORT + MOVES) {
        throw createError({ statusCode: 503, statusMessage: `the web proxy could not start on ${port}` });
      }
    }
  }
});
