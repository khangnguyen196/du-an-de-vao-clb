// One-time setup for `npm run transcribe`: a private Python environment in
// .tools/whisper/venv with faster-whisper installed. Nothing here touches the
// web app; .tools is ignored by git and by Vercel uploads.
//
//   npm run transcribe:setup
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const venv = join(root, '.tools', 'whisper', 'venv')
const venvPython = process.platform === 'win32' ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python')
const requirements = join(root, 'scripts', 'whisper', 'requirements.txt')

function run(command, args) {
  console.log(`> ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, { stdio: 'inherit' })
  return result.status === 0
}

/** The Python launcher on Windows, `python3` elsewhere; 3.9+ is what faster-whisper supports. */
function findPython() {
  const candidates = process.platform === 'win32' ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]]
  for (const [command, prefix] of candidates) {
    const probe = spawnSync(command, [...prefix, '-c', 'import sys; print(sys.version_info >= (3, 9))'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === 'True') return [command, prefix]
  }
  return null
}

if (!existsSync(venvPython)) {
  const python = findPython()
  if (!python) {
    console.error('✗ Python 3.9 or newer is needed: https://www.python.org/downloads/')
    process.exit(1)
  }
  const [command, prefix] = python
  if (!run(command, [...prefix, '-m', 'venv', venv])) {
    console.error('✗ could not create the Python environment')
    process.exit(1)
  }
}

if (!run(venvPython, ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirements])) {
  console.error('✗ installing faster-whisper failed — see the pip output above')
  process.exit(1)
}

console.log('✓ Whisper is ready. The model (~250-500 MB) downloads on the first `npm run transcribe`.')
