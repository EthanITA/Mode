export type PreviewKind = "audio" | "image" | "markdown" | "page" | "pdf" | "video";

// How far along each axis a pane is scrolled, 0 to 1, so two panes of different lengths still line up.
export interface PreviewScroll {
  x: number;
  y: number;
}

export interface PreviewSrcOptions {
  conversation: string;
  path: string;
  version?: string;
  isOriginal?: boolean;
}

// What Chrome draws natively, so a tiff or a heic never offers a preview that comes up blank.
const EXTENSIONS: Record<PreviewKind, readonly string[]> = {
  audio: ["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav"],
  image: ["apng", "avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"],
  markdown: ["markdown", "md"],
  page: ["htm", "html"],
  pdf: ["pdf"],
  video: ["m4v", "mov", "mp4", "ogv", "webm"],
};

const KIND_OF = new Map(
  (Object.entries(EXTENSIONS) as [PreviewKind, readonly string[]][]).flatMap(([kind, list]) =>
    list.map((extension) => [extension, kind] as const),
  ),
);

const TEXT = new Set(["htm", "html", "markdown", "md", "svg"]);
const ZOOMABLE = new Set<PreviewKind>(["image", "markdown", "page", "video"]);
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

function extensionOf(path: string): string {
  const name = path.split("/").pop() ?? "";
  return name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
}

function kindOf(path: string): PreviewKind | undefined {
  return KIND_OF.get(extensionOf(path));
}

// Text the editor opens as well, so the face offers the code beside the rendering.
function isText(path: string): boolean {
  return TEXT.has(extensionOf(path));
}

// A PDF and an audio file come with their own controls.
function isZoomable(kind: PreviewKind): boolean {
  return ZOOMABLE.has(kind);
}

// Each segment encoded on its own, so the route keeps the file's folder and a page's relative assets resolve beside it.
function srcOf({ conversation, path, version, isOriginal = false }: PreviewSrcOptions): string {
  const route = isOriginal ? "review/original" : "files/raw";
  const query = new URLSearchParams();
  if (kindOf(path) === "markdown") query.set("as", "page");
  if (version) query.set("v", version);
  return `/api/sessions/${encodeURIComponent(conversation)}/${route}${path.split("/").map(encodeURIComponent).join("/")}?${query}`;
}

function step(zoom: number, way: 1 | -1): number {
  const next = way > 0 ? STEPS.find((one) => one > zoom + 0.001) : STEPS.findLast((one) => one < zoom - 0.001);
  return next ?? zoom;
}

function clamp(zoom: number): number {
  return Math.min(STEPS.at(-1) ?? zoom, Math.max(STEPS[0] ?? zoom, zoom));
}

// A mouse notch arrives as a hundred pixels and a pinch as a few, so one notch is capped near a quarter.
function pinch(zoom: number, deltaY: number): number {
  return clamp(zoom * Math.exp(-Math.max(-30, Math.min(30, deltaY)) / 100));
}

export const Preview = { clamp, isText, isZoomable, kindOf, pinch, srcOf, step };
