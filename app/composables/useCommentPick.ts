import type { CommentOffer, CommentOwner } from "~/composables/useChrome";
import type { Maybe } from "~/composables/useSidecar";
import type { FrameHit, ViewBox } from "~/types/frame";
import {
  blockAt,
  framesIn,
  type Indexed,
  indexBlocks,
  indexedOf,
  isTyping,
  locate,
  originIn,
  pathOf,
  rectIn,
  selectionIn,
} from "~~/lib/web/page/blocks";

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

interface Pointer {
  clientX: number;
  clientY: number;
  doc: Document;
  target: unknown;
}

function isInside(box: DOMRect, { clientX, clientY }: Pick<Pointer, "clientX" | "clientY">): boolean {
  return clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
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
  let selectedIn: Document | undefined;
  let offered: CommentOffer | undefined;
  let pointer: Pointer | undefined;

  // A frame on a face kept mounted out of sight has no box, and must not clear the ring a shown one lit.
  const isShown = (): boolean => !!frame.value?.getClientRects().length;
  const rootDoc = (): Document | undefined => frame.value?.contentDocument ?? undefined;

  // Only what every clipping ancestor leaves is on screen, so the ring never spills past the pane; grown, no island floats over it.
  function visibleBox(el: HTMLElement): ViewBox {
    let seen: ViewBox = {
      bottom: window.innerHeight,
      left: 0,
      right: window.innerWidth,
      top: artifact.isFull ? 0 : chrome.frame.insets.value.top,
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
    const root = rootDoc();
    const frameBox = frame.value?.getBoundingClientRect();
    if (!held || !root || !frameBox || !frame.value) return undefined;
    const box = rectIn(el, root);
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

  function withdraw(): void {
    chrome.comment.withdraw(offered);
    offered = undefined;
  }

  // Read again on every scroll, so the chip rides with the words and steps aside once they leave the pane.
  function offerFrom(doc: Document): void {
    const selection = selectionIn(doc);
    const hit = selection?.block && hitOf(selection.block);
    if (!selection || !hit || !frame.value) {
      selectedIn = undefined;
      withdraw();
      return;
    }
    selectedIn = doc;
    const { x, y } = originIn(doc, document);
    const { bottom, left, right, top } = selection.end;
    const end = { bottom: bottom + y, left: left + x, right: right + x, top: top + y };
    const clip = visibleBox(frame.value);
    if (end.bottom < clip.top || end.top > clip.bottom) {
      withdraw();
      return;
    }
    offered = { end, spot: spotOf({ hit, owner: owner(), quote: selection.quote }) };
    chrome.comment.offer(offered);
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
    if (selectedIn && !chrome.comment.spot.value) offerFrom(selectedIn);
  }

  // rAF: a sync size write inside ResizeObserver re-notifies the same observer.
  function schedule(): void {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const doc = rootDoc();
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
    selectedIn = undefined;
    withdraw();
  }

  // Another origin's frame swallows the pointer, so while armed it lets it through and is hit-tested by its box.
  function opaqueIn(doc: Document): HTMLIFrameElement[] {
    return [...doc.querySelectorAll("iframe")].filter((one) => !one.contentDocument);
  }

  function shield(doc: Document, on: boolean): void {
    for (const one of opaqueIn(doc)) one.style.pointerEvents = on ? "none" : "";
  }

  function blockUnder(at: Pointer, wide: boolean): Element | undefined {
    const embed = opaqueIn(at.doc).find((one) => isInside(one.getBoundingClientRect(), at));
    return embed ?? blockAt(at.target, { hot, wide });
  }

  // ⌥ changes what the resting pointer means, and nothing else would light the new block until it moved.
  function repick(): void {
    if (!pointer || !chrome.comment.armed.value || chrome.comment.spot.value) return;
    hot = undefined;
    hot = blockUnder(pointer, chrome.comment.wide.value);
    publish();
  }

  function bind(doc: Document): void {
    const win = doc.defaultView;
    if (!win) return;

    const onMove = (event: MouseEvent): void => {
      pointer = { clientX: event.clientX, clientY: event.clientY, doc, target: event.target };
      chrome.comment.widen(event.altKey);
      if (!chrome.comment.armed.value || chrome.comment.spot.value) return;
      hot = blockUnder(pointer, event.altKey);
      publish();
    };
    const onLeave = (): void => {
      pointer = undefined;
      hot = undefined;
      if (!picked) chrome.comment.light(undefined);
    };
    // Unarmed the page is being read, so a block click stays the page's own: no ring, no composer.
    const onClick = (event: MouseEvent): void => {
      if (event.defaultPrevented || chrome.comment.spot.value || !chrome.comment.armed.value) return;
      // A drag that ended here selected words, and the chip asks about those rather than the block.
      if (doc.getSelection()?.isCollapsed === false) return;
      const node = blockUnder(
        { clientX: event.clientX, clientY: event.clientY, doc, target: event.target },
        event.altKey,
      );
      if (!node) return;
      event.preventDefault();
      event.stopPropagation();
      picked = node;
      hot = node;
      const hit = hitOf(node);
      if (hit) chrome.comment.compose(hit, owner());
    };
    const onPointerDown = (): void => {
      selectedIn = undefined;
      chrome.comment.offer(undefined);
    };
    // The selection settles after the release, so it is read on the next frame.
    const onPointerUp = (): void => {
      requestAnimationFrame(() => offerFrom(doc));
    };
    const onSelection = (): void => {
      if (selectedIn === doc && doc.getSelection()?.isCollapsed !== false) {
        selectedIn = undefined;
        withdraw();
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      const meta = event.metaKey || event.ctrlKey;
      if (event.key === "Alt") {
        chrome.comment.widen(true);
        return;
      }
      // A held key auto-repeats into the popover box its own click just focused.
      if (armKey && event.code === armKey) {
        event.preventDefault();
        return;
      }
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (chrome.comment.openOffer()) return;
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
        armKey = event.code;
        chrome.comment.arm(true);
      } else if (event.key.toLowerCase() === "f" && !event.repeat) artifact.toggleFull();
    };
    // A hold begun in the app window ends here once a click has carried focus into the frame.
    const onKeyUp = (event: KeyboardEvent): void => {
      offerFrom(doc);
      if (event.key === "Alt") chrome.comment.widen(false);
      if (event.code !== (armKey ?? "KeyC") || (!armKey && !chrome.comment.held.value)) return;
      armKey = undefined;
      chrome.comment.release();
    };
    const resize = new ResizeObserver(() => schedule());
    resize.observe(doc.body ?? doc.documentElement);
    // A nested page that navigates or loads late brings new blocks, so the whole tree is read again.
    const frames = [...doc.querySelectorAll("iframe")];

    doc.addEventListener("mousemove", onMove);
    doc.addEventListener("mouseleave", onLeave);
    doc.addEventListener("click", onClick, true);
    doc.addEventListener("pointerdown", onPointerDown, true);
    doc.addEventListener("pointerup", onPointerUp, true);
    doc.addEventListener("selectionchange", onSelection);
    doc.addEventListener("keydown", onKeyDown);
    doc.addEventListener("keyup", onKeyUp);
    win.addEventListener("scroll", schedule, { passive: true });
    for (const one of frames) one.addEventListener("load", attach);
    shield(doc, chrome.comment.armed.value);
    watchers.push(() => {
      resize.disconnect();
      doc.removeEventListener("mousemove", onMove);
      doc.removeEventListener("mouseleave", onLeave);
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("pointerup", onPointerUp, true);
      doc.removeEventListener("selectionchange", onSelection);
      doc.removeEventListener("keydown", onKeyDown);
      doc.removeEventListener("keyup", onKeyUp);
      win.removeEventListener("scroll", schedule);
      for (const one of frames) one.removeEventListener("load", attach);
      shield(doc, false);
    });
  }

  function attach(): void {
    detach();
    const root = rootDoc();
    if (!root?.defaultView) return;
    const docs = framesIn(root);

    indexed = docs.reduce<Indexed[]>((into, doc) => indexBlocks(doc, into), []);
    applyInset(root, inset());
    measure(root, indexed);

    const held = chrome.comment.pick.value;
    picked = held && locate(indexed, root, held);
    if (held && !picked) chrome.comment.select(undefined);
    publish();

    for (const doc of docs) bind(doc);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    watchers.push(() => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    });
  }

  watch(inset, (px) => {
    const doc = rootDoc();
    if (doc) applyInset(doc, px);
  });
  watch(chrome.comment.pick, (hit) => {
    if (!hit) picked = undefined;
  });
  watch(chrome.comment.armed, (on) => {
    const root = rootDoc();
    if (root) for (const doc of framesIn(root)) shield(doc, on);
    if (on) repick();
    else clearPick();
  });
  watch(chrome.comment.wide, repick);
  onScopeDispose(detach);

  return { attach, clearPick, detach };
}
