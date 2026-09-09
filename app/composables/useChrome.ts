import type { CanvasFitOptions } from "@cela/design";
import type { ComputedRef, Ref } from "vue";
import type { Maybe, MaybeComputed } from "~/composables/useSidecar";
import type { FrameHit } from "~/types/frame";
import type { ArtifactReviewReply } from "~~/shared/types/artifact";

export const FACES = ["canvas", "read", "history"] as const;
export type Face = (typeof FACES)[number];

export type ToastTone = "destructive" | "neutral" | "success" | "warning";

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

/** Every field is read off the element's own `data-cmt-*`: chrome cannot describe what another domain drew. */
export interface CommentTarget {
  block?: string;
  excerpt?: string;
  file?: string;
  kind: string;
  label: string;
  mark?: string;
  path?: string;
  quote?: string;
  tell: string;
  top?: number;
}

export interface CommentHover {
  height: number;
  label: string;
  left: number;
  top: number;
  width: number;
  x: number;
  y: number;
}

export interface CommentSpot extends CommentTarget {
  x: number;
  y: number;
}

export interface CanvasHooks {
  fit?: (options?: CanvasFitOptions) => void;
  reset?: () => void;
  step?: (factor: number) => void;
  zoom?: () => number;
}

export interface FrameInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Chrome {
  canvas: {
    fit: MaybeComputed<(options?: CanvasFitOptions) => void>;
    register: (hooks: CanvasHooks) => void;
    reset: MaybeComputed<() => void>;
    step: MaybeComputed<(factor: number) => void>;
    zoom: MaybeComputed<number>;
  };
  comment: {
    arm: (holding?: boolean) => void;
    armed: Ref<boolean>;
    close: () => void;
    disarm: () => void;
    hover: Maybe<CommentHover>;
    light: (next?: CommentHover) => void;
    open: (at: CommentSpot) => void;
    pick: Maybe<FrameHit>;
    release: () => void;
    save: (text: string) => void;
    select: (hit?: FrameHit) => void;
    spot: Maybe<CommentSpot>;
  };
  dismiss: () => boolean;
  frame: {
    insets: Ref<FrameInsets>;
    set: (measure: { dock: number; board: number }) => void;
  };
  islands: { shelved: Ref<boolean> };
  jump: { close: () => void; open: Ref<boolean>; toggle: () => void };
  toast: (text: string, tone?: ToastTone) => void;
  toasts: Ref<Toast[]>;
  view: { current: ComputedRef<Face>; faces: Ref<Face[]>; set: (face: Face) => void };
}

function readChromeTokens(): { gutter: number; stageTop: number } {
  const style = getComputedStyle(document.documentElement);
  const gutter = Number.parseFloat(style.getPropertyValue("--gutter")) || 0;
  const island = Number.parseFloat(style.getPropertyValue("--island-row-h")) || 0;
  const stageTop = Number.parseFloat(style.getPropertyValue("--stage-top")) || gutter * 2 + island;
  return { gutter, stageTop };
}

// Not useState: a callback is nothing to hydrate, and the mounted canvas is the only writer.
const hooks = shallowRef<CanvasHooks>({});
let toastSeq = 0;

export function useChrome(): Chrome {
  const tray = useTray();
  const sc = useSidecar();

  const faces = useState<Face[]>("sc:faces", () => []);
  const picked = useState<Face>("sc:view", () => "canvas");
  const jumpOpen = useState<boolean>("sc:jump", () => false);
  const armed = useState<boolean>("sc:cmt-armed", () => false);
  const holding = useState<boolean>("sc:cmt-hold", () => false);
  const spot = useState<CommentSpot | undefined>("sc:cmt-spot");
  const hover = useState<CommentHover | undefined>("sc:cmt-hover");
  const pick = useState<FrameHit | undefined>("sc:cmt-pick");
  const toasts = useState<Toast[]>("sc:toasts", () => []);
  const insets = useState<FrameInsets>("sc:frame-insets", () => ({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  }));
  const shelved = useState<boolean>("sc:islands-shelved", () => false);

  // Clamping here rather than on the click is what makes an unbuilt view unreachable:
  // a stored pick whose domain never landed can never be the current face.
  const current = computed<Face>(() =>
    faces.value.includes(picked.value) ? picked.value : (faces.value[0] ?? "canvas"),
  );

  watch(
    current,
    (face) => {
      shelved.value = face === "history" || face === "read";
    },
    { immediate: true },
  );

  // A colour asserts an outcome, and most of these only say a message left.
  function toast(text: string, tone: ToastTone = "neutral"): void {
    toasts.value = [...toasts.value, { id: ++toastSeq, text, tone }];
  }

  function disarm(): void {
    armed.value = false;
    holding.value = false;
    spot.value = undefined;
    hover.value = undefined;
    pick.value = undefined;
  }

  // A held arm ends with its popover; one armed from the button survives, so several
  // things can be commented on in a row.
  function close(): void {
    spot.value = undefined;
    if (holding.value) disarm();
  }

  function save(text: string): void {
    const at = spot.value;
    const body = text.trim();
    if (!at || !body) return;
    const id = tray.add({
      block: at.block,
      file: at.file,
      kind: at.mark ? "comment" : "element",
      mark: at.mark,
      path: at.path,
      quote: at.quote ?? at.excerpt,
      source: at.mark ? (sc.slug.value ?? at.tell) : at.excerpt ? `${at.tell} — “${at.excerpt}”` : at.tell,
      text: body,
      top: at.top,
    });
    close();
    pick.value = undefined;
    hover.value = undefined;
    toast("In the tray · sends with your next turn");
    void persist(at, body, id);
  }

  async function persist(at: CommentSpot, body: string, id?: string): Promise<void> {
    const slug = sc.slug.value;
    if (!slug || !at.mark) return;
    try {
      const got = await $fetch<ArtifactReviewReply>(`/api/artifacts/${slug}/review`, {
        body: {
          action: "create",
          anchor: { label: at.label, quote: at.quote ?? at.excerpt, sel: at.path, text: at.block },
          body,
        },
        method: "POST",
      });
      if (id && got.thread) tray.patch(id, { thread: got.thread.id });
      if (sc.artifact.value) sc.artifact.value = { ...sc.artifact.value, threads: got.threads };
    } catch {
      // A page with no review seed stays tray-only; the card still resolves locally.
    }
  }

  function dismiss(): boolean {
    if (spot.value) {
      close();
      return true;
    }
    if (pick.value) {
      pick.value = undefined;
      hover.value = undefined;
      return true;
    }
    if (armed.value) {
      disarm();
      return true;
    }
    if (jumpOpen.value) {
      jumpOpen.value = false;
      return true;
    }
    return false;
  }

  function register(next: CanvasHooks): void {
    hooks.value = next;
    onScopeDispose(() => {
      if (hooks.value === next) hooks.value = {};
    }, true);
  }

  function set(measure: { dock: number; board: number }): void {
    const { gutter, stageTop } = readChromeTokens();
    insets.value = {
      top: stageTop,
      right: measure.board + 2 * gutter,
      bottom: measure.dock + 2 * gutter,
      left: gutter,
    };
  }

  return {
    canvas: {
      fit: computed(() => hooks.value.fit),
      register,
      reset: computed(() => hooks.value.reset),
      step: computed(() => hooks.value.step),
      zoom: computed(() => hooks.value.zoom?.()),
    },
    comment: {
      arm: (down = false) => {
        if (!armed.value) holding.value = down;
        armed.value = true;
        spot.value = undefined;
      },
      armed,
      close,
      disarm,
      hover,
      light: (next) => {
        hover.value = next;
      },
      open: (at) => {
        spot.value = at;
      },
      pick,
      release: () => {
        if (holding.value && !spot.value && !pick.value) disarm();
      },
      save,
      select: (hit) => {
        pick.value = hit;
        hover.value = hit
          ? {
              height: hit.height,
              label: hit.label || hit.path,
              left: hit.viewLeft,
              top: hit.viewTop,
              width: hit.width,
              x: Math.min(hit.viewLeft + hit.width + 12, window.innerWidth - 360),
              y: hit.viewTop,
            }
          : undefined;
      },
      spot,
    },
    dismiss,
    frame: { insets, set },
    islands: { shelved },
    jump: {
      close: () => {
        jumpOpen.value = false;
      },
      open: jumpOpen,
      toggle: () => {
        jumpOpen.value = !jumpOpen.value;
      },
    },
    toast,
    toasts,
    view: {
      current,
      faces,
      set: (face) => {
        picked.value = face;
      },
    },
  };
}
