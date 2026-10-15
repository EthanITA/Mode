import { createReadStream, statSync } from "node:fs";
import { basename } from "node:path";
import type { H3Event } from "h3";
import mime from "mime";
import { readTextSafe } from "../../lib/files.ts";
import { Markdown } from "./markdown.ts";

type Span = { start: number; end: number };

// One span is all a media element asks for, so a multi-range header is served whole; range-parser ships no types.
function spanOf(header: string | undefined, size: number): Span | undefined {
  const [unit, spec = ""] = (header ?? "").split("=");
  if (unit !== "bytes" || spec.includes(",")) return undefined;
  const [from = "", to = ""] = spec.split("-");
  if (!from && !to) return undefined;
  const start = from ? Number(from) : Math.max(0, size - Number(to));
  const end = from && to ? Math.min(Number(to), size - 1) : size - 1;
  return Number.isInteger(start) && Number.isInteger(end) && start <= end ? { start, end } : undefined;
}

function typeOf(name: string): string {
  const type = mime.getType(name) ?? "application/octet-stream";
  return type.startsWith("text/") || type.endsWith("+xml") ? `${type}; charset=utf-8` : type;
}

// `file` is what is read and `name` what it is, since a review original sits in a blob with no extension.
async function send(event: H3Event, { file, name, isMarkdownPage }: Media.Send): Promise<unknown> {
  // A turn rewrites the file in place, so a cached copy would show the version before it.
  setResponseHeader(event, "cache-control", "no-store");
  if (isMarkdownPage) {
    setResponseHeader(event, "content-type", "text/html; charset=utf-8");
    return Markdown.page({ markdown: readTextSafe(file) ?? "", title: basename(name) });
  }
  const { size } = statSync(file);
  const span = spanOf(getRequestHeader(event, "range"), size);
  setResponseHeaders(event, { "accept-ranges": "bytes", "content-type": typeOf(name) });
  if (!span) {
    setResponseHeader(event, "content-length", size);
    return sendStream(event, createReadStream(file));
  }
  setResponseStatus(event, 206);
  setResponseHeaders(event, {
    "content-length": span.end - span.start + 1,
    "content-range": `bytes ${span.start}-${span.end}/${size}`,
  });
  return sendStream(event, createReadStream(file, span));
}

export const Media = { send };

export namespace Media {
  export interface Send {
    file: string;
    name: string;
    isMarkdownPage?: boolean;
  }
}
