import type { ActionOutcome, ActionSubject, ArtifactAction, SayOutcome } from "~/utils/action";
import { toastFor } from "~/utils/action";

interface MessageResponse {
  delivered: boolean;
  session?: string;
  reason?: "no-live-session" | "refused-by-inbox";
}

export interface ActionBridge {
  perform: (action: ArtifactAction, subject: ActionSubject) => Promise<ActionOutcome>;
  say: (text: string) => Promise<SayOutcome>;
}

export function useActionBridge(): ActionBridge {
  const sc = useSidecar();

  async function say(text: string): Promise<SayOutcome> {
    const key = sc.sessionKey.value;
    if (!key) return { delivered: false, reason: "no-live-session" };
    try {
      const result = await $fetch<MessageResponse>(`/api/sessions/${encodeURIComponent(key)}/message`, {
        method: "POST",
        body: { text, slug: sc.slug.value },
      });
      if (result.delivered) return { delivered: true };
      return { delivered: false, reason: result.reason ?? "refused-by-inbox" };
    } catch (caught) {
      return { delivered: false, reason: "request-failed", detail: caught instanceof Error ? caught.message : String(caught) };
    }
  }

  async function perform(action: ArtifactAction, subject: ActionSubject): Promise<ActionOutcome> {
    const outcome = await say(action.prompt(subject));
    return { ...outcome, toast: toastFor(action, subject, outcome) };
  }

  return { perform, say };
}
