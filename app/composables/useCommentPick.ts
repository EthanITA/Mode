import type { CommentOwner } from "~/composables/useChrome";
import type { Maybe } from "~/composables/useSidecar";
import type { FrameHit, ViewBox } from "~/types/frame";
import { blockAt, type Indexed, indexBlocks, indexedOf, isTyping, locate, pathOf } from "~~/lib/web/page/blocks";

export interface CommentPickOptions {
  edit?: () => void;
  frame: Maybe<HTMLIFrameElement>;
  inset?: () => number;
  measure: (doc: Document, indexed: Indexed[]) => void;
  owner: () => CommentOwner;
}

export interface CommentPick {
  attach: () => void;
  clearPick: () => void;
  detach: () => void;
}

// Padding on the root narrows everything in flow while the root's and body's grounds still paint the full width.
function applyInset(doc: Document, px: number): void {
  if (px) doc.documentElement.style.setProperty("padding-inline-end", `${px}px`, "important");
  else doc.documentElement.style.removeProperty("padding-inline-end");
}

export function useCommentPick({ edit, frame, inset = () => 0, measure, owner }: CommentPickOptions): CommentPick {
  const chrome = useChrome();
  const artifact = $artifact();

  let watchers: (() => void)[] = [];
  let indexed: Indexed[] = [];
  let hot: Element | undefined;
  let picked: Element | undefined;
  let armKey: string | undefined;
  let raf = 0;

  // A frame on a face kept mounted out of sight has no box, and must not clear the ring a shown one lit.
  const isShown = (): boolean => !!frame.value?.getClientRects().length;

  // Only what every clipping ancestor leaves is on screen, so the ring never spills past the pane.
  function visibleBox(el: HTMLElement): ViewBox {
    let seen: ViewBox = {
      bottom: window.innerHeight,
      left: 0,
      right: window.innerWidth,
      top: chrome.frame.insets.value.top,
    };
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(node);
      if (overflowX === "visible" && overflowY === "visible") continue;
      const box = node.getBoundingClientRect();
      seen = {
        bottom: Math.min(seen.bottom, box.bottom),
        left: Math.max(seen.left, box.left),
        right: Math.min(seen.right, box.right),
        top: Math.max(seen.top, box.top),
      };
    }
    return seen;
  }

  function hitOf(el: Element): FrameHit | undefined {
    const held = indexedOf(indexed, el);
    const box = el.getBoundingClientRect();
    const frameBox = frame.value?.getBoundingClientRect();
    if (!held || !frameBox || !frame.value) return undefined;
    return {
      clip: visibleBox(frame.value),
      height: box.height,
      key: held.key,
      label: held.label,
      left: box.left,
      path: pathOf(el),
      text: held.text,
      top: box.top,
      viewLeft: frameBox.left + box.left,
      viewTop: frameBox.top + box.top,
      width: box.width,
    };
  }

  function publish(): void {
    if (!isShown()) return;
    if (picked) {
      const hit = hitOf(picked);
      if (hit) chrome.comment.select(hit);
    }
    if (hot && hot !== picked) {
      const hit = hitOf(hot);
      if (hit) chrome.comment.light(ringOf(hit));
    } else if (!picked && !hot) chrome.comment.light(undefined);
  }

  // rAF: a sync size write inside ResizeObserver re-notifies the same observer.
  function schedule(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const doc = frame.value?.contentDocument;
      if (doc) measure(doc, indexed);
      publish();
    });
  }

  function clearPick(): void {
    picked = undefined;
    hot = undefined;
    chrome.comment.select(undefined);
    chrome.comment.light(undefined);
  }

  function detach(): void {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    for (const off of watchers) off();
    watchers = [];
    indexed = [];
    hot = undefined;
    picked = undefined;
  }

  function attach(): void {
    detach();
    const doc = frame.value?.contentDocument;
    const win = doc?.defaultView;
    if (!doc || !win) return;

    indexed = indexBlocks(doc);
    applyInset(doc, inset());
    measure(doc, indexed);

    const held = chrome.comment.pick.value;
    picked = held && locate(indexed, doc, held);
    if (held && !picked) chrome.comment.select(undefined);
    publish();

    const resize = new ResizeObserver(() => schedule());
    resize.observe(doc.body ?? doc.documentElement);

    const onMove = (event: MouseEvent): void => {
      if (!chrome.comment.armed.value || chrome.comment.spot.value) return;
      hot = blockAt(event.target);
      publish();
    };
    const onLeave = (): void => {
      hot = undefined;
      if (!picked) chrome.comment.light(undefined);
    };
    // Unarmed the page is being read, so a block click stays the page's own: no ring, no composer.
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || chrome.comment.spot.value || !chrome.comment.armed.value) return;
      const node = blockAt(event.target);
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      picked = node;
      hot = node;
      const hit = hitOf(node);
      if (hit) chrome.comment.compose(hit, owner());
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      const meta = event.metaKey || event.ctrlKey;
      // A held key auto-repeats into the popover box its own click just focused.
      if (armKey && event.key.toLowerCase() === armKey) {
        event.preventDefault();
        return;
      }
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if ((picked || hot) && edit) edit();
        else if (chrome.comment.armed.value) chrome.comment.disarm();
        else chrome.comment.arm();
        return;
      }
      if (event.key === "Escape") {
        if (chrome.dismiss()) event.preventDefault();
        return;
      }
      if (meta || event.altKey || isTyping(event.target)) return;
      if (event.key.toLowerCase() === "c" && !event.repeat) {
        armKey = "c";
        chrome.comment.arm(true);
      } else if (event.key.toLowerCase() === "f" && !event.repeat) artifact.toggleFull();
    };
    // A hold begun in the app window ends here once a click has carried focus into the frame.
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== "c" || (!armKey && !chrome.comment.held.value)) return;
      armKey = undefined;
      chrome.comment.release();
    };

    doc.addEventListener("mousemove", onMove);
    doc.addEventListener("mouseleave", onLeave);
    doc.addEventListener("click", onClick, true);
    doc.addEventListener("keydown", onKeyDown);
    doc.addEventListener("keyup", onKeyUp);
    win.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    watchers.push(() => {
      resize.disconnect();
      doc.removeEventListener("mousemove", onMove);
      doc.removeEventListener("mouseleave", onLeave);
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("keydown", onKeyDown);
      doc.removeEventListener("keyup", onKeyUp);
      win.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    });
  }

  watch(inset, (px) => {
    const doc = frame.value?.contentDocument;
    if (doc) applyInset(doc, px);
  });
  watch(chrome.comment.pick, (hit) => {
    if (!hit) picked = undefined;
  });
  watch(chrome.comment.armed, (on) => {
    if (!on) clearPick();
  });
  onScopeDispose(detach);

  return { attach, clearPick, detach };
}
