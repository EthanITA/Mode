import { declaring } from "../lib/hook/declares.ts";
import { deny, payload, str } from "../lib/hook/io.ts";
import { approve } from "../lib/mode/slots.ts";

const FLAG = "no-dispatch-without-approval";

const waiting = (mode: string): string =>
  `the '${mode}' mode waits for a yes on a written spec before any teammate is spawned, and this mode has ` +
  "not been given one. A yes is scoped to the mode it was given under, so one recorded under a " +
  "different mode does not carry over.";
const FIX =
  " Write the spec, show it, and record the yes with `/mode:approve <slug>`, or `/approve <slug>` " +
  "where the short form is installed. Until that lands, do the work here rather than dispatching it.";

// Every unreadable input allows: a gate that cannot see its inputs has not found a violation, it has only failed to look.
function verdict(session: string | undefined): string {
  const mode = declaring(session, FLAG);
  if (!mode || approve({ session })) return "";
  return waiting(mode) + FIX;
}

try {
  const data = payload();
  if (data?.tool_name === "Agent") {
    const reason = verdict(str(data.session_id) || undefined);
    if (reason) deny(`mode gate: ${reason}`);
  }
} catch {}
