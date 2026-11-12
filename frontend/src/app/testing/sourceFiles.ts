/**
 * Test helper: the frontend's own files, read from disk. Vitest turns every CSS import (?raw included) into an empty string, so
 * a test that reads the stylesheet or scans the screens reads them here. Paths are resolved from this file's own address, so the
 * result does not depend on the folder the tests are started from. The project has no Node typings, hence the narrow local types.
 */
type NodeFs = {
  readFileSync(path: string, encoding: 'utf8'): string
  readdirSync(path: string, options: { recursive: true }): string[]
}
type NodeUrl = { fileURLToPath(url: string): string }
type NodeProcess = { getBuiltinModule(id: 'node:fs'): NodeFs; getBuiltinModule(id: 'node:url'): NodeUrl }

const node = (globalThis as unknown as { process: NodeProcess }).process
const fs = node.getBuiltinModule('node:fs')
const { fileURLToPath } = node.getBuiltinModule('node:url')

/**
 * The folder `src`: this file is `src/app/testing/sourceFiles.ts`. Cut from the path of this file, not built with
 * `new URL('../..', import.meta.url)`, which Vite rewrites into the address of an asset of the dev server.
 */
const SRC = fileURLToPath(import.meta.url).replace(/[\\/]app[\\/]testing[\\/][^\\/]+$/, '')

/** A file of `src`, by its path from there: 'styles.css', 'features/admin/AdminApp.tsx'. */
export function readSource(path: string): string {
  return fs.readFileSync(`${SRC}/${path}`, 'utf8')
}

/** Every file and folder of `src`, as paths from there with forward slashes. */
export function sourcePaths(): string[] {
  return fs.readdirSync(SRC, { recursive: true }).map((path) => path.replace(/\\/g, '/'))
}

/** The code of the app itself: every .ts and .tsx file of `src` but the tests, their setup and these helpers. */
export function appSourcePaths(): string[] {
  return sourcePaths().filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith('test/') && !path.startsWith('app/testing/'))
}
