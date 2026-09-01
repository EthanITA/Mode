export const AXES = ["mode", "style"] as const
export type Axis = (typeof AXES)[number]

export const AUTO = "auto"
export const OFF = "off"

export const FOLDER: Record<Axis, string> = { mode: "modes", style: "styles" }

export const SHARED_PIN_FILE = ".mode"
export const PINS_FILE = "pins.tsv"

// The pair a red-first pipeline swings on; whichever landed last is where the lap stands.
export const RED = "test-fail"
export const GREEN = "test"

export const FALSEY = new Set(["false", "no", "off", "n", "0"])

export const GATES: Record<string, { what: string; switchable: boolean }> = {
  "no-dispatch-without-approval": { what: "spawning a teammate", switchable: false },
  "no-code-without-red": { what: "an implementation edit", switchable: true },
}
