import { armed } from "../../lib/hook/guard.ts";
import { payload, str, zap } from "../../lib/hook/io.ts";
import { Reply, Transcript, Turns } from "../../lib/hook/transcript.ts";
import { held } from "../../lib/mode/state.ts";

if (armed()) {
  try {
    const data = payload();
    // Only while the xyz style is held, and never on the repair turn, which would loop forever.
    if (data && held("style", str(data.session_id) || undefined) === "xyz" && !data.stop_hook_active) {
      const entries = Transcript.read(str(data.transcript_path));
      const blocks = Turns.blocks(entries);
      const opening = blocks.length ? Reply.opening(blocks.at(-1) ?? []) : undefined;
      if (opening && !Transcript.alreadyZapped(entries, "xyz-check")) {
        const gap = Reply.xyzGap(opening);
        if (gap) {
          zap(
            `Your reply did not open with a valid X/Y/Z read (${gap}). Post the read now as your entire ` +
              'follow-up — exactly three lines, each carrying real content: an "X — " line stating ' +
              'what the user typed, a "Y — " line stating what they actually expect, a "Z — " line ' +
              "stating what that forces into existence. Never write the label definitions themselves " +
              "as the content, do not restate your reply — the three filled lines, then stop.",
            `xyz-check: reply had no X/Y/Z read (${gap}) — adding it.`,
          );
        } else {
          // The read repairs first; the summary is judged only on turns whose opening already stands.
          const turns = Turns.calls(entries);
          const shape = turns.length ? Turns.shape(turns.at(-1) ?? []) : undefined;
          if (shape?.substantial && !shape.question && !Turns.tail(entries)) {
            zap(
              "This turn did work but its reply does not close with a summary — the execution body is " +
                "self-talk the user skips, so right now the turn says nothing to him. Post the closing block " +
                "now as your entire follow-up: a few self-contained lines stating what was done and what " +
                "still needs them. Never point back into the body — it is unread.",
              "xyz-check: work turn ended without a closing summary — adding it.",
            );
          }
        }
      }
    }
  } catch {}
}
