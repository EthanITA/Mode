export type ActionKind = "send" | "approve" | "commit" | "publish" | "export";

export type ActionTone = "neutral" | "primary";

export interface ActionSubject {
  file: string;
  recipient?: string;
  slug?: string;
}

export interface ArtifactAction {
  kind: ActionKind;
  label: string;
  hint: string;
  title: string;
  tone: ActionTone;
  done: string;
  prompt: (subject: ActionSubject) => string;
}

export type DeliveryFailure = "no-live-session" | "refused-by-inbox" | "request-failed";

export type SayOutcome = { delivered: true } | { delivered: false; reason: DeliveryFailure; detail?: string };

export type ActionOutcome = SayOutcome & { toast: string };

const ACTIONS: Record<ActionKind, ArtifactAction> = {
  send: {
    kind: "send",
    label: "Send",
    hint: "mail",
    tone: "neutral",
    done: "sent",
    title: "Claude sends it; the receipt lands in the transcript",
    prompt: (subject) => `Send ${subject.file} to ${subject.recipient ?? "its recipient"}`,
  },
  approve: {
    kind: "approve",
    label: "Approve",
    hint: "/approve",
    tone: "primary",
    done: "approved",
    title: "Records the yes and opens the dispatch gate",
    prompt: (subject) => `/approve ${subject.slug ?? subject.file}`,
  },
  commit: {
    kind: "commit",
    label: "Commit",
    hint: "git",
    tone: "neutral",
    done: "committed",
    title: "Claude commits this file",
    prompt: (subject) => `Commit ${subject.file}`,
  },
  publish: {
    kind: "publish",
    label: "Publish",
    hint: "wiki",
    tone: "neutral",
    done: "published",
    title: "Claude publishes it to the wiki",
    prompt: (subject) => `Publish ${subject.file} to the wiki`,
  },
  export: {
    kind: "export",
    label: "Export",
    hint: "png",
    tone: "neutral",
    done: "exported",
    title: "Claude exports a PNG beside the source",
    prompt: (subject) => `Export ${subject.file} as PNG`,
  },
};

const EXT_KIND: Record<string, ActionKind> = { eml: "send", html: "publish", svg: "export" };

// A tracked file carries no type of its own; extension is the only signal, unrecognized ones default to commit.
export function actionForFile(path: string): ArtifactAction {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return ACTIONS[EXT_KIND[ext] ?? "commit"];
}

export const SPEC_ACTION: ArtifactAction = ACTIONS.approve;

const REFUSAL_TOAST: Record<DeliveryFailure, (file: string) => string> = {
  "no-live-session": (file) => `${file} wasn't sent — this session isn't live.`,
  "refused-by-inbox": (file) => `${file} wasn't sent — the session refused it.`,
  "request-failed": (file) => `${file} wasn't sent — couldn't reach the session.`,
};

export function toastFor(action: ArtifactAction, subject: ActionSubject, outcome: SayOutcome): string {
  if (outcome.delivered) return `Asked Claude to ${action.label.toLowerCase()} ${subject.file}`;
  return REFUSAL_TOAST[outcome.reason](subject.file);
}
