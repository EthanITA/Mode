import { Extension } from "~~/server/utils/extension";
import type { ExtensionReply } from "~~/shared/types/web";

export default defineEventHandler((): ExtensionReply => ({ heard: Extension.heard() }));
