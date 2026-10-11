// `npm run build:check` — a production build that can run while `next dev` is
// up. The two share `.next` and break each other, so this builds into
// `.next-build` instead (see `distDir` in next.config.ts).
//
// Next rewrites tsconfig.json and next-env.d.ts to point at whatever distDir it
// builds into. Both are put back afterwards, byte for byte, and the build
// folder is removed — even when the build fails or is interrupted — so the
// repo is left exactly as it was.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const DIST_DIR = '.next-build'
const GUARDED = ['tsconfig.json', 'next-env.d.ts']

const saved = new Map(
  GUARDED.filter((file) => existsSync(root + file)).map((file) => [file, readFileSync(root + file)]),
)

let restored = false
function restore() {
  if (restored) return
  restored = true
  for (const [file, content] of saved) writeFileSync(root + file, content)
  rmSync(root + DIST_DIR, { recursive: true, force: true })
}

const nextBin = createRequire(import.meta.url).resolve('next/dist/bin/next')
const child = spawn(process.execPath, [nextBin, 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NEXT_DIST_DIR: DIST_DIR },
})

// Ctrl+C reaches the child too; wait for it to stop, then clean up on exit.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))

child.on('exit', (code, signal) => {
  restore()
  console.log(`\n${code === 0 ? '✓' : '✗'} build:check ${code === 0 ? 'passed' : 'failed'} — tsconfig.json and next-env.d.ts restored, ${DIST_DIR} removed.`)
  process.exit(code ?? (signal ? 1 : 0))
})

child.on('error', (error) => {
  restore()
  console.error(`✗ could not start next build: ${error.message}`)
  process.exit(1)
})
