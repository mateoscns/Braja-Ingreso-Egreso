import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// D-20261111-01 gives the interface one vocabulary (design system, section 7.2). This test keeps the retired words out of
// what people read: it parses every non-test source file under src with the TypeScript compiler and checks only string
// literals, template chunks and JSX text. Identifiers, comments and types never reach the check, so internal names
// (jornada, deviation, site) are exempt by construction, and so are API values written as constants (`'SIN_INGRESO'`),
// paths (`'/jornadas/mine'`, `'#/historial'`), module specifiers and literal types.
//
// The sources are read from disk, relative to the frontend folder where the tests run (as app/styles.test.tsx reads the
// stylesheet). The project has no Node typings, hence the narrow local type.
type NodeFs = {
  readFileSync(path: string, encoding: 'utf8'): string
  readdirSync(path: string, options: { recursive: true; encoding: 'utf8' }): string[]
}
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): NodeFs } }).process.getBuiltinModule('node:fs')

/** A word or phrase the decision retires from the screen, with the word that replaces it. */
type Retired = { pattern: string; use: string }

// Each pattern is matched as a whole word, case-insensitive: a letter, digit or underscore next to it means another word
// («Ingresá», «ingresar», «sedentario», «alertar», «FUERA_DE_SEDE»), so it is not a match.
const RETIRED: Retired[] = [
  { pattern: 'jornadas?', use: '«día de trabajo» or «día»' },
  { pattern: 'desv[íi]os?', use: '«caso» for the ADMIN; no noun for the employee («Para explicar»)' },
  { pattern: 'bandejas?', use: '«Para revisar»' },
  { pattern: 'sedes?', use: '«local»' },
  // As the name of a mark or a case. The verb «ingresar» (to sign in) is another word and stays.
  { pattern: 'ingresos?', use: '«Entrada» or «entrada»' },
  { pattern: 'egresos?', use: '«Salida» or «salida»' },
  { pattern: 'alertas?', use: '«avisos»' },
  { pattern: 'notificaci[óo]n(?:es)?', use: '«avisos»' },
  { pattern: 'push', use: '«avisos»' },
  { pattern: 'claves?', use: '«contraseña»' },
  // The case names slice W2 retired (design system 7.2), so that none comes back as a sentence.
  { pattern: 'falta motivo', use: '«Todavía no explicó»' },
  { pattern: 'faltó la (?:entrada|salida)', use: '«No marcó la entrada», «No marcó la salida»' },
  { pattern: 'salida (?:temprana|tarde)', use: '«Salió antes», «Salió después de hora»' },
  { pattern: 'exceso de (?:desayuno|almuerzo)', use: '«Desayuno largo», «Almuerzo largo»' }
]
// «turno» is not checked: the decision row does not name it, the employee's picker keeps it on purpose (two days of work on
// the same date, EmployeeViews.tsx) and the schedule form uses it for the name of a schedule («Turno noche»).

const matchers = RETIRED.map(({ pattern, use }) => ({ use, regex: new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, 'iu') }))

/** One place a retired word still appears. `text` is the literal, template chunk or JSX text, as written. */
type Finding = { file: string; line: number; word: string; text: string; use: string }

/**
 * The exceptions, each with its reason. A finding is excused when it is in `file` and its text contains `text`. The list
 * only shrinks: an exception that no longer matches anything fails the second test, so it is deleted with the last use.
 */
const EXCEPTIONS: { file: string; text: string; reason: string }[] = [
  {
    file: 'src/shared/labels.ts',
    text: 'Sin ingreso',
    reason: 'The state of a day that has no entry yet (NO_INGRESO). D-20261111-01 names the case SIN_INGRESO («No marcó la entrada») '
      + 'but not the states of a day, which the design system (7.2) lists as still open; until the owner chooses, the state keeps its word.'
  }
]

// An API value written as a constant: an enum value or a problem code, never shown as it is.
const API_CONSTANT = /^[A-Z0-9_]+$/
// A path: an API route (`/jornadas/…`) or an address of the app (`#/historial`).
const PATH = /^#?\//
// An identifier written as a string: one lowercase token, hyphens allowed, no space. Section ids (`'jornadas'`, `'sedes'`),
// class names (`'push-control'`), element ids (`'jornada-detail'`, the head of `` `jornada-${id}` ``), event names
// (`'push'`) and notification tags. A visible text starts with a capital (sentence case, design system 7.1) or has a space,
// so it is still checked; the limit is a lone lowercase word used as text (`n === 1 ? 'día' : 'días'`), which this misses.
const IDENTIFIER = /^[a-z][a-z0-9]*(?:-[a-z0-9]*)*$/
const isExemptText = (text: string) => API_CONSTANT.test(text) || PATH.test(text) || IDENTIFIER.test(text)

function isExemptByPosition(node: ts.Node): boolean {
  const parent = node.parent
  if (!parent) return false
  // `import … from '…'`, `export … from '…'`, `import('…')`.
  if ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node) return true
  if (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword) return true
  // `type X = 'a' | 'b'` and other literal types.
  if (ts.isLiteralTypeNode(parent)) return true
  // A quoted property name (`{ 'Content-Type': … }`) is a key, not a text.
  if ((ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)) && parent.name === node) return true
  return false
}

function literalsOf(file: string, source: string): { line: number; text: string }[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found: { line: number; text: string }[] = []
  const add = (node: ts.Node, text: string) => {
    found.push({ line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, text })
  }
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (!isExemptByPosition(node) && !isExemptText(node.text)) add(node, node.text)
    } else if (ts.isTemplateExpression(node)) {
      // A template whose first chunk is a path or an identifier is a route with parameters (`/jornadas/${id}/marks`) or an
      // element id (`jornada-${id}`): all of it is.
      if (!PATH.test(node.head.text) && !IDENTIFIER.test(node.head.text)) {
        add(node.head, node.head.text)
        for (const span of node.templateSpans) add(span.literal, span.literal.text)
      }
    } else if (ts.isJsxText(node)) {
      if (!node.containsOnlyTriviaWhiteSpaces) add(node, node.text.trim())
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return found
}

function isSource(path: string): boolean {
  return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('.d.ts') && !path.startsWith('src/test/')
}

function retiredWordsIn(file: string, source: string): Finding[] {
  const findings: Finding[] = []
  for (const { line, text } of literalsOf(file, source)) {
    const normalized = text.normalize('NFC')
    for (const { regex, use } of matchers) {
      const match = regex.exec(normalized)
      if (match) findings.push({ file, line, word: match[0], text, use })
    }
  }
  return findings
}

const sources = fs.readdirSync('src', { recursive: true, encoding: 'utf8' })
  .map((path) => `src/${path.replaceAll('\\', '/')}`)
  .filter(isSource)
  .sort()
const findings = sources.flatMap((file) => retiredWordsIn(file, fs.readFileSync(file, 'utf8')))
const excused = (finding: Finding) => EXCEPTIONS.some(({ file, text }) => finding.file === file && finding.text.includes(text))

describe('glossary of the interface (D-20261111-01)', () => {
  it('finds whole retired words only, in texts and not in API values', () => {
    const words = (source: string) => retiredWordsIn('sample.tsx', source).map((finding) => finding.word)
    expect(words(`const a = 'Jornadas del día'; const b = <p>Bandeja de desvíos</p>; const c = \`La sede \${name} no existe\``))
      .toEqual(['Jornadas', 'desvíos', 'Bandeja', 'sede'])
    expect(words(`const a = 'Avisos push'; const b = 'Tu clave'; const c = 'Falta motivo'; const d = 'Egreso'`))
      .toEqual(['push', 'clave', 'Falta motivo', 'Egreso'])
    // Words that contain a retired one, API values, paths, keys, module specifiers and literal types are not matches.
    expect(words(`import x from './jornadas'
      type T = 'jornada' | 'sede'
      const a = 'Ingresá tu DNI'; const b = 'Ingresar'; const c = 'FUERA_DE_SEDE'; const d = 'SIN_INGRESO'
      const e = '/jornadas/mine'; const f = \`/admin/jornadas/\${id}/audit\`; const g = '#/historial'
      const h = { 'sede': 1 }; const i = 'sedentario, alertar, enclavado'
      navigate('jornadas'); const j = <div className="push-control" id={\`jornada-\${id}\`} />; addEventListener('push', f)
      // Bandeja de desvíos, in a comment`)).toEqual([])
  })

  it('no text people read uses a retired word', () => {
    const open = findings.filter((finding) => !excused(finding))
      .map(({ file, line, word, text, use }) => `${file}:${line} «${word}» in "${text}" (use ${use})`)
    expect(open).toEqual([])
    // The list of exceptions only shrinks: each one still excuses something, or it is deleted.
    const unused = EXCEPTIONS.filter((exception) => !findings.some((finding) => finding.file === exception.file && finding.text.includes(exception.text)))
    expect(unused).toEqual([])
  })
})
