import { describe, expect, it } from 'vitest'

// Vitest turns every CSS import (?raw included) into an empty string, so the stylesheet is read from disk,
// relative to the frontend folder where the tests run. The project has no Node typings, hence the narrow local type.
type NodeFs = { readFileSync(path: string, encoding: 'utf8'): string }
const nodeProcess = (globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): NodeFs } }).process
const css = nodeProcess.getBuiltinModule('node:fs').readFileSync('src/styles.css', 'utf8')

/** WCAG 2.x relative luminance of a #rrggbb color. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(first: string, second: string) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}
const tokens = new Map([...css.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [match[1], match[2]]))
/** The declarations of the first rule whose selector list is exactly `selector` (whitespace-insensitive). */
function rule(selector: string, source = css) {
  const wanted = selector.replace(/\s+/g, ' ').trim()
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (match[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim() === wanted) return match[2]
  }
  throw new Error(`No rule for ${selector}`)
}
function colorOf(declarations: string, property: string) {
  const value = new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim() ?? ''
  const color = /#[0-9a-f]{6}\b|var\((--[\w-]+)\)/i.exec(value)
  if (!color) throw new Error(`No color in ${property}: ${value}`)
  return color[1] ? tokens.get(color[1]) ?? '' : color[0].toLowerCase()
}
/** Every `@media (max-width: <width>px)` block joined: the browser applies all of them, not only the first. */
function media(width: number) {
  const opening = `@media (max-width: ${width}px) {`
  const blocks: string[] = []
  for (let start = css.indexOf(opening); start >= 0; start = css.indexOf(opening, start + opening.length)) {
    blocks.push(css.slice(start + opening.length, css.indexOf('\n}', start)))
  }
  if (blocks.length === 0) throw new Error(`No media query for ${width}px`)
  return blocks.join('\n')
}

describe('estilos de accesibilidad (WCAG 2.2 AA)', () => {
  it('los bordes de los campos y de los botones de marca contrastan al menos 3:1 con el blanco (1.4.11)', () => {
    const fieldBorder = colorOf(rule('.field input, .field select, .field textarea, td input, .company-switch'), 'border')
    const markBorder = colorOf(rule('.mark-action'), 'border')

    expect(contrast(fieldBorder, '#ffffff')).toBeGreaterThanOrEqual(3)
    expect(contrast(markBorder, '#ffffff')).toBeGreaterThanOrEqual(3)
  })

  it('el botón de marca principal usa el verde de los botones principales con texto blanco', () => {
    const primary = rule('.mark-action-primary')

    expect(colorOf(primary, 'background')).toBe(tokens.get('--green'))
    expect(colorOf(primary, 'color')).toBe('#ffffff')
  })

  it('declara esquema de color claro para que los controles nativos no se oscurezcan', () => {
    expect(rule(':root')).toMatch(/color-scheme:\s*light/)
  })

  it('en el celular el menú del ADMIN muestra todas las secciones sin desplazamiento horizontal ni barra fija', () => {
    const phone = media(520)

    expect(rule('.sidebar', phone)).toMatch(/position:\s*static/)
    expect(rule('.sidebar nav', phone)).toMatch(/flex-wrap:\s*wrap/)
  })

  it('en un celular angosto la barra de arriba es una sola fila: "Cerrar sesión" entra al lado del logo', () => {
    const narrow = media(400)

    expect(narrow).not.toMatch(/:root\s*\{[^}]*--topbar-height:\s*96px/)
    expect(narrow).not.toMatch(/\.topbar-actions\s*\{[^}]*width:\s*100%/)
    expect(rule('.topbar-actions', narrow)).toMatch(/margin-left:\s*auto/)
  })

  // 2026-11-09: ".auth-card > .muted" (margin 0 0 26px) beat ".auth-hint" and the hint sat glued under "Ingresar".
  it('la ayuda "¿Te olvidaste la clave?" queda separada del botón Ingresar', () => {
    expect(rule('.auth-card > .auth-hint')).toMatch(/margin:\s*20px 0 0/)
    expect(css.indexOf('.auth-card > .auth-hint')).toBeGreaterThan(css.indexOf('.auth-card > .muted'))
  })

  it('el botón de la barra de avisos no se parte en dos líneas en ningún ancho', () => {
    expect(rule('.push-control .button')).toMatch(/white-space:\s*nowrap/)
    expect(rule('.push-control .button')).toMatch(/flex-shrink:\s*0/)
  })

  it('los botones chicos miden al menos 44 px de ancho y de alto (2.5.8)', () => {
    expect(rule('.button-small')).toMatch(/min-height:\s*var\(--tap-target\)/)
    expect(rule('.button-small')).toMatch(/min-width:\s*var\(--tap-target\)/)
  })

  it('una sola acción extra del empleado ocupa toda la fila y la tarjeta de horario baja su botón en el celular', () => {
    expect(rule('.mark-actions.employee-more-actions')).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(140px,\s*1fr\)\)/)
    expect(rule('.template-card', media(520))).toMatch(/flex-wrap:\s*wrap/)
  })

  it('deja lugar para que la barra de avisos fija no tape el foco (2.4.11)', () => {
    const clearance = (declarations: string) => Number(/--alerts-bar-clearance:\s*(\d+)px/.exec(declarations)?.[1])

    expect(rule('html:has(.push-control)')).toMatch(/scroll-padding-bottom:\s*calc\(var\(--alerts-bar-clearance\)/)
    expect(rule('.main-content')).toMatch(/calc\(var\(--alerts-bar-clearance\)/)
    // Measured 2026-11-09 with headless Chrome: on wide screens the bar is 98 px tall with three lines of text (a long company
    // name) and sits 18 px above the edge; at 760 px or less it shows a short status: 68 px tall, 18 px above the edge (64 px
    // tall, 9 px above it, at 520 px or less). The clearance covers the bar plus that offset.
    expect(clearance(rule(':root'))).toBeGreaterThanOrEqual(98 + 18)
    expect(clearance(rule(':root', media(760)))).toBeGreaterThanOrEqual(68 + 18)
    // No narrower breakpoint brings back a smaller clearance.
    expect(media(520)).not.toMatch(/--alerts-bar-clearance/)
    expect(media(400)).not.toMatch(/--alerts-bar-clearance/)
  })

  it('en el celular y la tablet la barra de avisos muestra solo un estado corto al lado del botón', () => {
    const tablet = media(760)

    expect(rule('.push-title, .push-detail', tablet)).toMatch(/display:\s*none/)
    expect(rule('.push-status-short', tablet)).toMatch(/display:\s*block/)
    expect(rule('.push-status-short')).toMatch(/display:\s*none/)
  })
})

// The token block is the top of the stylesheet, down to TOKENS_END. Its first part holds the design tokens; from LEGACY_START
// to the end of that rule it keeps the names the old rules still use.
const TOKENS_END = '/* end of tokens */'
const LEGACY_START = '/* legacy tokens, removed in H1 */'
function markerIndex(marker: string) {
  const index = css.indexOf(marker)
  if (index < 0) throw new Error(`No "${marker}" in the stylesheet`)
  return index
}
// Comments name issues ("#102") and colours in prose; only declarations count.
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '')
/** Every rule under the token block: there a value has to come from a token. */
const belowTokens = () => withoutComments(css.slice(markerIndex(TOKENS_END)))
/** A colour of the design tokens. The legacy names and anything declared further down are left out on purpose. */
function designToken(name: string) {
  const block = css.slice(0, markerIndex(LEGACY_START))
  const value = new Map([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((match) => [match[1], match[2]])).get(name)
  if (!value) throw new Error(`No colour token --${name} in the token block`)
  return value
}

// Ported from odd/ux-ui-refactor/contrast.mjs: the 55 pairings the design system uses. 'text' needs 4.5:1 (WCAG 1.4.3);
// 'ui' needs 3:1 (1.4.11: edges of controls, state indicators, icons that carry meaning, focus). The six pairings that
// script only reports (hairline, fills against each other, transient states) have no requirement and are not here.
const TOKEN_PAIRS: [foreground: string, background: string, kind: 'text' | 'ui', where: string][] = [
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
  ['lime', 'brand', 'ui', 'Focus ring on the top bar; the brand mark']
]

// Ceilings that only go down. Each one counts what the rules under the token block still write by hand, measured with the
// pattern of its own test when the token block came in (2026-11-11). A slice that moves rules to tokens lowers the number in
// the same commit; nobody raises one. Slice H1 turns the four into equalities with zero.
const COLOR_LITERAL_CEILING = 144
const UNTOKENED_FONT_SIZE_CEILING = 79
const BOX_SHADOW_CEILING = 14
const LEGACY_TOKEN_USE_CEILING = 137

// The old names with the values they had before the token block. A name is deleted from the stylesheet once nothing uses it
// and never gets a new value in the meantime: a half-migrated rule must look exactly as it did.
const LEGACY_TOKENS = new Map([
  ['--text-primary', '#18241f'],
  ['--text-secondary', '#53645a'],
  ['--text-tertiary', '#5c6d62'],
  ['--page', '#f4f7f5'],
  ['--focus', '#1d513c'],
  ['--topbar-height', '70px'],
  ['--alerts-bar-clearance', '124px'],
  ['--tap-target', '44px'],
  ['--radius-control', '9px'],
  ['--radius-panel', '14px'],
  ['--green', '#12372a'],
  ['--green-2', '#1d513c'],
  ['--green-3', '#e7f1e9'],
  ['--muted', 'var(--text-secondary)'],
  ['--line', '#e4e9e5'],
  ['--red', '#a33e35'],
  ['--shadow', '0 18px 55px rgba(24, 45, 34, .06)']
])

describe('tokens de diseño: el bloque de arriba y lo que todavía queda fuera de él', () => {
  it('cada par de texto, borde, estado y foco de los tokens cumple el contraste AA (1.4.3 y 1.4.11)', () => {
    const failing = TOKEN_PAIRS
      .map(([foreground, background, kind, where]) => ({
        pair: `--${foreground} sobre --${background}`,
        where,
        need: kind === 'text' ? 4.5 : 3,
        ratio: contrast(designToken(foreground), designToken(background))
      }))
      .filter(({ ratio, need }) => ratio < need)

    expect(failing).toEqual([])
  })

  it('ningún color fuera del bloque de tokens: el techo de colores escritos a mano solo baja', () => {
    // Hex, rgb()/rgba()/hsl() and the two keywords a rule would use for a surface or a text; transparent, currentColor and
    // the system colours of forced-colors are not values a token replaces.
    const literals = belowTokens().match(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgb|hsl)a?\(|(?<![\w-])(?:white|black)(?![\w-])/gi) ?? []

    expect(literals.length).toBeLessThanOrEqual(COLOR_LITERAL_CEILING)
  })

  it('los tamaños de letra salen de los tokens: el techo de font-size sin token solo baja', () => {
    const sizes = [...belowTokens().matchAll(/(?<![\w-])font-size\s*:\s*([^;}]+)/g)].map((match) => match[1].trim())
    const untokened = sizes.filter((size) => !/^var\(--font-size-[\w-]+\)$/.test(size))

    expect(untokened.length).toBeLessThanOrEqual(UNTOKENED_FONT_SIZE_CEILING)
  })

  it('no se agregan sombras: el techo de box-shadow solo baja', () => {
    const shadows = belowTokens().match(/(?<![\w-])box-shadow\s*:/g) ?? []

    expect(shadows.length).toBeLessThanOrEqual(BOX_SHADOW_CEILING)
  })

  it('los tokens viejos conservan su valor hasta que se borran y sus usos solo bajan', () => {
    const start = markerIndex(LEGACY_START)
    const block = withoutComments(css.slice(start, css.indexOf('}', start)))
    const declared = new Map([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]))
    const used = [...withoutComments(css).matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]).filter((name) => LEGACY_TOKENS.has(name))

    // Not restyled, and no new name sneaks into the block: the way forward is a design token.
    for (const [name, value] of declared) expect(value, name).toBe(LEGACY_TOKENS.get(name))
    // Not orphaned: a name some rule still uses is still declared.
    expect([...new Set(used)].filter((name) => !declared.has(name))).toEqual([])
    expect(used.length).toBeLessThanOrEqual(LEGACY_TOKEN_USE_CEILING)
  })

  it('el esquema claro se declara en el bloque de tokens y ninguna otra regla lo cambia', () => {
    const declarations = [...withoutComments(css).matchAll(/(?<![\w-])color-scheme\s*:\s*([^;}]+)/g)].map((match) => match[1].trim())

    expect(withoutComments(css.slice(0, markerIndex(LEGACY_START)))).toMatch(/(?<![\w-])color-scheme:\s*light\s*;/)
    expect(declarations).toEqual(['light'])
  })
})

/** Every rule of the stylesheet, media blocks included, with its selector list split. */
function allRules() {
  return [...withoutComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(',').map((selector) => selector.replace(/\s+/g, ' ').trim()),
    declarations: match[2]
  }))
}

describe('base del documento: tipografía, enlaces, foco y placeholder', () => {
  it('hay una sola familia de letra: toda font-family sale de un token', () => {
    const families = [...belowTokens().matchAll(/(?<![\w-])font-family\s*:\s*([^;}]+)/g)].map((match) => match[1].trim())

    // The first :root is the token rule; the document defaults are the :root under it.
    expect(rule(':root', belowTokens())).toMatch(/font-family:\s*var\(--font-sans\)/)
    expect(families.filter((family) => !/^var\(--font-(?:sans|mono)\)$/.test(family))).toEqual([])
  })

  it('el texto corrido tiene interlineado: body usa el token de 1.5', () => {
    expect(rule('body')).toMatch(/line-height:\s*var\(--line-height-body\)/)
  })

  // Measured 2026-11-11 with headless Chrome at 1366 px: with the line height of body the bar grows from 98 to 107.5 px and
  // the 124 px of --alerts-bar-clearance stop covering it plus its 18 px offset (2.4.11, the test of the fixed bar above).
  it('la barra de avisos fija no hereda el interlineado del cuerpo: conserva el alto con el que se midió su lugar', () => {
    expect(rule('.push-control')).toMatch(/line-height:\s*normal/)
  })

  it('los títulos usan la escala de los tokens, sin espaciado entre letras', () => {
    expect(rule('h1')).toMatch(/font-size:\s*var\(--font-size-display\)/)
    expect(rule('h1')).toMatch(/line-height:\s*var\(--line-height-tight\)/)
    expect(rule('h2')).toMatch(/font-size:\s*var\(--font-size-title\)/)
    expect(rule('h2')).toMatch(/line-height:\s*var\(--line-height-heading\)/)
    for (const heading of ['h1', 'h2']) expect(rule(heading), heading).not.toMatch(/letter-spacing/)
  })

  it('el texto chico de arriba de un título mide 14 px, en negrita y sin espaciado entre letras', () => {
    const eyebrow = rule('.eyebrow')

    expect(eyebrow).toMatch(/font-size:\s*var\(--font-size-meta\)/)
    expect(eyebrow).toMatch(/font-weight:\s*var\(--font-weight-heavy\)/)
    expect(eyebrow).not.toMatch(/letter-spacing/)
  })

  it('un enlace se reconoce sin depender del color: va subrayado y con el verde de la marca (1.4.1)', () => {
    expect(rule('a')).toMatch(/text-decoration:\s*underline/)
    expect(rule('a')).toMatch(/(?<![\w-])color:\s*var\(--brand\)/)
  })

  it('el foco se ve igual en todo control: un anillo de 3 px separado 2 px, con el color del token (2.4.7)', () => {
    const fields = '.field input:focus-visible, .field select:focus-visible, .field textarea:focus-visible, td input:focus-visible, .company-switch:focus-visible'

    for (const selector of [':focus-visible', fields]) {
      expect(rule(selector), selector).toMatch(/outline:\s*3px solid var\(--focus-ring\)/)
      expect(rule(selector), selector).toMatch(/outline-offset:\s*2px/)
    }
  })

  it('ninguna regla quita el contorno sin su regla :focus-visible que lo devuelve (2.4.7)', () => {
    const removesRing = /(?<![\w-])outline(?:-style|-width)?\s*:\s*(?:none|0)\s*(?:;|$)/
    const drawsRing = /(?<![\w-])outline\s*:\s*(?!(?:none|0)\s*(?:;|$))[^;]+/
    const ringed = new Set(allRules().filter(({ declarations }) => drawsRing.test(declarations)).flatMap(({ selectors }) => selectors))
    const unguarded = allRules()
      .filter(({ declarations }) => removesRing.test(declarations))
      .flatMap(({ selectors }) => selectors)
      // ":focus:not(:focus-visible)" only hides the ring where the browser would not draw one (a tap, a click).
      .filter((selector) => !selector.endsWith(':not(:focus-visible)'))
      .filter((selector) => !ringed.has(`${selector.replace(/:focus$/, '')}:focus-visible`))

    expect(unguarded).toEqual([])
  })

  it('el texto de ejemplo de un campo se lee: placeholder con el color de texto secundario y sin transparencia (1.4.3)', () => {
    const placeholder = rule('::placeholder')

    expect(placeholder).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(placeholder).toMatch(/opacity:\s*1\s*(?:;|$)/)
  })

  it('los íconos siguen el tamaño del texto y el texto solo para lectores de pantalla no se saca del árbol de accesibilidad', () => {
    const hidden = rule('.visually-hidden')

    expect(rule('.icon')).toMatch(/width:\s*1\.25em/)
    expect(rule('.icon')).toMatch(/height:\s*1\.25em/)
    expect(rule('.icon')).toMatch(/stroke:\s*currentColor/)
    expect(hidden).toMatch(/position:\s*absolute/)
    expect(hidden).toMatch(/clip-path:\s*inset\(50%\)/)
    expect(hidden).not.toMatch(/display:\s*none|visibility:\s*hidden/)
  })
})
