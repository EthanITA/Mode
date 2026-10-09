import type * as MonacoApi from "monaco-editor";

export type LineSpan = [first: number, last: number];

export interface NoteAt {
  lines: LineSpan;
  quote: string;
  x: number;
  y: number;
}

export interface NotesOptions {
  api: typeof MonacoApi;
  editor: MonacoApi.editor.IStandaloneCodeEditor;
  /** Called with 1-based lines and where the popover should sit; the caller opens it, since it owns the chrome. */
  onNote: (at: NoteAt) => void;
}

export interface Notes {
  dispose: () => void;
  note: (line?: number) => void;
  paint: (spans: { lines: LineSpan; text: string }[]) => void;
}

// The popover is 420 wide and about 300 tall, and stays inside the window.
const POPOVER = { height: 312, width: 432 };
const HINT = "Note for Claude · ⌘K";

function linesOf(editor: MonacoApi.editor.ICodeEditor, line?: number): LineSpan {
  const selection = editor.getSelection();
  const start = selection?.startLineNumber ?? 1;
  const end = selection?.endLineNumber ?? start;
  if (selection && !selection.isEmpty() && (!line || (line >= start && line <= end))) {
    // A selection that ends at the start of a line does not take that line.
    return [start, selection.endColumn === 1 && end > start ? end - 1 : end];
  }
  const at = line ?? selection?.positionLineNumber ?? 1;
  return [at, at];
}

// A comment icon in the glyph margin follows the pointer, so a note is one click from any line; ⌘K and the menu have it too.
function attach({ api, editor, onNote }: NotesOptions): Notes {
  const hovered = editor.createDecorationsCollection();
  const noted = editor.createDecorationsCollection();

  function note(line?: number): void {
    const model = editor.getModel();
    const box = editor.getDomNode()?.getBoundingClientRect();
    if (!model || !box) return;
    const lines = linesOf(editor, line);
    const [start, end] = lines;
    const quote = model.getValueInRange(new api.Range(start, 1, end, model.getLineMaxColumn(end)));
    const at = editor.getScrolledVisiblePosition({ column: 1, lineNumber: end + 1 });
    onNote({
      lines,
      quote,
      x: Math.max(12, Math.min(box.left + (at?.left ?? 0), window.innerWidth - POPOVER.width)),
      y: Math.max(12, Math.min(box.top + (at?.top ?? 0) + 6, window.innerHeight - POPOVER.height)),
    });
  }

  const listeners = [
    editor.onMouseMove((event) => {
      const line = event.target.position?.lineNumber;
      const options = { glyphMarginClassName: "monaco-note-add", glyphMarginHoverMessage: { value: HINT } };
      hovered.set(line ? [{ options, range: new api.Range(line, 1, line, 1) }] : []);
    }),
    editor.onMouseLeave(() => hovered.clear()),
    editor.onMouseDown((event) => {
      if (event.target.type !== api.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      event.event.preventDefault();
      note(event.target.position?.lineNumber);
    }),
    editor.addAction({
      contextMenuGroupId: "navigation",
      contextMenuOrder: 0,
      id: "sidecar.note",
      // Registered after Monaco's own ⌘K chords, so it wins the first key and those chords go quiet here.
      keybindings: [api.KeyMod.CtrlCmd | api.KeyCode.KeyK],
      label: "Note for Claude",
      run: () => note(),
    }),
  ];

  function paint(spans: { lines: LineSpan; text: string }[]): void {
    noted.set(
      spans.map(({ lines, text }) => ({
        options: {
          className: "monaco-noted",
          glyphMarginClassName: "monaco-noted-glyph",
          glyphMarginHoverMessage: { value: text },
          isWholeLine: true,
        },
        range: new api.Range(lines[0], 1, lines[1], 1),
      })),
    );
  }

  function dispose(): void {
    for (const listener of listeners) listener.dispose();
    hovered.clear();
    noted.clear();
  }

  return { dispose, note, paint };
}

function spanOf([first, last]: LineSpan): string {
  return first === last ? `line ${first}` : `lines ${first}-${last}`;
}

function parse(span: string): LineSpan | undefined {
  const [, first, last] = /(\d+)(?:-(\d+))?/.exec(span) ?? [];
  return first ? [Number(first), Number(last ?? first)] : undefined;
}

export const EditorNotes = { attach, parse, spanOf };
