import { Mode } from "~~/lib/mode/index.ts";
import type { Why } from "../../shared/types/mode";

export default defineEventHandler((event): Why => {
  const query = getQuery(event);
  const session = typeof query.session === "string" && query.session ? query.session : undefined;
  return Mode.why(session);
});
