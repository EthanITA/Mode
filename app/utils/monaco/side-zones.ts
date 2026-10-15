import type * as MonacoApi from "monaco-editor";
import type { LineSpan } from "./notes";

export interface SideZonesOptions {
  api: typeof MonacoApi;
  editor: MonacoApi.editor.ICodeEditor;
}

export interface SideLight {
  isPointed: boolean;
  lines: LineSpan;
}

export interface SideZones {
  dispose: () => void;
  fit: (id: string, height: number) => void;
  light: (spans: SideLight[]) => void;
  place: (id: string, afterLine: number, host: HTMLElement) => void;
  remove: (id: string) => void;
  reveal: (lines: LineSpan) => void;
}

interface Placed {
  after: number;
  delegate: MonacoApi.editor.IViewZone;
  host: HTMLElement;
  widget: MonacoApi.editor.IOverlayWidget;
  zone?: string;
}

const START_HEIGHT = 120;

// Monaco's own peek view does the same: the zone only holds the room, and an overlay widget carries what you click.
function attach({ api, editor }: SideZonesOptions): SideZones {
  const placed = new Map<string, Placed>();
  const lit = editor.createDecorationsCollection();
  let shown: SideLight[] = [];

  function frame(host: HTMLElement): void {
    const info = editor.getLayoutInfo();
    host.style.left = `${info.contentLeft}px`;
    host.style.width = `${Math.max(0, info.width - info.contentLeft - info.verticalScrollbarWidth - info.minimap.minimapWidth)}px`;
  }

  function addZone(one: Placed): void {
    editor.changeViewZones((accessor) => {
      one.zone = accessor.addZone(one.delegate);
    });
  }

  function place(id: string, afterLine: number, host: HTMLElement): void {
    if (placed.has(id)) return;
    host.style.position = "absolute";
    host.style.top = "-100000px";
    frame(host);
    const one: Placed = {
      after: afterLine,
      delegate: {
        afterLineNumber: afterLine,
        domNode: document.createElement("div"),
        heightInPx: START_HEIGHT,
        onDomNodeTop: (top) => {
          host.style.top = `${top}px`;
        },
        suppressMouseDown: true,
      },
      host,
      widget: { getDomNode: () => host, getId: () => `side-question.${id}`, getPosition: () => null },
    };
    placed.set(id, one);
    editor.addOverlayWidget(one.widget);
    addZone(one);
  }

  // A zone scrolled out of view reports no height, so a zero would collapse the room for good.
  function fit(id: string, height: number): void {
    const one = placed.get(id);
    if (!one || height <= 0 || one.delegate.heightInPx === height) return;
    one.delegate.heightInPx = height;
    editor.changeViewZones((accessor) => {
      if (one.zone) accessor.layoutZone(one.zone);
    });
  }

  function remove(id: string): void {
    const one = placed.get(id);
    if (!one) return;
    editor.changeViewZones((accessor) => {
      if (one.zone) accessor.removeZone(one.zone);
    });
    editor.removeOverlayWidget(one.widget);
    placed.delete(id);
  }

  function light(spans: SideLight[]): void {
    shown = spans;
    const count = editor.getModel()?.getLineCount() ?? 0;
    lit.set(
      spans
        .filter(({ lines }) => lines[0] <= count)
        .map(({ isPointed, lines }) => ({
          options: { className: isPointed ? "monaco-pointed" : "monaco-asked", isWholeLine: true },
          range: new api.Range(lines[0], 1, Math.min(lines[1], count), 1),
        })),
    );
  }

  function reveal([first, last]: LineSpan): void {
    editor.revealLinesInCenterIfOutsideViewport(first, last);
  }

  const listeners = [
    editor.onDidLayoutChange(() => {
      for (const one of placed.values()) frame(one.host);
    }),
    // A new model is a new view, which keeps the overlay widgets but drops every zone and decoration.
    editor.onDidChangeModel(() => {
      for (const one of placed.values()) addZone(one);
      light(shown);
    }),
    // setValue keeps the zones yet destroys every decoration, and a turn rewriting the file does exactly that.
    editor.onDidChangeModelContent((event) => {
      if (event.isFlush) light(shown);
    }),
  ];

  function dispose(): void {
    for (const listener of listeners) listener.dispose();
    for (const id of [...placed.keys()]) remove(id);
    lit.clear();
  }

  return { dispose, fit, light, place, remove, reveal };
}

export const SideZones = { attach };
