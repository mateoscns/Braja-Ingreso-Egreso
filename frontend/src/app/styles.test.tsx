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
/** Every `@media (max-width: <width>px)` block joined (or `min-width`): the browser applies all of them, not only the first. */
function media(width: number, edge: 'max' | 'min' = 'max') {
  const opening = `@media (${edge}-width: ${width}px) {`
  const blocks: string[] = []
  for (let start = css.indexOf(opening); start >= 0; start = css.indexOf(opening, start + opening.length)) {
    blocks.push(css.slice(start + opening.length, css.indexOf('\n}', start)))
  }
  if (blocks.length === 0) throw new Error(`No media query for ${width}px`)
  return blocks.join('\n')
}

describe('estilos de accesibilidad (WCAG 2.2 AA)', () => {
  // Rewritten in slice B3 (the field half): the text box is one scoped rule and its edge is the border token on the surface
  // token, not a colour written by hand. Slice D1 removed the half of the mark buttons: they are secondary buttons now, whose
  // edge is the same token (and the pairing --border on --surface of the token test).
  it('los bordes de los campos contrastan al menos 3:1 con el blanco (1.4.11)', () => {
    const textBox = ruleListing(TEXT_BOX).declarations

    expect(textBox).toMatch(/border:\s*var\(--border-width\) solid var\(--border\)/)
    expect(textBox).toMatch(/background:\s*var\(--surface\)/)
    expect(contrast(designToken('border'), designToken('surface'))).toBeGreaterThanOrEqual(3)
  })

  // Replaced in slice D1: the mark buttons of their own (.mark-action, and .mark-action-primary, which nothing used) are gone.
  // The next mark is a primary button of 80 px; the others are buttons of the system and take its colours.
  it('la próxima marca es un botón principal de 80 px y las marcas ya no tienen botones propios', () => {
    expect(rule('.button-clock')).toMatch(/min-height:\s*var\(--target-clock\)/)
    expect(allSelectors().filter((selector) => /\.mark-action/.test(selector))).toEqual([])
  })

  it('declara esquema de color claro para que los controles nativos no se oscurezcan', () => {
    expect(rule(':root')).toMatch(/color-scheme:\s*light/)
  })

  // Replaced in slice N4 (D-20261111-02): four destinations, a bar fixed at the bottom of the screen under 1024 px and a column on
  // the left from there. A phone lying down (360 px tall) keeps the bar in the page instead of losing 72 px of its height to it.
  // The four labels are whole at 320 px: equal shares that never get narrower than the longest word («Configuración»).
  it('la navegación del ADMIN es una barra fija abajo hasta 1024 px, una columna a la izquierda desde ahí y entra entera en 320 px', () => {
    const wide = media(1024, 'min')
    const lying = mediaBlock('max-height: 480px')

    expect(rule('.nav')).toMatch(/position:\s*fixed/)
    expect(rule('.nav')).toMatch(/(?<![\w-])bottom:\s*0\s*;/)
    expect(rule('.nav', wide)).toMatch(/position:\s*static/)
    expect(rule('.nav', lying)).toMatch(/position:\s*static/)
    expect(/grid-template-columns:\s*([^;]+)/.exec(rule('.workspace', wide))?.[1].trim()).toBe('var(--rail-width) minmax(0, 1fr)')
    expect(rule('.nav-list')).toMatch(/display:\s*flex/)
    expect(rule('.nav-list > li')).toMatch(/flex:\s*1 1 0\s*;/)
    expect(rule('.nav-list > li')).toMatch(/min-width:\s*min-content/)
    // The parts of «Configuración» are listed on the rail only (the owner, 2026-11-11: "Sí, con sus partes").
    expect(/display:\s*([^;]+)/.exec(rule('.nav-sub'))?.[1].trim()).toBe('none')
    expect(/display:\s*([^;]+)/.exec(rule('.nav-sub', wide))?.[1].trim()).toBe('block')
  })

  // Rewritten in slice C1: the bar is a grid of three named areas (the brand and «Cerrar sesión» on the dark row, the company
  // and the person under it on phones, all three in one row from 1024 px). It has no fixed height, so a larger text or a long
  // company name makes it taller instead of cutting it, and it scrolls away with the page: no rule makes it sticky or fixed.
  it('la barra de arriba es una grilla de marca, contexto y salida, sin alto fijo y sin quedar pegada arriba', () => {
    const areas = (declarations: string) => /grid-template-areas:\s*([^;]+)/.exec(declarations)?.[1] ?? ''
    const phone = rule('.topbar')
    const wide = rule('.topbar', media(1024, 'min'))
    const positioned = rulesNaming('topbar').filter(({ declarations }) => /(?<![\w-])position\s*:\s*(?:sticky|fixed)/.test(declarations))

    expect(phone).toMatch(/display:\s*grid/)
    expect(areas(phone).replace(/\s+/g, ' ')).toBe('"brand out" "context context"')
    expect(areas(wide).replace(/\s+/g, ' ')).toBe('"brand context out"')
    for (const area of ['brand', 'context', 'out']) {
      expect(allRules().some(({ declarations }) => new RegExp(`grid-area:\\s*${area}\\s*(?:;|$)`).test(declarations)), area).toBe(true)
    }
    for (const declarations of [phone, wide]) expect(declarations).not.toMatch(/(?<![\w-])height\s*:/)
    expect(selectorsOf(positioned)).toEqual([])
    // The hold of slice B2 (14 px text and 11 px of padding on the top bar buttons) is gone with the row it was measured on.
    expect(allSelectors().filter((selector) => selector.includes('.topbar-actions'))).toEqual([])
  })

  // Nothing floats (design system, principle 10): the update notice and the install help open in the flow of the page.
  it('el aviso de versión nueva y la ayuda para instalar van en el flujo de la página, sin flotar sobre ella', () => {
    const floating = rulesNaming('update-banner', 'install-help').filter(({ declarations }) => /(?<![\w-])position\s*:\s*(?:fixed|absolute)/.test(declarations))

    expect(rulesNaming('update-banner', 'install-help').length).toBeGreaterThan(0)
    expect(selectorsOf(floating)).toEqual([])
  })

  // 2026-11-09: ".auth-card > .muted" (margin 0 0 26px) beat ".auth-hint" and the hint sat glued under "Ingresar".
  it('la ayuda "¿Te olvidaste la clave?" queda separada del botón Ingresar', () => {
    expect(rule('.auth-card > .auth-hint')).toMatch(/margin:\s*20px 0 0/)
    expect(css.indexOf('.auth-card > .auth-hint')).toBeGreaterThan(css.indexOf('.auth-card > .muted'))
  })

  // Replaced in slice N4: the alerts bar left the screen for the «Configuración» page. Nothing is fixed on screen but the bar of
  // the navigation and the band under the iPhone's status bar, which is as tall as that area (0 elsewhere) and holds nothing.
  it('nada queda fijo en la pantalla salvo la barra de navegación y la franja de la barra de estado del iPhone', () => {
    const fixed = allRules().filter(({ declarations }) => /(?<![\w-])position\s*:\s*fixed/.test(declarations))

    expect(selectorsOf(fixed)).toEqual(['body::before', '.nav'])
    expect(rule('body::before')).toMatch(/(?<![\w-])height:\s*env\(safe-area-inset-top\)/)
    expect(rule('body::before')).toMatch(/content:\s*""/)
  })

  // Rewritten in slice B2: ".button-small" is gone, every button has the size of the base rule (48 px on touch layouts, 44 px
  // from 1024 px). A link button has almost no padding, so it also names its width.
  it('todo botón mide al menos el alto de toque del sistema y el botón de enlace también el ancho (2.5.8)', () => {
    expect(rule('.button')).toMatch(/min-height:\s*var\(--target\)/)
    expect(rule('.button-link')).toMatch(/min-width:\s*var\(--target\)/)
    expect(allRules().flatMap(({ selectors }) => selectors).filter((selector) => selector.includes('.button-small'))).toEqual([])
  })

  // The first half changed in slice D1: the marks of the employee go one under the other in a single column at every width, so
  // each one keeps the whole row (2026-11-09: one extra action took half the row).
  it('las marcas del empleado van en una sola columna y la tarjeta de horario baja su botón en el celular', () => {
    expect(rule('.now-actions')).toMatch(/display:\s*grid/)
    expect(rule('.now-actions')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    // No breakpoint splits them into columns again.
    const columns = allRules().filter(({ selectors }) => selectors.some((selector) => selector.includes('.now-actions')))
      .flatMap(({ declarations }) => [...declarations.matchAll(/grid-template-columns:\s*([^;]+)/g)].map((match) => match[1].trim()))
    expect(columns).toEqual(['minmax(0, 1fr)'])
    expect(rule('.template-card', media(520))).toMatch(/flex-wrap:\s*wrap/)
  })

  // Replaced in slice N4 (WCAG 2.4.11): the content ends above the bar and the scroll to a focused control leaves the bar clear,
  // both counting the phone's bottom safe area, which the bar also keeps below its items. Where the bar is in the page (the rail,
  // a phone lying down) nothing is reserved.
  it('deja lugar para que la barra de navegación no tape el contenido ni el foco (2.4.11)', () => {
    const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()
    const reserve = /^calc\(var\(--bottom-nav-height\) \+ env\(safe-area-inset-bottom\)/

    expect(value(rule('.main-content'), 'padding-bottom')).toMatch(reserve)
    expect(value(rule('html:has(.nav)'), 'scroll-padding-bottom')).toMatch(reserve)
    expect(value(rule('.nav'), 'padding-bottom')).toBe('env(safe-area-inset-bottom)')
    for (const block of [media(1024, 'min'), mediaBlock('max-height: 480px')]) {
      expect(value(rule('.main-content', block), 'padding-bottom')).toBe('var(--space-7)')
      expect(value(rule('html:has(.nav)', block), 'scroll-padding-bottom')).toBe('0')
    }
  })

  // Replaced in slice N4: the alerts bar, its copy variants and the room kept for it are gone; the control is a row of the
  // «Configuración» page (.setting-row), in the flow of the page at every width.
  it('la barra de avisos fija se fue con sus variantes de texto y con el lugar que se le reservaba', () => {
    expect(css).not.toMatch(/--alerts-bar-clearance/)
    expect(selectorsOf(rulesNaming('push-control', 'push-copy', 'push-title', 'push-detail', 'push-status-short'))).toEqual([])
    expect(selectorsOf(rulesNaming('sidebar', 'sidebar-caption', 'sidebar-footer', 'nav-link-active', 'nav-icon', 'nav-dot'))).toEqual([])
    expect(rulesNaming('setting-row').length).toBeGreaterThan(0)
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
// Lowered in slice N4 (the old menu, the fixed alerts bar and their room went): 42 → 30, 29 → 20, 6 → 4, 48 → 31.
const COLOR_LITERAL_CEILING = 30
const UNTOKENED_FONT_SIZE_CEILING = 20
const BOX_SHADOW_CEILING = 4
const LEGACY_TOKEN_USE_CEILING = 31

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

/** A selector list split at its own commas: the ones inside `:is()`, `:not()` or `:has()` belong to one selector. */
function splitSelectors(list: string) {
  const selectors: string[] = []
  let depth = 0
  let current = ''
  for (const character of list) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      selectors.push(current)
      current = ''
    } else current += character
  }
  return [...selectors, current].map((selector) => selector.replace(/\s+/g, ' ').trim())
}
/** Every rule of the stylesheet, media blocks included, with its selector list split. */
function allRules() {
  return [...withoutComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: splitSelectors(match[1]),
    declarations: match[2]
  }))
}
/** The first rule that names `selector` in its list, whatever else the list holds: a rule an old name shares with a new one is
    found by either, and adding a name to the list does not break the test that reads it. */
function ruleListing(selector: string) {
  const found = allRules().find(({ selectors }) => selectors.includes(selector))
  if (!found) throw new Error(`No rule lists ${selector}`)
  return found
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

  // Replaced in slice N4: the fixed alerts bar whose line height this held is gone. The labels of the navigation: 14 px in 600
  // on the bar, the place shown told by a bar of 4 px and the weight, never by the colour alone (1.4.1).
  it('el lugar actual de la navegación se reconoce por una barra de 4 px y la negrita, no solo por el color (1.4.1)', () => {
    const wide = media(1024, 'min')

    expect(rule('.nav-link')).toMatch(/font-size:\s*var\(--font-size-meta\)/)
    expect(rule('.nav-link')).toMatch(/font-weight:\s*var\(--font-weight-strong\)/)
    expect(rule('.nav-link[aria-current]')).toMatch(/border-top-color:\s*var\(--brand\)/)
    expect(rule('.nav-link[aria-current]')).toMatch(/font-weight:\s*var\(--font-weight-heavy\)/)
    expect(rule('.nav-link[aria-current="page"]', wide)).toMatch(/border-left-color:\s*var\(--brand\)/)
    expect(rule('.nav-link[aria-current="true"]', wide)).toMatch(/font-weight:\s*var\(--font-weight-heavy\)/)
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

  // Changed in slice B3: the text box of a field no longer removes the outline, so the rule that named the ring again for the
  // fields is gone. What is checked now is that no field, cell or company switcher sets an outline of its own.
  it('el foco se ve igual en todo control: un anillo de 3 px separado 2 px, con el color del token (2.4.7)', () => {
    const ownOutline = allRules()
      .filter(({ selectors }) => selectors.some((selector) => /\.field(?![\w-])|^td\b|\.company-switch(?![\w-])/.test(selector)))
      .filter(({ declarations }) => /(?<![\w-])outline(?:-[\w-]+)?\s*:/.test(declarations))

    expect(rule(':focus-visible')).toMatch(/outline:\s*3px solid var\(--focus-ring\)/)
    expect(rule(':focus-visible')).toMatch(/outline-offset:\s*2px/)
    expect(ownOutline.map(({ selectors }) => selectors.join(', '))).toEqual([])
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

/** The stylesheet without its `@media (hover: hover)` blocks: what is left applies on a touch screen too. */
function withoutHoverBlocks() {
  const opening = '@media (hover: hover) {'
  let rest = withoutComments(css)
  for (let start = rest.indexOf(opening); start >= 0; start = rest.indexOf(opening)) {
    rest = rest.slice(0, start) + rest.slice(rest.indexOf('\n}', start) + 2)
  }
  return rest
}
/** The rules that style a button of the system: a selector with a `.button…` class, or the bare element. */
function buttonRules() {
  return allRules().filter(({ selectors }) => selectors.some((selector) => /\.button(?![\w-]*-row)|^button\b/.test(selector)))
}

describe('botones: variantes y estados', () => {
  it('el botón principal es el verde de la marca con su texto, sin sombra', () => {
    const primary = rule('.button-primary')

    expect(primary).toMatch(/background:\s*var\(--brand\)/)
    expect(primary).toMatch(/border-color:\s*var\(--brand\)/)
    expect(primary).toMatch(/(?<![\w-])color:\s*var\(--on-brand\)/)
    expect(primary).not.toMatch(/box-shadow/)
  })

  it('las variantes nuevas existen y los nombres viejos comparten su regla hasta que el marcado los deja', () => {
    const secondary = rule('.button-secondary, .button-outline, .button-quiet')
    const danger = rule('.button-danger, .button-danger-outline')

    expect(secondary).toMatch(/border-color:\s*var\(--border\)/)
    expect(secondary).toMatch(/background:\s*var\(--surface\)/)
    expect(secondary).toMatch(/(?<![\w-])color:\s*var\(--text\)/)
    expect(danger).toMatch(/border-color:\s*var\(--bad\)/)
    expect(danger).toMatch(/(?<![\w-])color:\s*var\(--bad\)/)
    expect(rule('.button-link')).toMatch(/text-decoration:\s*underline/)
    expect(rule('.button-link')).toMatch(/(?<![\w-])color:\s*var\(--brand\)/)
    expect(rule('.button-block, .button-wide')).toMatch(/width:\s*100%/)
    expect(rule('.button-large')).toMatch(/min-height:\s*var\(--target-large\)/)
    expect(rule('.button-clock')).toMatch(/min-height:\s*var\(--target-clock\)/)
    expect(rule('.button-clock')).toMatch(/font-size:\s*var\(--font-size-display\)/)
    // Two decisions of the same weight: side by side when each has 160 px, one under the other when not.
    expect(rule('.button-pair')).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*10rem\),\s*1fr\)\)/)
  })

  it('el texto de un botón usa el tamaño y los pesos de los tokens, y un enlace con forma de botón no va subrayado', () => {
    const base = rule('.button')

    expect(base).toMatch(/font-size:\s*var\(--font-size-body\)/)
    expect(base).toMatch(/font-weight:\s*var\(--font-weight-strong\)/)
    expect(base).toMatch(/line-height:\s*var\(--line-height-tight\)/)
    expect(base).toMatch(/border-radius:\s*var\(--radius\)/)
    expect(base).toMatch(/text-decoration:\s*none/)
  })

  // Changed in slice B3 (the lookup only): the rule of the chosen button is shared with the chosen option tile, so it is found
  // by the name it lists instead of by its whole selector list.
  it('un botón elegido (aria-pressed) se distingue por su borde de 2 px del verde de la marca, no solo por el fondo (1.4.1)', () => {
    const pressed = ruleListing('.button[aria-pressed="true"]').declarations

    expect(pressed).toMatch(/border-color:\s*var\(--brand\)/)
    // The second pixel of the edge is drawn inside, so the button does not change size when it is chosen.
    expect(pressed).toMatch(/box-shadow:\s*inset 0 0 0 var\(--border-width\) var\(--brand\)/)
    expect(pressed).toMatch(/background:\s*var\(--surface-selected\)/)
    // The old rule only reached the quick choices of «Cargar días» and told the chosen one by colour alone.
    expect(allRules().flatMap(({ selectors }) => selectors)).not.toContain('.choice-row .button[aria-pressed="true"]')
  })

  it('un botón deshabilitado se sigue leyendo: ninguna regla de botón usa opacidad y su texto, fondo y borde salen de los tokens', () => {
    const disabled = rule('.button:disabled')

    expect(buttonRules().filter(({ declarations }) => /(?<![\w-])opacity\s*:/.test(declarations)).map(({ selectors }) => selectors.join(', '))).toEqual([])
    // --text-muted on --surface-tint (7:1) and --border on --surface-tint (3:1) are two of the pairings checked above.
    expect(disabled).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(disabled).toMatch(/background:\s*var\(--surface-tint\)/)
    expect(disabled).toMatch(/border-color:\s*var\(--border\)/)
    expect(rule('button:disabled')).toMatch(/cursor:\s*not-allowed/)
  })

  it('ningún botón se mueve al apretarlo y el cambio al pasar el puntero solo existe donde hay puntero', () => {
    const hoverOnTouch = [...withoutHoverBlocks().matchAll(/([^{}]+)\{[^{}]*\}/g)]
      .flatMap((match) => match[1].split(',').map((selector) => selector.replace(/\s+/g, ' ').trim()))
      .filter((selector) => /\.button[\w-]*[^ ]*:hover/.test(selector))

    expect(buttonRules().filter(({ declarations }) => /(?<![\w-])transform\s*:/.test(declarations)).map(({ selectors }) => selectors.join(', '))).toEqual([])
    expect(rule('.button')).not.toMatch(/transition:[^;]*transform/)
    expect(hoverOnTouch).toEqual([])
  })

  // Replaced in slice N4: the button of the fixed alerts bar is gone. A destination of the bar is as tall as the bar (72 px)
  // and at least 80 px wide at 320 px; a row of the rail is as tall as any control.
  it('cada destino de la barra mide el alto de la barra y cada renglón de la columna el alto de toque (2.5.8)', () => {
    expect(rule('.nav-link')).toMatch(/min-height:\s*var\(--bottom-nav-height\)/)
    expect(rule('.nav-link', media(1024, 'min'))).toMatch(/min-height:\s*var\(--target\)/)
    expect(Number(/--bottom-nav-height:\s*([\d.]+)rem/.exec(rule(':root'))?.[1])).toBeGreaterThanOrEqual(3)
  })
})

// The text box of a field: what is typed in, the select and the textarea. A checkbox or a radio inside a field is not one.
const TEXT_BOX = '.field :is(input:not([type=checkbox], [type=radio]), select, textarea)'
const allSelectors = () => allRules().flatMap(({ selectors }) => selectors)
/** A selector of an option tile, by its new name or by one of the old ones that share its rules until the markup leaves them. */
const isTile = (selector: string) => /\.(?:choice|journey-option|employee-category-option|company-choice)(?![\w-])/.test(selector)

describe('campos, casillas y opciones: una sola forma', () => {
  it('el recuadro de texto es una sola regla y no alcanza a las casillas ni a los botones de opción', () => {
    const textBox = ruleListing(TEXT_BOX)

    expect(textBox.declarations).toMatch(/border-radius:\s*var\(--radius\)/)
    // Under 16 px iOS zooms the page when a field takes focus.
    expect(textBox.declarations).toMatch(/font-size:\s*var\(--font-size-body\)/)
    // The cells of the employees table while a row is edited and the company switcher of the top bar are text boxes outside a
    // field; they share the box until slices E6 and C1 make them fields. Their selector keeps out checkboxes the same way.
    expect(textBox.selectors).toEqual([TEXT_BOX, 'td input:where(:not([type=checkbox], [type=radio]))', '.company-switch'])
    // The rule that reached every input is gone, and with it the rules that undid it for one checkbox or radio at a time.
    for (const gone of ['.field input', 'td input', 'td input[type=checkbox]', '.auth-card .field input', '.block-fields input',
      '.site-location-confirmation input', '.employee-category-option input']) {
      expect(allSelectors(), gone).not.toContain(gone)
    }
  })

  it('un campo de una línea mide el alto de toque del sistema y un área de texto arranca con lugar para varias líneas', () => {
    expect(ruleListing('.field :is(input:not([type=checkbox], [type=radio]), select)').declarations).toMatch(/min-height:\s*var\(--target\)/)
    expect(rule('.field textarea')).toMatch(/min-height:\s*5\.5rem/)
    expect(rule('.field textarea')).toMatch(/resize:\s*vertical/)
  })

  it('la etiqueta y la ayuda de un campo miden 16 px y salen de los tokens; un grupo de campos no tiene recuadro', () => {
    const label = rule('.field-label')
    const hint = rule('.field-hint')
    const group = ruleListing('.field-group').declarations

    expect(rule('.field')).toMatch(/gap:\s*var\(--space-1\)/)
    expect(label).toMatch(/font-size:\s*var\(--font-size-body\)/)
    expect(label).toMatch(/font-weight:\s*var\(--font-weight-strong\)/)
    expect(label).toMatch(/(?<![\w-])color:\s*var\(--text\)/)
    expect(hint).toMatch(/font-size:\s*var\(--font-size-body\)/)
    expect(hint).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(ruleListing('.field-group').selectors).toEqual(['.field-group', 'fieldset.field', '.fieldset-plain'])
    expect(group).toMatch(/border:\s*0/)
    expect(group).toMatch(/padding:\s*0/)
  })

  it('un campo inválido se reconoce por su barra, su borde de 2 px y su texto, no solo por el rojo (1.4.1)', () => {
    const invalidBox = rule('.field :is(input:not([type=checkbox], [type=radio]), select, textarea)[aria-invalid="true"]')
    const error = ruleListing('.field-error')

    expect(rule('.field-invalid')).toMatch(/border-left:\s*var\(--bar-width\) solid var\(--bad\)/)
    expect(invalidBox).toMatch(/border-color:\s*var\(--bad\)/)
    // As on a chosen button, the second pixel is drawn inside: the field does not change size when it turns invalid.
    expect(invalidBox).toMatch(/box-shadow:\s*inset 0 0 0 var\(--border-width\) var\(--bad\)/)
    expect(error.declarations).toMatch(/(?<![\w-])color:\s*var\(--bad\)/)
    expect(error.declarations).toMatch(/font-weight:\s*var\(--font-weight-strong\)/)
    // One rule for the error text: the three old names share it until the markup leaves them.
    expect(error.selectors).toEqual(['.field-error', '.field-hint-error', '.employee-field-error', '.site-location-message-error'])
    expect(allSelectors().filter((selector) => selector === '.field-hint-error')).toHaveLength(1)
  })

  // The schedule editor passes its errors as the hint of the field (hintOrError), and its summary says «debajo de cada campo».
  // With the hint above the control those errors would jump over it; slice F2b gives them to the error prop and removes this.
  it('un error que todavía llega como ayuda sigue mostrándose debajo del control', () => {
    expect(rule('.field-hint:has(> .field-hint-error)')).toMatch(/order:\s*1/)
  })

  it('un campo deshabilitado se sigue leyendo: texto y fondo de los tokens, sin transparencia', () => {
    const disabled = ruleListing('.field :is(input:not([type=checkbox], [type=radio]), select, textarea):disabled').declarations

    expect(disabled).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(disabled).toMatch(/background:\s*var\(--surface-tint\)/)
    // Browsers fade a disabled field by themselves; the rule takes that back.
    expect(disabled).toMatch(/opacity:\s*1\s*(?:;|$)/)
  })

  it('una casilla o un botón de opción mide el piso de 24 px y su etiqueta entera es el área de toque (2.5.8)', () => {
    const box = rule('input[type=checkbox], input[type=radio]')
    const label = ruleListing('.check')
    const sized = allSelectors().filter((selector) => /\[type=["']?(?:checkbox|radio)/.test(selector.replace(/:(?:not|where)\([^()]*\)/g, '')))

    expect(box).toMatch(/width:\s*var\(--target-floor\)/)
    expect(box).toMatch(/height:\s*var\(--target-floor\)/)
    expect(box).toMatch(/accent-color:\s*var\(--brand\)/)
    // No other rule gives a checkbox or a radio a size, a padding or an edge.
    expect(sized).toEqual(['input[type=checkbox]', 'input[type=radio]'])
    expect(label.declarations).toMatch(/min-height:\s*var\(--target\)/)
    expect(label.declarations).toMatch(/min-width:\s*var\(--target\)/)
    expect(label.declarations).toMatch(/cursor:\s*pointer/)
    expect(label.selectors).toEqual(['.check', '.check-grid label', '.inline-checks label', '.site-location-confirmation', 'td > label'])
    expect(ruleListing('.check-list').selectors).toEqual(['.check-list', '.check-grid'])
  })

  it('una opción elegida se distingue igual que un botón elegido: comparten la regla del borde de la marca (1.4.1)', () => {
    const chosen = ruleListing('.button[aria-pressed="true"]')

    expect(chosen.selectors).toEqual([
      '.button[aria-pressed="true"]', '.choice[aria-pressed="true"]', '.choice:has(input:checked)',
      '.journey-option[aria-pressed="true"]', '.employee-category-option:has(input:checked)'
    ])
    expect(chosen.declarations).toMatch(/border-color:\s*var\(--brand\)/)
    expect(chosen.declarations).toMatch(/box-shadow:\s*inset 0 0 0 var\(--border-width\) var\(--brand\)/)
    expect(chosen.declarations).toMatch(/background:\s*var\(--surface-selected\)/)
    // The chosen shift was told apart by a class with a paler edge (2.27:1) and a fill of 1.08:1; aria-pressed says it now.
    expect(allSelectors().filter((selector) => selector.includes('.journey-option-active'))).toEqual([])
  })

  it('una opción es un control con el borde, las esquinas y el alto de los tokens', () => {
    const tile = ruleListing('.choice')

    expect(tile.selectors).toEqual(['.choice', '.journey-option', '.employee-category-option', '.company-choice'])
    expect(tile.declarations).toMatch(/border:\s*var\(--border-width\) solid var\(--border\)/)
    expect(tile.declarations).toMatch(/border-radius:\s*var\(--radius\)/)
    expect(tile.declarations).toMatch(/min-height:\s*var\(--target-large\)/)
    expect(tile.declarations).toMatch(/background:\s*var\(--surface\)/)
    expect(tile.declarations).toMatch(/(?<![\w-])color:\s*var\(--text\)/)
  })

  it('una opción deshabilitada se sigue leyendo, sin opacidad, y la elegida conserva su borde', () => {
    const disabled = ruleListing('.choice:disabled')
    const faded = allRules().filter(({ selectors, declarations }) => selectors.some(isTile) && /(?<![\w-])opacity\s*:/.test(declarations))

    expect(faded.map(({ selectors }) => selectors.join(', '))).toEqual([])
    expect(disabled.selectors).toEqual(['.choice:disabled', '.choice:has(input:disabled)', '.journey-option:disabled', '.company-choice:disabled'])
    expect(disabled.declarations).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(disabled.declarations).toMatch(/background:\s*var\(--surface-tint\)/)
    expect(disabled.declarations).toMatch(/border-color:\s*var\(--border\)/)
    for (const selector of ['.button[aria-pressed="true"]:disabled', '.choice[aria-pressed="true"]:disabled', '.journey-option[aria-pressed="true"]:disabled']) {
      expect(ruleListing(selector).declarations, selector).toMatch(/border-color:\s*var\(--brand\)/)
    }
  })

  it('las opciones van en una columna y en dos desde 600 px', () => {
    const list = '.choice-list, .journey-picker, .employee-category-list'

    expect(rule(list)).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(rule(list, media(600, 'min'))).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    // The one column is the base now: no narrow breakpoint has to bring it back.
    expect(media(520)).not.toMatch(/\.employee-category-list/)
  })

  // Slice N2 (D-20261111-02): the forms of a day open under the mark or the day they change, as one piece.
  it('un formulario que se abre en su lugar es una barra a la izquierda, plano, con el espacio de los tokens (4.7)', () => {
    const form = rule('.inline-form, .correction-form')

    expect(form).toMatch(/border-left:\s*var\(--bar-width\) solid var\(--border\)/)
    expect(form).toMatch(/padding-left:\s*var\(--space-4\)/)
    expect(form).toMatch(/(?<![\w-])gap:\s*var\(--space-4\)/)
    // Inside a wrapping row (a mark of the phone list) it takes a line of its own.
    expect(form).toMatch(/flex-basis:\s*100%/)
    expect(form).not.toMatch(/(?<![\w-])(?:background|box-shadow|border-radius|border-top)\s*:/)
    // The old name of the form of a missing mark is gone with its rule.
    expect(css).not.toMatch(/\.forgotten-mark-form/)
  })
})

/** The body of an `@media (<condition>) {` block that is not a width (forced colours, reduced motion). */
function mediaBlock(condition: string) {
  const opening = `@media (${condition}) {`
  const start = css.indexOf(opening)
  if (start < 0) throw new Error(`No media query for ${condition}`)
  return css.slice(start + opening.length, css.indexOf('\n}', start))
}
/** The rules whose selector list names one of the classes as a whole word (`.message`, and not `.message-body`). */
function rulesNaming(...classes: string[]) {
  const pattern = new RegExp(`\\.(?:${classes.join('|')})(?![\\w-])`)
  return allRules().filter(({ selectors }) => selectors.some((selector) => pattern.test(selector)))
}
const selectorsOf = (rules: { selectors: string[] }[]) => rules.map(({ selectors }) => selectors.join(', '))

describe('mensajes, etiquetas de estado, secciones, plegables, vacío y carga', () => {
  it('un mensaje es una barra a la izquierda sobre su fondo, con el texto en el color de siempre y sin sombra (1.4.1)', () => {
    const message = rule('.message')

    expect(message).toMatch(/border-left:\s*var\(--bar-width\) solid/)
    expect(message).toMatch(/(?<![\w-])color:\s*var\(--text\)/)
    expect(message).toMatch(/font-size:\s*var\(--font-size-body\)/)
    expect(message).not.toMatch(/border-radius/)
    expect(selectorsOf(rulesNaming('message').filter(({ declarations }) => /box-shadow/.test(declarations)))).toEqual([])
  })

  it('cada tipo de mensaje tiene su barra, su fondo y el ícono del color de su barra', () => {
    const kinds = [['info', 'border', 'surface-tint'], ['success', 'ok', 'ok-surface'], ['warning', 'warn', 'warn-surface'], ['error', 'bad', 'bad-surface']]

    for (const [kind, bar, fill] of kinds) {
      const declarations = rule(`.message-${kind}`)
      expect(declarations, kind).toMatch(new RegExp(`border-left-color:\\s*var\\(--${bar}\\)`))
      expect(declarations, kind).toMatch(new RegExp(`background:\\s*var\\(--${fill}\\)`))
      // The words keep the colour of the text: the most contrast for the sentence the person most needs to read.
      expect(declarations, kind).not.toMatch(/(?<![\w-])color:/)
      expect(rule(`.message-${kind} > .icon`), kind).toMatch(new RegExp(`(?<![\\w-])color:\\s*var\\(--${bar}\\)`))
    }
  })

  it('una etiqueta de estado tiene borde y esquinas de 4 px, letra de 14 px en negrita y nunca parece un botón', () => {
    const tag = rule('.status-chip')

    expect(tag).toMatch(/display:\s*inline-flex/)
    expect(tag).toMatch(/border:\s*var\(--border-width\) solid var\(--border\)/)
    expect(tag).toMatch(/border-radius:\s*var\(--radius-tag\)/)
    expect(tag).toMatch(/font-size:\s*var\(--font-size-meta\)/)
    expect(tag).toMatch(/font-weight:\s*var\(--font-weight-heavy\)/)
    expect(tag).toMatch(/white-space:\s*nowrap/)
    expect(rule('.status-chip .icon')).toMatch(/width:\s*1\.15em/)
    expect(selectorsOf(rulesNaming('status-chip').filter(({ declarations }) => /cursor:\s*pointer|box-shadow/.test(declarations)))).toEqual([])
    // A forced solid border would turn the dashed edge of «waiting for someone else» solid; forced colours keep borders anyway.
    expect(mediaBlock('forced-colors: active')).not.toMatch(/\.status-chip/)
  })

  it('las clases viejas de estado toman las cinco tonalidades por reglas compartidas: ámbar te espera a vos, gris punteado espera a otro', () => {
    const tone = (name: string) => ruleListing(`.status-${name}`)

    expect(tone('neutral').selectors).toEqual(['.status-neutral', '.status-no_ingreso', '.status-en_curso', '.status-pausa_abierta', '.status-egresada', '.status-cancelada'])
    expect(tone('wait').selectors).toEqual(['.status-wait', '.status-motivo_pendiente', '.status-inactivo', '.employee-frame .status-pendiente_revision'])
    expect(tone('todo').selectors).toEqual(['.status-todo', '.status-pendiente_revision', '.employee-frame .status-motivo_pendiente', '.first-step .status-motivo_pendiente'])
    expect(tone('ok').selectors).toEqual(['.status-ok', '.status-justificado'])
    expect(tone('bad').selectors).toEqual(['.status-bad', '.status-no_justificado'])
    const colours = { neutral: ['text', 'surface', 'border'], wait: ['text-muted', 'surface', 'border'], todo: ['warn', 'warn-surface', 'warn'], ok: ['ok', 'ok-surface', 'ok'], bad: ['bad', 'bad-surface', 'bad'] }
    for (const [name, [text, fill, edge]] of Object.entries(colours)) {
      const declarations = tone(name).declarations
      expect(declarations, name).toMatch(new RegExp(`(?<![\\w-])color:\\s*var\\(--${text}\\)`))
      expect(declarations, name).toMatch(new RegExp(`background:\\s*var\\(--${fill}\\)`))
      expect(declarations, name).toMatch(new RegExp(`border-color:\\s*var\\(--${edge}\\)`))
      // Every tone names its edge style, so a tone that depends on the screen (the employee's) wins over the shared one whole.
      expect(declarations, name).toMatch(name === 'wait' ? /border-style:\s*dashed/ : /border-style:\s*solid/)
    }
    // No old state class keeps a rule of its own with colours written by hand.
    const shared = new Set(['neutral', 'wait', 'todo', 'ok', 'bad'].flatMap((name) => tone(name).selectors))
    expect(allSelectors().filter((selector) => /\.status-(?!chip)[\w-]+/.test(selector) && !shared.has(selector))).toEqual([])
  })

  it('una sección es plana: su título lleva una raya de tinta debajo y no hay recuadro, fondo ni sombra', () => {
    const panel = rule('.panel')
    const heading = rule('.panel-heading')

    expect(panel).toMatch(/margin:\s*var\(--space-6\) 0 0/)
    expect(panel).not.toMatch(/(?<![\w-])(?:border|background|box-shadow|padding|border-radius)\s*:/)
    expect(heading).toMatch(/border-bottom:\s*var\(--border-width-strong\) solid var\(--text\)/)
    expect(heading).toMatch(/padding-bottom:\s*var\(--space-2\)/)
    // No narrower screen gives it a padding or a box back.
    expect(selectorsOf(allRules().filter(({ selectors, declarations }) => selectors.includes('.panel') && /padding|border|box-shadow|background/.test(declarations)))).toEqual([])
  })

  it('un plegable es un control: tiene borde, el alto de toque y una flecha dibujada sin caracteres', () => {
    const fold = rule('.fold')
    const summary = rule('.fold > summary')

    expect(fold).toMatch(/border:\s*var\(--border-width\) solid var\(--border\)/)
    expect(fold).toMatch(/border-radius:\s*var\(--radius\)/)
    expect(summary).toMatch(/min-height:\s*var\(--target\)/)
    expect(summary).toMatch(/font-weight:\s*var\(--font-weight-strong\)/)
    expect(summary).toMatch(/list-style:\s*none/)
    expect(rule('.fold > summary::-webkit-details-marker')).toMatch(/display:\s*none/)
    expect(rule('.fold > summary::after')).toMatch(/border-right:\s*var\(--border-width-strong\) solid currentColor/)
    // The arrow was a glyph with alternative text; no rule draws a triangle character any more.
    expect(withoutComments(css)).not.toMatch(/content:\s*"[▸▾]/)
  })

  it('vacío y cargando son texto alineado a la izquierda, sin recuadro; el círculo de carga es del verde de la marca', () => {
    const empty = rule('.empty-state')
    const loading = rule('.loading')
    const spinner = rule('.spinner')

    expect(empty).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(empty).toMatch(/text-align:\s*left/)
    expect(empty).not.toMatch(/(?<![\w-])(?:border|background)\s*:/)
    expect(loading).toMatch(/justify-content:\s*flex-start/)
    expect(loading).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(spinner).toMatch(/border:\s*3px solid var\(--rule\)/)
    expect(spinner).toMatch(/border-top-color:\s*var\(--brand\)/)
    expect(spinner).toMatch(/animation:\s*spin \.9s linear infinite/)
  })

  it('el error de un campo pone su triángulo en la primera línea del texto', () => {
    expect(rule('.field-error')).toMatch(/display:\s*flex/)
    expect(rule('.field-error')).toMatch(/align-items:\s*flex-start/)
    expect(rule('.field-error > .icon')).toMatch(/margin-top:\s*\.125em/)
  })
})

// The records of a list (days, marks, people, locals, schedules, results of a search) keep their old class names until each
// screen slice renames them to record-*; what they look like is decided here.
const HAIRLINE = /border-bottom:\s*var\(--border-width\) solid var\(--rule\)/
const RECORD_CLASSES = ['history-list', 'history-card', 'history-head', 'history-items', 'simple-list', 'simple-row', 'template-list', 'template-card']

describe('listas de registros y tablas: filas separadas por una línea, nunca tarjetas', () => {
  it('cada registro es una fila con una línea fina debajo, sin recuadro, esquinas, fondo ni sombra (principio 3)', () => {
    for (const record of ['.history-card', '.template-card', '.simple-row', '.simple-list > article']) {
      expect(rule(record), record).toMatch(HAIRLINE)
      expect(rule(record), record).toMatch(/padding:\s*var\(--space-3\) 0/)
    }
    // No rule of a record or of its list draws a box, at any width.
    const boxed = rulesNaming(...RECORD_CLASSES).filter(({ declarations }) => /(?<![\w-])(?:border|border-top|border-left|border-right|background|box-shadow|border-radius)\s*:/.test(declarations))
    expect(selectorsOf(boxed)).toEqual([])
  })

  it('las filas van una debajo de la otra sin hueco: las separa su línea, no el espacio entre tarjetas', () => {
    for (const list of ['.history-list', '.simple-list', '.template-list']) expect(ruleListing(list).declarations, list).not.toMatch(/(?<![\w-])gap\s*:/)
    // The inbox and the motives of the employee are their own slices (E1, D3): they keep their space for now.
    expect(rule('.deviation-list, .motive-list')).toMatch(/gap:\s*10px/)
  })

  it('una lista de marcas o de cambios suelta separa sus filas con la línea; dentro de un registro sus renglones van sin línea', () => {
    const item = rule('.history-items li')
    // Only the record's own lists: a day opened inside its record keeps its marks as a list on its own (slice N2).
    const inside = rule('.history-card > .history-items li')

    expect(item).toMatch(HAIRLINE)
    expect(item).toMatch(/padding:\s*var\(--space-3\) 0/)
    expect(inside).toMatch(/border-bottom:\s*0/)
    // A detail line reads in the muted colour; the name of the mark stays in the text colour.
    expect(rule('.history-card > .history-items')).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(rule('.history-card > .history-items strong')).toMatch(/(?<![\w-])color:\s*var\(--text\)/)
  })

  it('el nombre de un registro va en negrita y sus datos en 16 px del color secundario', () => {
    expect(rule('.history-head > strong:first-child')).toMatch(/font-size:\s*var\(--font-size-body-lg\)/)
    expect(rule('.history-head > strong:first-child')).toMatch(/font-weight:\s*var\(--font-weight-heavy\)/)
    for (const detail of ['.history-items small', '.simple-row small', '.template-card small']) {
      expect(rule(detail), detail).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
      expect(rule(detail), detail).toMatch(/font-size:\s*var\(--font-size-body\)/)
    }
    expect(rule('.simple-row strong')).not.toMatch(/font-size/)
    // A record has no avatar: the glyph of a local was decoration (aria-hidden) with a tinted box.
    expect(rule('.simple-list > article .row-avatar')).toMatch(/display:\s*none/)
  })

  it('una tabla es una planilla: títulos de 14 px en negrita sin mayúsculas, raya de borde debajo y celdas con línea fina', () => {
    const head = rule('th')
    const cell = rule('td')

    expect(rule('table')).toMatch(/font-size:\s*var\(--font-size-body\)/)
    expect(head).toMatch(/font-size:\s*var\(--font-size-meta\)/)
    expect(head).toMatch(/font-weight:\s*var\(--font-weight-heavy\)/)
    expect(head).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(head).toMatch(/border-bottom:\s*var\(--border-width\) solid var\(--border\)/)
    expect(head).not.toMatch(/text-transform|letter-spacing/)
    for (const declarations of [head, cell]) expect(declarations).toMatch(/padding:\s*var\(--space-2\) var\(--space-3\) var\(--space-2\) 0/)
    expect(cell).toMatch(HAIRLINE)
    expect(cell).toMatch(/(?<![\w-])color:\s*var\(--text\)/)
    // The identifier of the row is the first column, in bold; a row that spans the table (an open panel) is not one.
    expect(rule('td:first-child:not([colspan])')).toMatch(/font-weight:\s*var\(--font-weight-heavy\)/)
    // A table that does not fit scrolls inside its own box, never the page.
    expect(rule('.table-scroll')).toMatch(/overflow-x:\s*auto/)
  })
})

// Slice D1 (design system 4.9 and 4.13): the employee's "now" block and the confirmation of a mark are the only two boxed blocks
// of content in the product (principle 3); a border there says "this is your day" and "this was saved".
describe('pantalla del empleado: el bloque de ahora y la confirmación de una marca', () => {
  it('el bloque de ahora tiene el borde de 2 px del verde de la marca y las esquinas de bloque, sin fondo ni sombra', () => {
    const now = rule('.now')

    expect(now).toMatch(/display:\s*grid/)
    expect(now).toMatch(/border:\s*var\(--border-width-strong\) solid var\(--brand\)/)
    expect(now).toMatch(/border-radius:\s*var\(--radius-block\)/)
    expect(now).not.toMatch(/box-shadow|background/)
  })

  it('el estado del día es el texto más grande de la pantalla y el saludo queda chico', () => {
    const state = rule('.now-state')
    const greeting = rule('.employee-heading h1')

    expect(state).toMatch(/font-size:\s*var\(--font-size-display\)/)
    expect(state).toMatch(/font-weight:\s*var\(--font-weight-heavy\)/)
    expect(greeting).toMatch(/font-size:\s*var\(--font-size-body-lg\)/)
    expect(greeting).toMatch(/font-weight:\s*var\(--font-weight-regular\)/)
    expect(greeting).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
  })

  it('las otras marcas miden 56 px y la salida va aparte, después de una línea fina', () => {
    expect(rule('.button-large')).toMatch(/min-height:\s*var\(--target-large\)/)
    expect(rule('.now-apart')).toMatch(/border-top:\s*var\(--border-width\) solid var\(--rule\)/)
  })

  it('la confirmación es un bloque verde de 2 px con su tilde, y la ubicación que no llegó es una advertencia dentro de él', () => {
    const receipt = rule('.receipt')
    const icon = rule('.receipt-icon')
    const missing = rule('.receipt-location-missing')

    expect(receipt).toMatch(/border:\s*var\(--border-width-strong\) solid var\(--ok\)/)
    expect(receipt).toMatch(/background:\s*var\(--ok-surface\)/)
    expect(receipt).toMatch(/border-radius:\s*var\(--radius-block\)/)
    expect(contrast(colorOf(icon, 'color'), colorOf(icon, 'background'))).toBeGreaterThanOrEqual(3)
    expect(rule('.receipt-location-sent')).toMatch(/(?<![\w-])color:\s*var\(--ok\)/)
    // The block stays green because the mark was saved; only this line warns, in the text colour, with the amber triangle.
    expect(missing).toMatch(/border-top:\s*var\(--border-width\) solid var\(--ok\)/)
    expect(missing).toMatch(/(?<![\w-])color:\s*var\(--text\)/)
    expect(rule('.receipt-location-missing > .icon')).toMatch(/(?<![\w-])color:\s*var\(--warn\)/)
  })

  // Slice D2 (design system 4.14): the marks of the day are a sheet of four fixed rows, not a timeline.
  it('la planilla del día: nombre de la fila en 600, hora grande con cifras de ancho fijo y la nota al lado desde 600 px', () => {
    const header = rule('.day-sheet th')
    const time = rule('.day-sheet-time')
    const voided = rule('.day-sheet-voided .day-sheet-time')
    const note = rule('.day-sheet-note')

    expect(rule('.day-sheet')).toMatch(/border-bottom:\s*var\(--border-width\) solid var\(--rule\)/)
    // A hairline above each row, the last one closed by the table's own line.
    for (const cell of ['.day-sheet th', '.day-sheet td']) expect(ruleListing(cell).declarations, cell).toMatch(/border-top:\s*var\(--border-width\) solid var\(--rule\)/)
    expect(/(?<![\w-])width:\s*([^;]+)/.exec(header)?.[1].trim()).toBe('32%')
    expect(header).toMatch(/font-weight:\s*var\(--font-weight-strong\)/)
    expect(header).toMatch(/(?<![\w-])color:\s*var\(--text\)/)
    expect(time).toMatch(/font-size:\s*var\(--font-size-title\)/)
    expect(time).toMatch(/font-weight:\s*var\(--font-weight-heavy\)/)
    expect(time).toMatch(/font-variant-numeric:\s*tabular-nums/)
    expect(note).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(note).toMatch(/font-size:\s*var\(--font-size-body\)/)
    // A voided mark: its time struck in 16 px of the muted colour, never as large as one that counts.
    expect(voided).toMatch(/font-size:\s*var\(--font-size-body\)/)
    expect(voided).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    // Under the time on a phone, beside it from 600 px.
    expect(/flex-direction:\s*([^;]+)/.exec(rule('.day-sheet-cell'))?.[1].trim()).toBe('column')
    expect(/flex-direction:\s*([^;]+)/.exec(rule('.day-sheet-cell', media(600, 'min')))?.[1].trim()).toBe('row')
  })

  it('las reglas de la línea de tiempo de las marcas se fueron con su marcado', () => {
    const gone = /\.(?:mark-timeline|mark-row|mark-row-location|mark-row-voided|timeline-point|timeline-title|employee-title)(?![\w-])/

    expect(allSelectors().filter((selector) => gone.test(selector))).toEqual([])
  })

  it('las reglas del panel Marcar y del horario que había en las marcas del día se fueron con su marcado', () => {
    const gone = /\.(?:schedule-summary|schedule-icon|employee-day-state|employee-next-action|employee-more-actions|employee-exit|employee-sending|employee-step-text|employee-confirmation|employee-location-note|mark-actions)(?![\w-])/

    expect(allSelectors().filter((selector) => gone.test(selector))).toEqual([])
  })
})
