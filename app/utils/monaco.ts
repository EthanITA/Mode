import type * as MonacoApi from "monaco-editor";
import { OneDarkVivid } from "./monaco/one-dark-vivid";

let loading: Promise<typeof MonacoApi> | undefined;

// Extensions and dotfiles Monaco ships no language for, sent to the closest one it has.
const BY_EXTENSION: Record<string, string> = {
  astro: "html",
  cfg: "ini",
  conf: "ini",
  env: "shell",
  fish: "shell",
  json5: "json",
  jsonc: "json",
  ksh: "shell",
  plist: "xml",
  svelte: "html",
  svg: "xml",
  toml: "ini",
  vue: "html",
  zsh: "shell",
};

const BY_NAME: Record<string, string> = {
  ".bashrc": "shell",
  ".dockerignore": "shell",
  ".envrc": "shell",
  ".gitignore": "shell",
  ".npmrc": "ini",
  ".profile": "shell",
  ".zprofile": "shell",
  ".zshenv": "shell",
  ".zshrc": "shell",
  Brewfile: "ruby",
  Gemfile: "ruby",
  Makefile: "shell",
  Podfile: "ruby",
  Rakefile: "ruby",
};

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
    // A file opens without its project, so type errors would only be unresolved imports; syntax errors stay.
    for (const defaults of [monaco.typescript.typescriptDefaults, monaco.typescript.javascriptDefaults]) {
      defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
    }
    monaco.json.jsonDefaults.setDiagnosticsOptions({ allowComments: true, trailingCommas: "ignore", validate: true });
    monaco.editor.defineTheme(OneDarkVivid.name, OneDarkVivid.theme);
    return monaco;
  })();
  return loading;
}

// Undefined leaves the choice to Monaco, which reads the model URI's extension and file name itself.
function languageOf(path: string): string | undefined {
  const name = path.split("/").pop() ?? "";
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() : undefined;
  return (
    BY_NAME[name] ??
    (name.startsWith(".env") ? "shell" : undefined) ??
    (extension ? BY_EXTENSION[extension] : undefined)
  );
}

export const Monaco = { languageOf, load };
