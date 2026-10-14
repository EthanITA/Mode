import { freePort, readRecord, writeRecord } from "~~/lib/web/records";
import { serve } from "~~/server/utils/web/proxy";
import type { WebServeReply } from "~~/shared/types/web";

const MOVES = 5;

function isTaken(error: unknown): boolean {
  return typeof error === "object" && !!error && "code" in error && error.code === "EADDRINUSE";
}

export default defineEventHandler(async (event): Promise<WebServeReply> => {
  const slug = getRouterParam(event, "slug") ?? "";
  let entry = readRecord(slug);
  if (!entry) throw createError({ statusCode: 404, statusMessage: `no web entry '${slug}'` });
  const parent = getRequestHeader(event, "origin") ?? getRequestURL(event).origin;
  const upstream = new URL(entry.url).origin;
  const skip: number[] = [];
  // Another program on the entry's port moves it to a free one, which starts the site's storage over.
  for (let tries = 0; ; tries += 1) {
    try {
      await serve({ parent, port: entry.port, upstream });
      return { port: entry.port, upstream };
    } catch (error) {
      if (!isTaken(error) || tries === MOVES) {
        throw createError({ statusCode: 503, statusMessage: `the proxy for ${slug} could not start on ${entry.port}` });
      }
      skip.push(entry.port);
      entry = { ...entry, port: freePort(skip) };
      writeRecord(entry);
    }
  }
});
