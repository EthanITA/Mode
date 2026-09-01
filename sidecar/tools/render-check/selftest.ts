import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

interface Case {
  name: string
  fixture: string
  args: string[]
  expectExit: number
  expectText: string[]
}

const CASES: Case[] = [
  {
    name: 'the rejected build is caught',
    fixture: 'rejected-build.html',
    args: ['--known-ids', '3f9a1c02,7b21de44,c0ffee11'],
    expectExit: 1,
    expectText: [
      'No artifact mounted yet',
      'frame-missing',
      'id-leak',
    ],
  },
  {
    name: 'the same failure in unrecognised markup is still caught',
    fixture: 'unrecognised-markup.html',
    args: [],
    expectExit: 1,
    expectText: ['No artifact mounted yet', 'page-placeholder'],
  },
  {
    name: 'a filled screen passes',
    fixture: 'filled-screen.html',
    args: [],
    expectExit: 0,
    expectText: ['PASS', 'STATE B'],
  },
]

function run(testCase: Case): string[] {
  const url = pathToFileURL(join(here, 'fixtures', testCase.fixture)).href
  const result = spawnSync(
    process.execPath,
    [join(here, 'run.ts'), '--url', url, '--settle', '3000', ...testCase.args],
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

let failed = 0
for (const testCase of CASES) {
  const problems = run(testCase)
  if (problems.length) {
    failed++
    process.stdout.write(`FAIL  ${testCase.name}\n`)
    for (const problem of problems) process.stdout.write(`        ${problem}\n`)
  } else {
    process.stdout.write(`ok    ${testCase.name}\n`)
  }
}

process.stdout.write(
  failed
    ? `\n${failed} of ${CASES.length} self-tests failed — the render check itself is not trustworthy.\n`
    : `\nAll ${CASES.length} self-tests passed: the check fails the rejected build and passes a filled one.\n`,
)
process.exit(failed ? 1 : 0)
