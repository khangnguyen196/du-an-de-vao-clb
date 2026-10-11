import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: ['.next/**', '.next-build/**', 'node_modules/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts', '.tools/**', '.cache/**'],
  },
]

export default config
