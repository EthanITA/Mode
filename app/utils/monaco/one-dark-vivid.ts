import type * as MonacoApi from "monaco-editor";

// One Dark Pro with `vivid` and `italic` on, read from Binaryify/OneDark-Pro's themeData.ts and oneDarkPro.ts.
const VIVID = {
  chalky: "#e5c07b",
  coral: "#ef596f",
  fountainBlue: "#2bbac5",
  green: "#89ca78",
  lightDark: "#7f848e",
  lightWhite: "#abb2bf",
  malibu: "#61afef",
  purple: "#d55fde",
  whiskey: "#d19a66",
} as const;

const CHROME = {
  background: "#282c34",
  bar: "#21252b",
  border: "#181a1f",
  button: "#404754",
  cursor: "#528bff",
  lineHighlight: "#2c313c",
  lineNumber: "#495162",
  selection: "#67769660",
} as const;

const hex = (color: string): string => color.slice(1);

// Monarch token names, not TextMate scopes: each takes the colour One Dark Pro gives the scope it stands for.
const theme: MonacoApi.editor.IStandaloneThemeData = {
  base: "vs-dark",
  colors: {
    // One Dark Pro sets only inserted text, so the rest of the diff takes its vivid green and coral.
    "diffEditor.diagonalFill": "#3b404880",
    "diffEditor.insertedLineBackground": "#89ca781a",
    "diffEditor.insertedTextBackground": "#89ca7840",
    "diffEditor.removedLineBackground": "#ef596f1a",
    "diffEditor.removedTextBackground": "#ef596f40",
    "diffEditor.unchangedRegionBackground": CHROME.bar,
    "diffEditor.unchangedRegionForeground": VIVID.lightDark,
    "editor.background": CHROME.background,
    "editor.findMatchBackground": "#d19a6644",
    "editor.foreground": VIVID.lightWhite,
    "editor.lineHighlightBackground": CHROME.lineHighlight,
    "editor.selectionBackground": CHROME.selection,
    "editor.selectionHighlightBackground": "#ffd33d44",
    "editor.wordHighlightBackground": "#d2e0ff2f",
    "editorBracketMatch.background": "#515a6b",
    "editorBracketMatch.border": "#515a6b",
    "editorCursor.foreground": CHROME.cursor,
    "editorGutter.background": CHROME.background,
    "editorHoverWidget.background": CHROME.bar,
    "editorHoverWidget.border": CHROME.border,
    "editorIndentGuide.background1": "#3b4048",
    "editorLineNumber.activeForeground": VIVID.lightWhite,
    "editorLineNumber.foreground": CHROME.lineNumber,
    "editorSuggestWidget.background": CHROME.bar,
    "editorSuggestWidget.selectedBackground": "#2c313a",
    "editorWhitespace.foreground": "#ffffff1d",
    "editorWidget.background": CHROME.bar,
    "scrollbarSlider.activeBackground": "#747d9180",
    "scrollbarSlider.background": "#4e566660",
    "scrollbarSlider.hoverBackground": "#5a637580",
  },
  inherit: true,
  rules: [
    { foreground: hex(VIVID.lightWhite), token: "" },
    { fontStyle: "italic", foreground: hex(VIVID.lightDark), token: "comment" },
    { foreground: hex(VIVID.purple), token: "keyword" },
    { foreground: hex(VIVID.whiskey), token: "keyword.json" },
    { foreground: hex(VIVID.lightWhite), token: "operator" },
    { foreground: hex(VIVID.lightWhite), token: "delimiter" },
    { foreground: hex(VIVID.green), token: "string" },
    { foreground: hex(VIVID.fountainBlue), token: "string.escape" },
    { foreground: hex(VIVID.coral), token: "string.key.json" },
    { foreground: hex(VIVID.malibu), token: "string.link" },
    { foreground: hex(VIVID.whiskey), token: "number" },
    { foreground: hex(VIVID.whiskey), token: "constant" },
    { foreground: hex(VIVID.fountainBlue), token: "regexp" },
    { foreground: hex(VIVID.chalky), token: "type" },
    { foreground: hex(VIVID.coral), token: "identifier" },
    { foreground: hex(VIVID.coral), token: "variable" },
    { foreground: hex(VIVID.chalky), token: "variable.predefined" },
    { foreground: hex(VIVID.malibu), token: "predefined" },
    { foreground: hex(VIVID.malibu), token: "annotation" },
    { foreground: hex(VIVID.coral), token: "tag" },
    { foreground: hex(VIVID.coral), token: "key" },
    { foreground: hex(VIVID.coral), token: "metatag" },
    { fontStyle: "italic", foreground: hex(VIVID.whiskey), token: "attribute.name" },
    { foreground: hex(VIVID.lightWhite), token: "attribute.name.css" },
    { foreground: hex(VIVID.green), token: "attribute.value" },
    { foreground: hex(VIVID.coral), token: "keyword.md" },
    { fontStyle: "italic", foreground: hex(VIVID.purple), token: "emphasis" },
    { fontStyle: "bold", foreground: hex(VIVID.whiskey), token: "strong" },
  ],
};

// Bound on whatever wraps an editor, so its chrome, gutter plus and note tint take the same palette.
const cssVars = {
  "--ed-accent": VIVID.malibu,
  "--ed-add": "#89ca7826",
  "--ed-bar": CHROME.bar,
  "--ed-bg": CHROME.background,
  "--ed-border": CHROME.border,
  "--ed-button": CHROME.button,
  "--ed-ink": VIVID.lightWhite,
  "--ed-muted": VIVID.lightDark,
  "--ed-remove": "#ef596f26",
  "--ed-warn": VIVID.whiskey,
} as const;

export const OneDarkVivid = { CHROME, VIVID, cssVars, name: "one-dark-vivid", theme };
