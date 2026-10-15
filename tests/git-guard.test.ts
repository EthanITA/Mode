import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { denial, env, fire, MODE, run, scratch, silent, transcript, used, write, type Line } from "./support.ts";

const tmp = scratch("mode-git-");

function git(repo: string, ...args: string[]): void {
  const done = run("git", ["-C", repo, ...args]);
  assert.equal(done.status, 0, done.stderr);
}

function repository(): string {
  const repo = mkdtempSync(join(tmp, "repo-"));
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "t");
  for (const name of ["theirs.txt", "mine.txt"]) writeFileSync(join(repo, name), "committed\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "init");
  return repo;
}

const vars = (config = mkdtempSync(join(tmp, "config-"))) => env({ CLAUDE_CONFIG_DIR: config });

describe("git-guard, against someone else's uncommitted edits", () => {
  const repo = repository();
  appendFileSync(join(repo, "theirs.txt"), "uncommitted\n");
  appendFileSync(join(repo, "mine.txt"), "uncommitted\n");
  const mine = transcript(tmp, [used("Edit", { file_path: join(repo, "mine.txt") })]);
  const bash = (command: string, cwd: string) =>
    fire(
      "guards/git-guard",
      { hook_event_name: "PreToolUse", tool_name: "Bash", cwd, transcript_path: mine, tool_input: { command } },
      vars(),
    );

  test("a switch that would carry someone else's edit is denied, naming only their file", () => {
    const why = denial(bash("git switch -c other", repo)) ?? "";
    assert.ok(why.includes("theirs.txt") && !why.includes("mine.txt"), why);
  });

  test("stashing, and discarding, which delete-guard owns, pass", () => {
    assert.ok(silent(bash(`git -C ${repo} stash push -u -m parked`, "/")));
    assert.ok(silent(bash("git checkout -- theirs.txt", repo)));
    assert.ok(silent(bash(`cd ${repo} && git reset --hard HEAD`, "/")));
  });
});

describe("delete-guard, against destroying what the session does not own", () => {
  const config = mkdtempSync(join(tmp, "config-"));
  const job = join(config, "jobs", "aaaaaaaa", "tmp");
  const repo = repository();
  write(join(repo, ".gitignore"), "node_modules/\n.claude/settings.local.json\n");
  write(join(repo, "lib", "clean.txt"), "committed\n");
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "more");
  appendFileSync(join(repo, "theirs.txt"), "uncommitted\n");
  appendFileSync(join(repo, "mine.txt"), "uncommitted\n");
  write(join(repo, "app", "theirs.vue"), "untracked\n");
  write(join(repo, "app", "mine.vue"), "untracked\n");
  write(join(repo, ".claude", "settings.local.json"), "{}\n");
  write(join(repo, "node_modules", "pkg", "index.js"), "\n");
  write(join(job, "final", "old.txt"), "\n");
  write(join(config, "jobs", "bbbbbbbb", "tmp", "theirs.txt"), "\n");
  const mine = transcript(tmp, [
    used("Edit", { file_path: join(repo, "mine.txt") }),
    used("Write", { file_path: join(repo, "app", "mine.vue") }),
  ]);
  const bash = (command: string, cwd = repo) =>
    fire(
      "guards/delete-guard",
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        session_id: "aaaaaaaa-0000",
        cwd,
        transcript_path: mine,
        tool_input: { command },
      },
      env({ CLAUDE_CONFIG_DIR: config, CLAUDE_JOB_DIR: "" }),
    );

  test("the rsync that wiped the Mode repo is denied for the operand --port swallowed", () => {
    const flags = "-a --delete --exclude node_modules --exclude .git";
    const why = denial(bash(`rsync ${flags} --exclude -- --port ${repo}/ ${job}/final/`)) ?? "";
    assert.ok(why.includes("`--port` takes a value") && why.includes(`current directory, ${repo}`), why);
    assert.ok(silent(bash(`rsync ${flags} ${repo}/ ${job}/final/`)));
    assert.ok(denial(bash(`rsync -a --delete ${job}/final/ ${repo}/app/`)));
  });

  test("a recursive delete names only what git can't restore and the session never wrote", () => {
    const why = denial(bash("rm -rf app")) ?? "";
    assert.ok(why.includes("app/theirs.vue (untracked)") && !why.includes("mine.vue"), why);
    assert.ok(silent(bash("rm -rf node_modules lib app/mine.vue")));
    assert.match(denial(bash("find . -name '*.vue' -delete")) ?? "", /theirs\.vue/);
    assert.ok(silent(bash("find . -name '*.log' -delete")));
  });

  test("roots, other sessions' folders and paths it can't see are denied outright", () => {
    for (const command of [`rm -rf ${repo}`, "rm -rf ~", 'rm -rf "$NO_SUCH_VAR/"', "ls | xargs rm -f"])
      assert.ok(denial(bash(command)), command);
    assert.ok(denial(bash(`rm -rf ${join(config, "jobs", "bbbbbbbb")}`)));
    assert.ok(silent(bash(`rm -rf "$CLAUDE_JOB_DIR/tmp/final" && cd "$(mktemp -d)" && rm -rf *`)));
  });

  test("git discards, through cd, subshells and bash -c, wherever someone else's change sits", () => {
    for (const command of [
      `(cd ${repo} && git reset --hard)`,
      `bash -c "git -C ${repo} checkout -- ."`,
      `git -C ${repo} restore .`,
    ])
      assert.match(denial(bash(command, "/")) ?? "", /theirs\.txt \(uncommitted\)/, command);
    assert.match(denial(bash("git clean -fdx")) ?? "", /settings\.local\.json \(ignored\)/);
    assert.ok(silent(bash("git restore --staged theirs.txt && git checkout -- mine.txt")));
  });

  test("an overwrite counts like a delete, and the job's tmp takes anything", () => {
    assert.ok(denial(bash("echo x > app/theirs.vue")));
    assert.ok(denial(bash(`cp ${job}/final/old.txt app/theirs.vue`)));
    assert.ok(silent(bash(`pnpm build > ${job}/build.log 2>&1; mv mine.txt mine-renamed.txt`)));
  });

  test("with only the session's own edits left, reset --hard passes", () => {
    git(repo, "checkout", "--", "theirs.txt");
    assert.ok(silent(bash("git reset --hard HEAD")));
  });
});

describe("pair-guard, where a big commit waits for the director", () => {
  const EDIT = used("Edit", { file_path: "/x" });
  const SPAWN = used("Agent", { name: "director", prompt: "review" });
  const REPLY: Line = {
    type: "user",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: "t1",
          content: [{ type: "text", text: '<teammate-message teammate_id="director">Go.</teammate-message>' }],
        },
      ],
    },
  };
  const repo = repository();
  writeFileSync(join(repo, "big.txt"), "line\n".repeat(40));
  git(repo, "add", "big.txt");

  function commit(lines: Line[], { held = "pair", command = "git commit -m wip" } = {}) {
    const config = vars();
    run(MODE, ["mode", "set", held, "--session", "pg"], { env: config });
    const payload = {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      session_id: "pg",
      cwd: repo,
      transcript_path: transcript(tmp, lines),
      tool_input: { command },
    };
    return fire("guards/pair-guard", payload, config);
  }

  test("forty staged lines with no director at all are denied, saying to spawn one", () => {
    assert.match(denial(commit([EDIT])) ?? "", /no director/);
  });

  test("an edit after the director's last answer is denied", () => {
    assert.match(denial(commit([SPAWN, REPLY, EDIT])) ?? "", /edited after/);
  });

  test("once the director answered after the last edit, the commit goes", () => {
    assert.ok(silent(commit([SPAWN, EDIT, REPLY])));
  });

  test("outside pair it says nothing", () => {
    assert.ok(silent(commit([EDIT], { held: "ic" })));
  });

  test("only what the commit records counts: an empty index commits freely, while -a and a named path count", () => {
    git(repo, "reset", "-q");
    appendFileSync(join(repo, "mine.txt"), "unstaged\n".repeat(40));
    assert.ok(silent(commit([EDIT])));
    assert.ok(denial(commit([EDIT], { command: "git commit -am wip" })));
    assert.ok(denial(commit([EDIT], { command: "git commit -m wip mine.txt" })));
  });
});
