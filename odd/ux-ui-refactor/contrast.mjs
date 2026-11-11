// WCAG 2.2 contrast of every text and UI pairing the design system uses. Tokens are read from tokens.css (same folder).
//   node contrast.mjs            -> prints the table, writes contrast-output.md, exits 1 if a required pairing fails
// The luminance formula and its 0.03928 threshold are the ones of frontend/src/app/styles.test.tsx:10-18, so this table
// can be ported into that test as it is (slice A1).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'tokens.css'), 'utf8')
const tokens = new Map([...css.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [match[1].slice(2), match[2].toLowerCase()]))

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(first, second) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}
const NEED = { text: 4.5, large: 3, ui: 3 }

// [foreground, background, kind, where]. kind: text (4.5:1), large (3:1, 24 px or 18.5 px bold and up), ui (3:1, WCAG 1.4.11:
// boundaries of controls, state indicators, focus, icons that carry meaning), info (reported, not required).
const PAIRS = [
  // Text on the neutral surfaces
  ['text', 'surface', 'text', 'Body text, headings, labels, secondary button label'],
  ['text', 'surface-tint', 'text', 'Rail items, context strip, info notice, disabled-reason text on a band'],
  ['text', 'surface-tint-strong', 'text', 'Rail item under the pointer, pressed secondary button'],
  ['text', 'surface-selected', 'text', 'Title of the selected option'],
  ['text-muted', 'surface', 'text', 'Hints, secondary lines, placeholders, inactive tab label, empty states'],
  ['text-muted', 'surface-tint', 'text', 'Context strip, rail captions, label of a disabled button'],
  ['text-muted', 'surface-tint-strong', 'text', 'Secondary line of a rail item under the pointer'],
  ['text-muted', 'surface-selected', 'text', 'Help line of the selected option'],
  // Brand as text, and text on brand
  ['brand', 'surface', 'text', 'Link buttons and links'],
  ['brand', 'surface-tint', 'text', 'Link button inside an info notice or on the rail'],
  ['brand', 'surface-selected', 'text', 'Label of the current tab'],
  ['on-brand', 'brand', 'text', 'Primary button label, clocking button, top bar text and links'],
  ['on-brand', 'brand-pressed', 'text', 'Primary button under the pointer or pressed'],
  ['on-brand-muted', 'brand', 'text', 'Secondary text of the top bar (company and person from 1024 px)'],
  // States: text on its own tinted surface and on white
  ['text', 'ok-surface', 'text', 'Text of a success message and of the mark confirmation'],
  ['ok', 'ok-surface', 'text', 'Tag «Justificado» / «Listo», «Ubicación enviada» inside the confirmation'],
  ['ok', 'surface', 'text', 'ok-coloured text on white'],
  ['text', 'warn-surface', 'text', 'Text of a warning message'],
  ['warn', 'warn-surface', 'text', 'Tag «A revisar» / «Falta explicar» / «Falta»'],
  ['warn', 'surface', 'text', 'Detail of a pending step'],
  ['text', 'bad-surface', 'text', 'Text of an error message'],
  ['bad', 'bad-surface', 'text', 'Tag «No justificado»'],
  ['bad', 'surface', 'text', 'Field error text, label of a destructive button'],
  ['bad', 'surface-tint', 'text', 'Destructive button on a band'],
  ['text-muted', 'ok-surface', 'text', 'Secondary line inside a success message'],
  ['text-muted', 'warn-surface', 'text', 'Secondary line inside a warning message'],
  ['text-muted', 'bad-surface', 'text', 'Secondary line inside an error message'],
  ['brand', 'ok-surface', 'text', 'Link button inside a success message'],
  ['brand', 'warn-surface', 'text', 'Link button inside a warning message'],
  ['brand', 'bad-surface', 'text', 'Link button inside an error message («Reintentar»)'],
  // Boundaries of controls
  ['border', 'surface', 'ui', 'Border of fields, secondary buttons, tags, folds; top edge of the bottom bar; dotted state bar «Falta motivo»'],
  ['border', 'surface-tint', 'ui', 'Border of a disabled button; bar of an info notice; secondary button on the rail'],
  ['border', 'ok-surface', 'ui', 'Border of a secondary button inside a success message'],
  ['border', 'warn-surface', 'ui', 'Border of a secondary button inside a warning message'],
  ['border', 'bad-surface', 'ui', 'Border of a secondary button inside an error message'],
  ['brand', 'surface', 'ui', 'Primary button against the page; border of the selected option; bar of the current place; "now" block border'],
  ['brand', 'surface-tint', 'ui', 'Bar of the current rail item; primary button on a band'],
  ['brand', 'surface-selected', 'ui', 'Border of the selected option against its own fill; top bar of the current tab'],
  ['text', 'surface', 'ui', 'Rule under a section title'],
  // State indicators
  ['warn', 'surface', 'ui', 'State bar «A revisar»; bar of a pending task; bar and icon of a warning'],
  ['ok', 'surface', 'ui', 'State bar «Justificado»; border of the mark confirmation'],
  ['bad', 'surface', 'ui', 'State bar «No justificado»; border and bar of an invalid field'],
  ['warn', 'warn-surface', 'ui', 'Border and icon of the tag «A revisar»; icon of a warning message'],
  ['ok', 'ok-surface', 'ui', 'Border and icon of the tag «Justificado»; icon of a success message'],
  ['bad', 'bad-surface', 'ui', 'Border and icon of the tag «No justificado»; icon of an error message'],
  ['on-brand', 'ok', 'ui', 'Check inside the round icon of the mark confirmation'],
  ['warn', 'ok-surface', 'ui', 'Warning icon of the missing location inside the mark confirmation'],
  ['text-muted', 'surface', 'ui', 'Icons that accompany secondary text (location, clock)'],
  // Focus
  ['focus-ring', 'surface', 'ui', 'Focus ring on white'],
  ['focus-ring', 'surface-tint', 'ui', 'Focus ring on a band'],
  ['focus-ring', 'surface-selected', 'ui', 'Focus ring around the selected option'],
  ['focus-ring', 'ok-surface', 'ui', 'Focus ring inside a success message'],
  ['focus-ring', 'warn-surface', 'ui', 'Focus ring inside a warning message'],
  ['focus-ring', 'bad-surface', 'ui', 'Focus ring inside an error message'],
  ['lime', 'brand', 'ui', 'Focus ring on the top bar; the brand mark'],
  // Reported, not required
  ['rule', 'surface', 'info', 'Hairline between rows: decorative, rows are also separated by spacing'],
  ['surface-selected', 'surface', 'info', 'Selected fill against the unselected one: never the indicator (the 2 px brand border and the mark are)'],
  ['surface-tint', 'surface', 'info', 'Band against the page: decorative grouping'],
  ['surface-tint-strong', 'surface-tint', 'info', 'Pointer-over fill on a band: not a state that must be perceived'],
  ['brand-pressed', 'brand', 'info', 'Pressed primary against its rest colour: transient, not relied upon'],
  ['focus-ring', 'brand', 'info', 'Focus ring against the primary fill: the 2 px offset puts the surface between them, so the ring is judged against the surface']
]

const hex = (name) => { const value = tokens.get(name); if (!value) throw new Error(`No token --${name} in tokens.css`); return value }
const rows = PAIRS.map(([foreground, background, kind, where]) => {
  const ratio = contrast(hex(foreground), hex(background))
  const need = NEED[kind]
  return { foreground, background, kind, where, ratio, need, pass: need === undefined ? null : ratio >= need }
})
const required = rows.filter((row) => row.pass !== null)
const failed = required.filter((row) => !row.pass)
const lowest = [...required].sort((a, b) => (a.ratio - a.need) - (b.ratio - b.need))[0]

const requirement = (row) => row.kind === 'info' ? 'not required' : `${row.kind} ≥ ${row.need}:1`
const result = (row) => row.pass === null ? 'reported' : row.pass ? 'pass' : 'FAIL'
const lines = [
  '# Contrast of the design tokens (WCAG 2.2 AA)',
  '',
  `Generated by \`contrast.mjs\` from \`tokens.css\`. ${required.length} required pairings, ${failed.length} failing; ${rows.length - required.length} reported without a requirement.`,
  `Smallest margin among the required ones: --${lowest.foreground} on --${lowest.background}, ${lowest.ratio.toFixed(2)}:1 for ${requirement(lowest)}.`,
  '',
  '| Foreground | Background | Ratio | Requirement | Result | Used for |',
  '|---|---|---|---|---|---|',
  ...rows.map((row) => `| \`--${row.foreground}\` ${hex(row.foreground)} | \`--${row.background}\` ${hex(row.background)} | ${row.ratio.toFixed(2)}:1 | ${requirement(row)} | ${result(row)} | ${row.where} |`),
  ''
]
writeFileSync(join(here, 'contrast-output.md'), lines.join('\n'), 'utf8')
console.log(lines.join('\n'))
if (failed.length) { console.error(`${failed.length} pairing(s) fail`); process.exit(1) }
