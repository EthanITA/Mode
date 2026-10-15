import { verdict } from "../../lib/hook/delete/index.ts";
import { armed } from "../../lib/hook/guard.ts";
import { deny, payload, record, str } from "../../lib/hook/io.ts";

// A crash on a command that plainly deletes fails closed; anything else stays open, since a broken guard must not jam the shell.
const DESTRUCTIVE =
  /\b(rm|unlink|shred|rimraf|rsync|xargs|ditto|truncate|diskutil)\b|-delete\b|\bgit\b.*\b(clean|reset|checkout|restore|switch)\b/;

if (armed()) {
  const data = payload();
  const command = str(record(data?.tool_input).command);
  if (data?.tool_name === "Bash" && command) {
    try {
      const reason = verdict({
        command,
        cwd: str(data.cwd) || process.cwd(),
        session: str(data.session_id),
        transcript: str(data.transcript_path),
      });
      if (reason) deny(`delete-guard — ${reason}`);
    } catch (error) {
      if (DESTRUCTIVE.test(command))
        deny(
          `delete-guard — this command deletes or overwrites, and the guard failed while checking it ` +
            `(${error instanceof Error ? error.message : String(error)}). Split it into simpler commands with literal paths.`,
        );
    }
  }
}
