import type * as MonacoApi from "monaco-editor";

let loading: Promise<typeof MonacoApi> | undefined;

// Loaded on first use, so the editor's few megabytes never weigh on a face that does not show a file.
function load(): Promise<typeof MonacoApi> {
  loading ??= (async () => {
    const [monaco, editor, json, css, html, ts] = await Promise.all([
      import("monaco-editor"),
      // The package maps `monaco-editor/<path>` onto `esm/vs/<path>.js`, so a deep import drops both.
      import("monaco-editor/editor/editor.worker?worker"),
      import("monaco-editor/language/json/json.worker?worker"),
      import("monaco-editor/language/css/css.worker?worker"),
      import("monaco-editor/language/html/html.worker?worker"),
      import("monaco-editor/language/typescript/ts.worker?worker"),
    ]);
    self.MonacoEnvironment = {
      getWorker: (_id: string, label: string): Worker => {
        if (label === "json") return new json.default();
        if (label === "css" || label === "scss" || label === "less") return new css.default();
        if (label === "html" || label === "handlebars" || label === "razor") return new html.default();
        if (label === "typescript" || label === "javascript") return new ts.default();
        return new editor.default();
      },
    };
    return monaco;
  })();
  return loading;
}

function themeOf(): "vs" | "vs-dark" {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "vs-dark" : "vs";
}

export const Monaco = { load, themeOf };
