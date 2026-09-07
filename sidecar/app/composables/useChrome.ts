import type { ComputedRef, Ref } from "vue";
import type { Maybe, MaybeComputed } from "~/composables/useSidecar";

export const FACES = ["canvas", "read", "history"] as const;
export type Face = (typeof FACES)[number];

export type ToastTone = "destructive" | "success" | "warning";

export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
}

/** Every field is read off the element's own `data-cmt-*`: chrome cannot describe what another domain drew. */
export interface CommentTarget {
  excerpt?: string;
  kind: string;
  label: string;
  tell: string;
}

export interface CommentSpot extends CommentTarget {
  x: number;
  y: number;
}

export interface CanvasHooks {
  fit?: () => void;
  zoom?: () => number;
}

export interface Chrome {
  canvas: {
    fit: MaybeComputed<() => void>;
    register: (hooks: CanvasHooks) => void;
    zoom: MaybeComputed<number>;
  };
  comment: {
    arm: (holding?: boolean) => void;
    armed: Ref<boolean>;
    close: () => void;
    disarm: () => void;
    open: (at: CommentSpot) => void;
    release: () => void;
    save: (text: string) => void;
    spot: Maybe<CommentSpot>;
  };
  dismiss: () => boolean;
  jump: { close: () => void; open: Ref<boolean>; toggle: () => void };
  toast: (text: string, tone?: ToastTone) => void;
  toasts: Ref<Toast[]>;
  view: { current: ComputedRef<Face>; faces: Ref<Face[]>; set: (face: Face) => void };
}

const TOAST_MS = 2800;

// Not useState: a callback is nothing to hydrate, and the mounted canvas is the only writer.
const hooks = shallowRef<CanvasHooks>({});
let toastSeq = 0;

export function useChrome(): Chrome {
  const tray = useTray();

  const faces = useState<Face[]>("sc:faces", () => []);
  const picked = useState<Face>("sc:view", () => "canvas");
  const jumpOpen = useState<boolean>("sc:jump", () => false);
  const armed = useState<boolean>("sc:cmt-armed", () => false);
  const holding = useState<boolean>("sc:cmt-hold", () => false);
  const spot = useState<CommentSpot | undefined>("sc:cmt-spot");
  const toasts = useState<Toast[]>("sc:toasts", () => []);

  // Clamping here rather than on the click is what makes an unbuilt view unreachable:
  // a stored pick whose domain never landed can never be the current face.
  const current = computed<Face>(() =>
    faces.value.includes(picked.value) ? picked.value : (faces.value[0] ?? "canvas"),
  );

  function toast(text: string, tone: ToastTone = "success"): void {
    const id = ++toastSeq;
    toasts.value = [...toasts.value, { id, text, tone }];
    window.setTimeout(() => {
      toasts.value = toasts.value.filter((row) => row.id !== id);
    }, TOAST_MS);
  }

  function disarm(): void {
    armed.value = false;
    holding.value = false;
    spot.value = undefined;
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
    tray.add({
      kind: "element",
      source: at.excerpt ? `${at.tell} — “${at.excerpt}”` : at.tell,
      text: body,
    });
    close();
    toast("In the tray · sends with your next turn");
  }

  function dismiss(): boolean {
    if (spot.value) {
      close();
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

  return {
    canvas: {
      fit: computed(() => hooks.value.fit),
      register,
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
      open: (at) => {
        spot.value = at;
      },
      release: () => {
        if (holding.value && !spot.value) disarm();
      },
      save,
      spot,
    },
    dismiss,
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
