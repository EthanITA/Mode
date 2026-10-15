import { bare, type BareRun } from "./bare";
import { fast } from "./fast";
import type {
  FastChatMessage,
  FastModelAnswer,
  FastModelEdit,
  FastModelReply,
  FastModelRequest,
  FastTask,
} from "../../../shared/types/models";

export const Models = {
  bare,
  fast,
};

export namespace Models {
  export type Bare = BareRun;
  export type Request = FastModelRequest;
  export type Reply = FastModelReply;
  export type Edit = FastModelEdit;
  export type Answer = FastModelAnswer;
  export type ChatMessage = FastChatMessage;
  export type Task = FastTask;
}
