// Lets plain `node` run the TypeScript scripts in this folder against the app's
// own modules. Node strips the types itself; this hook only teaches it the two
// things the bundler normally handles: the `@/` path alias from tsconfig and
// extensionless imports of `.ts` files.
import { existsSync, statSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx']

function isFile(path) {
  return existsSync(path) && statSync(path).isFile()
}

function resolveTsPath(basePath) {
  if (isFile(basePath)) return basePath
  for (const extension of EXTENSIONS) {
    if (isFile(basePath + extension)) return basePath + extension
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let basePath = null
    if (specifier.startsWith('@/')) {
      basePath = root + specifier.slice(2)
    } else if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file:') &&
      !context.parentURL.includes('/node_modules/')
    ) {
      basePath = fileURLToPath(new URL(specifier, context.parentURL))
    }

    const resolved = basePath ? resolveTsPath(basePath) : null
    if (resolved) return nextResolve(pathToFileURL(resolved).href, context)
    return nextResolve(specifier, context)
  },
})
