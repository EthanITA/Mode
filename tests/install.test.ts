import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { test } from "node:test"
import { env, MODE, PLUGIN, run, scratch, write } from "./support.ts"

const INSTALL = join(PLUGIN, "install.sh")
const tmp = scratch("mode-install-")

const install = (config: string, ...flags: string[]) =>
  run(INSTALL, ["--config-dir", config, "--no-aliases", "--yes", ...flags], { env: env() })

function withStatusLine(name: string, command: string): string {
  const config = join(tmp, name)
  write(join(config, "settings.json"), JSON.stringify({ statusLine: { type: "command", command } }, undefined, 2) + "\n")
  return config
}

function executable(path: string, body: string | Buffer): string {
  mkdirSync(join(path, ".."), { recursive: true })
  writeFileSync(path, body)
  chmodSync(path, 0o755)
  return path
}

test("a node status line is left alone, and the installer says it refused", () => {
  const node = executable(join(tmp, "bin", "node"), Buffer.concat([Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), Buffer.alloc(64)]))
  const script = write(join(tmp, "status-line", "index.ts"), "#!/usr/bin/env node\nconsole.log('line')\n")
  const before = [readFileSync(node), readFileSync(script)]
  const done = install(withStatusLine("cfg-node", `${node} ${script}`), "--insert-chips")
  assert.equal(done.status, 0, done.stderr)
  assert.deepEqual([readFileSync(node), readFileSync(script)], before)
  assert.match(done.stdout + done.stderr, /Refusing to edit|not a shell script/)
})

test("a shell status line gets the chips block appended", () => {
  const host = executable(join(tmp, "line.sh"), "#!/usr/bin/env bash\nprintf 'hello'\n")
  assert.equal(install(withStatusLine("cfg-sh", `bash ${host}`), "--insert-chips").status, 0)
  const body = readFileSync(host, "utf8")
  assert.ok(body.includes("mode-plugin:chips") && body.includes("printf 'hello'"), body)
})

test("--yes without --insert-chips never writes the host script", () => {
  const host = executable(join(tmp, "untouched.sh"), "#!/usr/bin/env bash\nprintf 'keep'\n")
  const before = readFileSync(host, "utf8")
  install(withStatusLine("cfg-yes", `bash ${host}`))
  assert.equal(readFileSync(host, "utf8"), before)
})

test("the status line renders the chips with no jq anywhere on PATH", () => {
  // /usr/bin carries jq on recent macOS, so the PATH is built from links to exactly what runs.
  const tools = join(tmp, "tools")
  mkdirSync(tools)
  symlinkSync(execFileSync("/bin/sh", ["-c", "command -v node"], { encoding: "utf8" }).trim(), join(tools, "node"))
  const bare = { PATH: `${tools}:/bin`, HOME: process.env.HOME ?? "" }
  assert.notEqual(run("/bin/sh", ["-c", "command -v jq"], { env: bare }).status, 0)

  const config = join(tmp, "cfg-fresh")
  const done = install(config)
  const line = join(config, "mode", "statusline.sh")
  assert.ok(done.status === 0 && existsSync(line), done.stderr)
  run(MODE, ["mode", "set", "debug", "--session", "inst-1"], { env: env({ CLAUDE_CONFIG_DIR: config }) })
  const shown = run("/bin/bash", [line], { input: JSON.stringify({ session_id: "inst-1" }), env: { ...bare, CLAUDE_CONFIG_DIR: config } })
  assert.match(shown.stdout, /debug/, shown.stderr)

  const installed = join(tmp, "installed", "mode")
  executable(join(installed, "bin", "mode"), "#!/bin/sh\necho from-manifest\n")
  write(join(config, "plugins", "installed_plugins.json"), JSON.stringify({ plugins: { "mode@local": [{ installPath: installed }] } }))
  const chips = run("/bin/bash", [join(config, "mode", "chips.sh"), "inst-1"], { env: { ...bare, CLAUDE_CONFIG_DIR: config } })
  assert.equal(chips.stdout.trim(), "from-manifest", chips.stderr)
})

test("a node older than the LTS stops the install up front, naming what it found", () => {
  const old = join(tmp, "old-node")
  executable(join(old, "node"), "#!/bin/sh\necho 20.11.1\n")
  const done = run(INSTALL, ["--config-dir", join(tmp, "cfg-old"), "--no-aliases", "--yes"], { env: env({ PATH: `${old}:/usr/bin:/bin` }) })
  assert.equal(done.status, 1)
  assert.match(done.stderr, /Node 24 or newer/)
  assert.match(done.stderr, /20\.11\.1/)
})
