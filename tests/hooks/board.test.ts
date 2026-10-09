import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { Board } from "../../lib/hook/transcript.ts";
import {
  answered,
  denial,
  env,
  fire,
  output,
  PLUGIN,
  said,
  scratch,
  silent,
  transcript,
  used,
  user,
  write,
  type Env,
  type Line,
} from "../support.ts";

const tmp = scratch("mode-board-");
const config = join(tmp, "config");
const vars = env({ CLAUDE_PLUGIN_ROOT: PLUGIN, CLAUDE_CONFIG_DIR: config });

let count = 0;
const sid = (): string => `b${String(++count).padStart(7, "0")}`;

type Task = { id: string; subject: string; status?: string; metadata?: object };
const store = (session: string) => join(config, "tasks", `session-${session.slice(0, 8)}`);
function seed(session: string, ...tasks: Task[]): void {
  rmSync(store(session), { recursive: true, force: true });
  mkdirSync(store(session), { recursive: true });
  for (const task of tasks)
    write(join(store(session), `${task.id}.json`), JSON.stringify({ status: "pending", ...task }));
}
const stored = (session: string, id: string): Task =>
  JSON.parse(readFileSync(join(store(session), `${id}.json`), "utf8")) as Task;

const created = (id: string, subject: string, extra: object = {}): Line[] => [
  used("TaskCreate", { subject, ...extra }, `c${id}`),
  answered(`c${id}`, `Task #${id} created successfully: ${subject}`),
];
const stop = (
  session: string,
  lines: Line[],
  { hook, active = false, at = vars }: { hook: string; active?: boolean; at?: Env },
) =>
  fire(
    `guards/${hook}`,
    { session_id: session, hook_event_name: "Stop", transcript_path: transcript(tmp, lines), stop_hook_active: active },
    at,
  );
const zapped = (done: ReturnType<typeof fire>): string => output(done).hookSpecificOutput?.additionalContext ?? "";

describe("board-cap, which keeps open USER work bounded", () => {
  const session = sid();
  const call = (tool: string, input: object) =>
    fire(
      "guards/board-cap",
      { session_id: session, hook_event_name: "PreToolUse", tool_name: tool, tool_input: input },
      vars,
    );
  const open = (n: number, status = "pending"): Task[] =>
    Array.from({ length: n }, (_, i) => ({ id: String(i + 1), subject: `[USER] item ${i + 1}`, status }));

  test("allows a third open USER item and refuses a fourth, offering to fold it in or take the default", () => {
    seed(session, ...open(2));
    assert.ok(silent(call("TaskCreate", { subject: "[USER] three" })));
    seed(session, ...open(3));
    const why = denial(call("TaskCreate", { subject: "[USER] four" })) ?? "";
    assert.ok(why.includes("3") && /cap/i.test(why) && /fold/i.test(why) && /default/i.test(why), why);
  });

  test("only USER subjects count against it: AI, WAIT, status-only updates and completed items pass", () => {
    seed(session, ...open(3));
    assert.ok(
      [
        call("TaskCreate", { subject: "[AI] four" }),
        call("TaskCreate", { subject: "[WAIT] four" }),
        call("TaskUpdate", { taskId: "1", status: "in_progress" }),
      ].every(silent),
    );
    seed(
      session,
      { id: "1", subject: "[USER] done", status: "completed" },
      ...open(2).map((task) => ({ ...task, id: String(Number(task.id) + 1) })),
    );
    assert.ok(silent(call("TaskCreate", { subject: "[USER] three" })));
  });

  test("renaming an open USER item never counts it twice, while turning an AI item into USER is judged", () => {
    seed(session, ...open(3), { id: "4", subject: "[AI] four" });
    assert.ok(silent(call("TaskUpdate", { taskId: "1", subject: "[USER] renamed" })));
    assert.ok(denial(call("TaskUpdate", { taskId: "4", subject: "[USER] four" })));
  });
});

describe("the board replay, which is what a compact leaves behind", () => {
  const replay: Line[] = [
    ...created("1", "Api", { description: "the order path", metadata: { owner: "Api", files: ["a.ts"] } }),
    used("TaskUpdate", { taskId: "1", metadata: { notes: "retry double-posts" } }),
    used("TaskUpdate", { taskId: "1", metadata: { files: ["a.ts", "b.ts"] } }),
  ];

  test("keeps a task's description and merges its metadata across updates", () => {
    const [task] = Board.fromTranscript(replay);
    assert.deepEqual(
      [task?.description, task?.metadata],
      ["the order path", { owner: "Api", files: ["a.ts", "b.ts"], notes: "retry double-posts" }],
    );
  });

  test("a null metadata key deletes, as the tool's own contract says", () => {
    // external contract: TaskUpdate deletes a metadata key sent as null
    const [task] = Board.fromTranscript([...replay, used("TaskUpdate", { taskId: "1", metadata: { notes: null } })]);
    assert.ok(!("notes" in (task?.metadata as object)));
  });
});

describe("board-keep, which keeps receipts on the board", () => {
  const remove = (session: string, id: string, lines: Line[] = []) =>
    fire(
      "guards/board-keep",
      {
        session_id: session,
        hook_event_name: "PreToolUse",
        tool_name: "TaskUpdate",
        transcript_path: transcript(tmp, lines),
        tool_input: { taskId: id, status: "deleted" },
      },
      vars,
    );

  test("refuses to delete a completed task, from the store or from the replay when the store is gone", () => {
    const session = sid();
    seed(
      session,
      { id: "1", subject: "#1  [AI] Ship it", status: "completed" },
      { id: "2", subject: "#2  [AI] Maybe later" },
    );
    assert.match(denial(remove(session, "1")) ?? "", /#1 is completed/);
    assert.ok(silent(remove(session, "2")));
    const wiped = sid();
    assert.ok(
      denial(
        remove(wiped, "1", [
          ...created("1", "#1  [AI] Ship it"),
          used("TaskUpdate", { taskId: "1", status: "completed" }),
        ]),
      ),
    );
  });
});

describe("board-category, on every TaskCreated", () => {
  const made = (session: string, id: string, subject: string) =>
    fire(
      "guards/board-category",
      { session_id: session, hook_event_name: "TaskCreated", task_id: id, task_subject: subject },
      vars,
    );

  test("blocks a subject with no category, offering it under each one", () => {
    const body = output(made(sid(), "1", "fix the parser"));
    assert.equal(body.decision, "block");
    assert.ok(
      ["[AI] fix the parser", "[USER] fix the parser", "[WAIT] fix the parser"].every((form) =>
        body.reason?.includes(form),
      ),
      body.reason,
    );
  });

  test("stamps the padded id and the canonical category into the stored subject, once", () => {
    const session = sid();
    seed(session, { id: "7", subject: "[ai] fix the parser" });
    assert.ok(silent(made(session, "7", "[ai] fix the parser")));
    assert.equal(stored(session, "7").subject, "#7  [AI] fix the parser");
    assert.ok(silent(made(session, "7", "#7  [AI] fix the parser")));
    assert.equal(stored(session, "7").subject, "#7  [AI] fix the parser");
  });
});

describe("board-check, at the end of every turn", () => {
  const writes: Line[] = [used("Write", { file_path: "/repo/a.ts" }), used("Write", { file_path: "/repo/b.ts" })];

  test("restores a wiped store from the transcript instead of asking for a rebuild", () => {
    const session = sid();
    const done = stop(
      session,
      [user("go"), ...created("1", "#1  [AI] Api"), used("TaskUpdate", { taskId: "1", status: "in_progress" })],
      { hook: "board-check" },
    );
    assert.match(zapped(done), /restored from the transcript/);
    assert.deepEqual([stored(session, "1").subject, stored(session, "1").status], ["#1  [AI] Api", "in_progress"]);
  });

  test("asks for receipts when work happened with no board, and to reconcile when the board went untouched", () => {
    assert.match(
      zapped(stop(sid(), [user("go"), ...writes], { hook: "board-check" })),
      /wrote 2 files but no task board exists/,
    );
    const session = sid();
    seed(session, { id: "1", subject: "#1  [AI] Api", status: "in_progress" });
    assert.match(zapped(stop(session, [user("go"), ...writes], { hook: "board-check" })), /never touched the board/);
  });

  test("calls out work that started before the board went up, and a subject off the standard form", () => {
    const early = sid();
    seed(early, { id: "1", subject: "#1  [AI] Api" });
    assert.match(
      zapped(
        stop(early, [user("go"), ...writes, used("TaskCreate", { subject: "[AI] Api" })], { hook: "board-check" }),
      ),
      /before the board went up/,
    );
    const loose = sid();
    seed(loose, { id: "1", subject: "Fix it", status: "in_progress" });
    assert.match(
      zapped(
        stop(loose, [user("go"), used("TaskUpdate", { taskId: "1", status: "in_progress" }), ...writes], {
          hook: "board-check",
        }),
      ),
      /#1 Fix it → needs \[AI\]/,
    );
  });

  test("prints the whole board past what the panel shows, and stays quiet on a reading turn or its own repair turn", () => {
    const session = sid();
    seed(
      session,
      ...Array.from({ length: 6 }, (_, i) => ({
        id: String(i + 1),
        subject: `#${i + 1}${i + 1 < 10 ? "  " : " "}[AI] item`,
        status: i ? "pending" : "in_progress",
      })),
    );
    const listing = output(
      stop(session, [user("go"), used("TaskUpdate", { taskId: "1", status: "in_progress" }), ...writes], {
        hook: "board-check",
      }),
    );
    assert.match(listing.systemMessage ?? "", /^Board: 6 open/);
    assert.ok(
      silent(
        stop(sid(), [user("what is this?"), used("Read", { file_path: "/repo/a.ts" }), said("It is a parser.")], {
          hook: "board-check",
        }),
      ),
    );
    assert.ok(silent(stop(sid(), [user("go"), ...writes], { hook: "board-check", active: true })));
  });
});

describe("the delivery receipt", () => {
  const glab = (state: string): Env => {
    const fake = write(join(tmp, `glab-${state}`), `#!/bin/sh\necho '{"state": "${state}"}'\n`);
    chmodSync(fake, 0o755);
    return env({ ...vars, DELIVER_GLAB: fake });
  };
  const tick = (session: string, metadata: object = {}, at: Env = vars) =>
    fire(
      "guards/board-deliver",
      {
        session_id: session,
        hook_event_name: "PreToolUse",
        tool_name: "TaskUpdate",
        cwd: "/work/acme/repo",
        tool_input: { taskId: "1", status: "completed", metadata },
      },
      at,
    );

  test("a delivery subject ticked with no receipt is warned about, or refused under DELIVER_MODE=deny", () => {
    const session = sid();
    seed(session, { id: "1", subject: "#1  [AI] Push the branch", status: "in_progress" });
    assert.match(output(tick(session)).systemMessage ?? "", /board-deliver \(warn\): #1 reads as a delivery item/);
    assert.match(denial(tick(session, {}, env({ ...vars, DELIVER_MODE: "deny" }))) ?? "", /declares no receipt/);
    seed(session, { id: "1", subject: "#1  [AI] Fix the parser", status: "in_progress" });
    assert.ok(silent(tick(session)));
  });

  test("a receipt is checked: the wrong kind for this tree, an MR not merged, a repo that is not one", () => {
    const session = sid();
    seed(session, { id: "1", subject: "#1  [AI] Ship it", status: "in_progress" });
    const rows = write(join(config, "mode", "config.json"), JSON.stringify({ delivery: [["acme", "mr-merged"]] }));
    try {
      assert.match(
        output(tick(session, { done: { kind: "pushed", repo: "/work/acme/repo" } })).systemMessage ?? "",
        /demands 'mr-merged'/,
      );
      assert.match(
        output(tick(session, { done: { kind: "mr-merged", project: "acme/repo", iid: 4 } }, glab("opened")))
          .systemMessage ?? "",
        /state is 'opened', not merged/,
      );
      assert.ok(silent(tick(session, { done: { kind: "mr-merged", project: "acme/repo", iid: 4 } }, glab("merged"))));
    } finally {
      rmSync(rows);
    }
    assert.match(
      output(tick(session, { done: { kind: "pushed", repo: join(tmp, "nowhere") } })).systemMessage ?? "",
      /is not a git work tree/,
    );
  });

  test("board-done reopens an all-ticked board whose receipt fails, or that shipped with no receipt at all", () => {
    const shipped = sid();
    seed(shipped, { id: "1", subject: "#1  [AI] Fix it", status: "completed" });
    assert.match(
      zapped(stop(shipped, [user("go"), used("Bash", { command: "git push origin main" })], { hook: "board-done" })),
      /no board item declares a delivery receipt/,
    );
    const failing = sid();
    seed(failing, {
      id: "1",
      subject: "#1  [AI] Merge it",
      status: "completed",
      metadata: { done: { kind: "mr-merged", project: "acme/repo", iid: 4 } },
    });
    assert.match(
      zapped(stop(failing, [user("go")], { hook: "board-done", at: glab("opened") })),
      /#1's delivery receipt fails/,
    );
    seed(failing, { id: "1", subject: "#1  [AI] Merge it", status: "in_progress" });
    assert.ok(silent(stop(failing, [user("go"), used("Bash", { command: "git push" })], { hook: "board-done" })));
  });
});
