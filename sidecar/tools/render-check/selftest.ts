import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

interface Case {
  name: string
  url: string
  args: string[]
  expectExit: number
  expectText: string[]
}

function fixture(name: string): string {
  return pathToFileURL(join(here, 'fixtures', name)).href
}

const CASES: Case[] = [
  {
    name: 'the rejected build is caught',
    url: fixture('rejected-build.html'),
    args: ['--known-ids', '3f9a1c02,7b21de44,c0ffee11'],
    expectExit: 1,
    expectText: ['No artifact mounted yet', 'frame-missing', 'id-leak'],
  },
  {
    name: 'the same failure in unrecognised markup is still caught',
    url: fixture('unrecognised-markup.html'),
    args: [],
    expectExit: 1,
    expectText: ['No artifact mounted yet', 'page-placeholder'],
  },
  {
    name: 'a filled screen passes',
    url: fixture('filled-screen.html'),
    args: [],
    expectExit: 0,
    expectText: ['PASS', 'STATE B'],
  },
]

const scratch = mkdtempSync(join(tmpdir(), 'render-check-selftest-'))

async function serverOrigin(): Promise<string | undefined> {
  const port = process.env.NUXT_PORT || process.env.PORT || '3210'
  const origin = `http://localhost:${port}`
  try {
    const response = await fetch(origin, { signal: AbortSignal.timeout(3_000) })
    return response.ok ? origin : undefined
  } catch {
    return undefined
  }
}

// the 404 branch needs a live server, so the fixture is written with its origin baked in
function frame404Case(origin: string): Case {
  const path = join(scratch, 'frame-404.html')
  writeFileSync(
    path,
    `<!doctype html><html><head><meta charset="utf-8"><title>frame 404</title></head><body>
<article data-region="artifact-page"><iframe src="${origin}/artifact/definitely-not-a-real-slug"></iframe></article>
</body></html>\n`,
  )
  return {
    name: 'a frame whose slug 404s is reported as a data problem, not an empty region',
    url: pathToFileURL(path).href,
    args: [],
    expectExit: 1,
    expectText: ['frame-src-error', 'HTTP 404', 'x-frame-options', 'not a rendering one'],
  }
}

function run(testCase: Case): string[] {
  const result = spawnSync(
    process.execPath,
    [join(here, 'run.ts'), '--url', testCase.url, '--settle', '3000', ...testCase.args],
    { encoding: 'utf8' },
  )
  const output = `${result.stdout}${result.stderr}`
  const problems: string[] = []
  if (result.status !== testCase.expectExit) {
    problems.push(`exit ${String(result.status)}, expected ${testCase.expectExit}`)
  }
  for (const needle of testCase.expectText) {
    if (!output.includes(needle)) problems.push(`output never mentioned ${JSON.stringify(needle)}`)
  }
  return problems
}

const origin = await serverOrigin()
const cases = origin ? [...CASES, frame404Case(origin)] : CASES

let failed = 0
for (const testCase of cases) {
  const problems = run(testCase)
  if (problems.length) {
    failed++
    process.stdout.write(`FAIL  ${testCase.name}\n`)
    for (const problem of problems) process.stdout.write(`        ${problem}\n`)
  } else {
    process.stdout.write(`ok    ${testCase.name}\n`)
  }
}

if (!origin) {
  process.stdout.write('skip  the frame-404 case needs a running server; set NUXT_PORT or start one\n')
}

rmSync(scratch, { recursive: true, force: true })

process.stdout.write(
  failed
    ? `\n${failed} of ${cases.length} self-tests failed — the render check itself is not trustworthy.\n`
    : `\nAll ${cases.length} self-tests passed.\n`,
)
process.exit(failed ? 1 : 0)
