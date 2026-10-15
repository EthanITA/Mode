import { EventEmitter } from "node:events";

// A save changes the disk text a snapshot is built from, but not the ledger the stream watches, so it announces itself by session key.
export const reviewEdited = new EventEmitter();
