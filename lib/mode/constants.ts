import type { Axis } from "../../shared/types/mode.ts";

export const AXES = ["mode", "style"] as const satisfies readonly Axis[];
export const AUTO = "auto";
export const OFF = "off";
export const FOLDER: Record<Axis, string> = { mode: "modes", style: "styles" };

export const BOOLEANS = [
  "enter-never",
  "enter-over-pin",
  "no-dispatch-without-approval",
  "no-implement",
  "no-code-without-red",
];
export const FALSEY = new Set(["false", "no", "off", "n", "0"]);
export const STANDING = "standing reminder";

// Committed beside the code, so a repo hands every clone of it the same pair with nobody typing one.
export const SHARED_PIN_FILE = ".mode";
export const PINS_FILE = "pins.tsv";

// The pair a red-first pipeline swings on. Whichever landed last is where the lap stands.
export const RED = "test-fail";
export const GREEN = "test";

// A gate hook is always on; a guard under hooks/guards/ answers to the config switch.
export const GATES: Record<string, { what: string; switchable: boolean }> = {
  "no-dispatch-without-approval": { what: "spawning a teammate", switchable: false },
  "no-code-without-red": { what: "an implementation edit", switchable: true },
};

export const MARK: Record<string, string> = { chosen: "~", pinned: "=" };
// A hook repeats this every turn, so each axis is capped and the pair still fits in eight lines.
export const STANDING_LINES = 4;
// One colour per mode. Orange and violet are 256-colour because no unused 16-colour code reads apart from these.
export const COLORS: Record<string, string> = {
  red: "31",
  green: "32",
  yellow: "33",
  blue: "34",
  magenta: "35",
  cyan: "36",
  grey: "90",
  sky: "94",
  pink: "95",
  orange: "38;5;208",
  violet: "38;5;141",
};
export const RESET = "\x1b[0m";
// Both are East Asian Wide: a narrow emoji here measures one column and renders two, misaligning the row.
export const CHIP_ICON = { mode: "\u{1f9ed}", style: "\u{1f4ac}", deliverable: "\u{1f3af}" };
