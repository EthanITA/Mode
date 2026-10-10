import type { SessionFiles } from "~~/shared/types/files";
import { filesOf } from "~~/server/utils/sessions/files";

export default defineEventHandler((event): SessionFiles => filesOf({ key: getRouterParam(event, "key") || "" }));
