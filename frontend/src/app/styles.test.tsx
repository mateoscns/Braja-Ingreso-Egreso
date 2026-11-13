import { describe, expect, it } from 'vitest'
import { appSourcePaths, readSource } from './testing/sourceFiles'

// Vitest turns every CSS import (?raw included) into an empty string, so the stylesheet is read from disk.
const css = readSource('styles.css')

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
/** Every `@media (min-width: <width>px)` block joined: the browser applies all of them, not only the first. Slice G1: the sheet is
    mobile first, so a width is always a minimum (the one `max-width: 359px` block is read with mediaBlock). */
function media(width: 600 | 768 | 1024) {
  const opening = `@media (min-width: ${width}px) {`
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
    const wide = media(1024)
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

  // Issue #173 (2026-11-12, Mateo on a real iPhone): choosing «Córdoba, Santa Fe, Entre Ríos, Corrientes, Misiones, Chaco,
  // Formosa y Santiago del Estero» in «Hora del local» shrank the whole page in Safari. WebKit does not let a select shrink below
  // its option, and a «1fr» column (minmax(auto, 1fr)) grows with its widest content: the page got wider than the screen.
  it('ninguna columna de grilla crece con su contenido y una lista desplegable no pasa el ancho de su campo', () => {
    const bareFr = allRules().filter(({ declarations }) => {
      const columns = /grid-template-columns:\s*([^;]+)/.exec(declarations)?.[1] ?? ''
      return /(?:^|[\s,(])\d*\.?\d+fr/.test(columns.replace(/minmax\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ''))
    })
    expect(selectorsOf(bareFr)).toEqual([])
    expect(rule('.field select')).toMatch(/max-width:\s*100%/)
    expect(rule('.field select')).toMatch(/text-overflow:\s*ellipsis/)
  })

  // Issue #171 (2026-11-12): over 1600 px the workspace was centred with a white margin on each side while the top bar spans the
  // whole width, so the rail floated away from the left edge. The rail stays at the edge; only the content keeps a width cap.
  it('en una pantalla ancha el menú queda pegado al borde izquierdo y solo el contenido tiene ancho máximo', () => {
    const wide = media(1024)
    expect(selectorsOf(rulesNaming('workspace').filter(({ declarations }) => /max-width|margin/.test(declarations)))).toEqual([])
    expect(rule('.main-content', wide)).toMatch(/max-width:\s*calc\(1600px - var\(--rail-width\)\)/)
  })

  // Rewritten in slice C1: the bar is a grid of three named areas (the brand and «Cerrar sesión» on the dark row, the company
  // and the person under it on phones, all three in one row from 1024 px). It has no fixed height, so a larger text or a long
  // company name makes it taller instead of cutting it, and it scrolls away with the page: no rule makes it sticky or fixed.
  it('la barra de arriba es una grilla de marca, contexto y salida, sin alto fijo y sin quedar pegada arriba', () => {
    const areas = (declarations: string) => /grid-template-areas:\s*([^;]+)/.exec(declarations)?.[1] ?? ''
    const phone = rule('.topbar')
    const wide = rule('.topbar', media(1024))
    const positioned = rulesNaming('topbar').filter(({ declarations }) => /(?<![\w-])position\s*:\s*(?:sticky|fixed)/.test(declarations))

    expect(phone).toMatch(/display:\s*grid/)
    expect(areas(phone).replace(/\s+/g, ' ')).toBe('"brand out" "context context"')
    expect(areas(wide).replace(/\s+/g, ' ')).toBe('"brand context out"')
    // Issue #177: the markup is in the order of the phone's rows (brand, «Cerrar sesión», context); on the one row from 1024 px,
    // where the context is in the middle, Tab follows the row as it is seen where the browser knows reading-flow (Chrome).
    expect(phone).not.toMatch(/reading-flow/)
    expect(wide).toMatch(/reading-flow:\s*grid-rows\s*(?:;|$)/)
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

  // Recheck of T12 (2026-11-12): in the flow, the session warning was out of sight for an ADMIN scrolled down a long list, so
  // WCAG 2.2.1 held only for screen readers. It is the one exception to N-8: it sticks to the top while it shows, and the page
  // keeps the focused control clear of it (2.4.11).
  it('el aviso de sesión por vencer queda pegado arriba al desplazar la página, sin tapar el foco', () => {
    expect(rule('.session-warning')).toMatch(/(?<![\w-])position:\s*sticky/)
    expect(rule('.session-warning')).toMatch(/(?<![\w-])top:\s*0/)
    expect(rule('html:has(.session-warning:not(:empty))')).toMatch(/scroll-padding-top:/)
  })

  // Replaced in slice D4: the card went, and with it ".auth-card > .muted", which on 2026-11-09 beat the margin of the help
  // line and left it glued under «Ingresar». The line has a rule of its own now and keeps the space above it.
  it('la ayuda "¿Te olvidaste la contraseña?" queda separada del botón Ingresar', () => {
    expect(/margin-top:\s*([^;]+)/.exec(rule('.auth-hint'))?.[1].trim()).toBe('var(--space-5)')
    expect(allSelectors().filter((selector) => selector.includes('.auth-card'))).toEqual([])
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
  // each one keeps the whole row (2026-11-09: one extra action took half the row). The second half was replaced in slice E5: a
  // schedule is a record, and the actions of a record wrap under it at every width, with no breakpoint of their own.
  it('las marcas del empleado van en una sola columna y los botones de un registro bajan solos cuando no entran', () => {
    expect(rule('.now-actions')).toMatch(/display:\s*grid/)
    expect(rule('.now-actions')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    // No breakpoint splits them into columns again.
    const columns = allRules().filter(({ selectors }) => selectors.some((selector) => selector.includes('.now-actions')))
      .flatMap(({ declarations }) => [...declarations.matchAll(/grid-template-columns:\s*([^;]+)/g)].map((match) => match[1].trim()))
    expect(columns).toEqual(['minmax(0, 1fr)'])
    expect(rule('.record-actions')).toMatch(/flex-wrap:\s*wrap/)
    expect(selectorsOf(rulesNaming('record-actions', 'template-card').filter(({ declarations }) => /flex-wrap/.test(declarations))))
      .toEqual(['.record-actions'])
  })

  // Replaced in slice N4 (WCAG 2.4.11): the content ends above the bar and the scroll to a focused control leaves the bar clear,
  // both counting the phone's bottom safe area, which the bar also keeps below its items. Where the bar is in the page (the rail,
  // a phone lying down) nothing is reserved.
  it('deja lugar para que la barra de navegación no tape el contenido ni el foco (2.4.11)', () => {
    const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()
    // The room is the bar's real height measured by AdminNav (it takes two rows with a large system text), else its one-row height.
    const reserve = /^calc\(var\(--bottom-nav-room\) \+ var/

    expect(value(rule(':root'), '--bottom-nav-room')).toBe('calc(var(--bottom-nav-height) + env(safe-area-inset-bottom))')
    expect(value(rule('.main-content'), 'padding-bottom')).toMatch(reserve)
    expect(value(rule('html:has(.nav)'), 'scroll-padding-bottom')).toMatch(reserve)
    expect(value(rule('.nav'), 'padding-bottom')).toBe('env(safe-area-inset-bottom)')
    for (const block of [media(1024), mediaBlock('max-height: 480px')]) {
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

// The token block is the top of the stylesheet, down to TOKENS_END. Slice H1 removed the legacy names that sat at its end.
const TOKENS_END = '/* end of tokens */'
function markerIndex(marker: string) {
  const index = css.indexOf(marker)
  if (index < 0) throw new Error(`No "${marker}" in the stylesheet`)
  return index
}
// Comments name issues ("#102") and colours in prose; only declarations count.
const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '')
/** Every rule under the token block: there a value has to come from a token. */
const belowTokens = () => withoutComments(css.slice(markerIndex(TOKENS_END)))
/** A colour of the design tokens. Anything declared further down is left out on purpose. */
function designToken(name: string) {
  const block = css.slice(0, markerIndex(TOKENS_END))
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

// Ceilings that only went down. Each one counted what the rules under the token block still wrote by hand, measured with the
// pattern of its own test when the token block came in (2026-11-11). Slice H1 turned the four into equalities: colours, font
// sizes and old names are zero, and the box-shadows are the two rules of the system that draw the inner second pixel of an edge.
// Lowered in slice N4 (the old menu, the fixed alerts bar and their room went): 42 → 30, 29 → 20, 6 → 4, 48 → 31.
// Lowered in slice E2 (the coordinates of a mark take the tokens): font sizes 20 → 19, old names 31 → 30.
// Lowered in slice D3 (the motive cards and their question went): colours 30 → 29, font sizes 19 → 18, old names 30 → 29.
// Lowered in slice E1 (the cards of the inbox and the box of its filters went): colours 29 → 16, font sizes 18 → 16, shadows
// 4 → 3, old names 29 → 28.
// Lowered in slice D4 (the card of the sign-in screens, its eyebrow and the glyph boxes of the companies went): colours 16 → 11,
// font sizes 16 → 10, shadows 3 → 2, old names 28 → 22.
// Lowered in slice E3 (the box of the preview of a load went): colours 11 → 10, old names 22 → 21.
// Lowered in slice E6 (the provisional password takes the tokens and the detail of a person its scroll margin): font sizes
// 10 → 9, old names 21 → 19.
// Lowered in slice E4 (the boxes of the location and of the map went, the map frame and its zoom buttons take the tokens and its
// height no longer reads --topbar-height, which is deleted): colours 10 → 6, font sizes 9 → 7, old names 19 → 7.
// Lowered in slice E5 (the schedule cards, their chips, the boxed tramos, the small subhead and the fold of «Horarios» went):
// colours 6 → 2, font sizes 7 → 1, old names 7 → 2.
// Lowered in slice E7 (the tinted box of the number of a setup step went): colours 2 → 0.
// Slice H1: the last untokened font size (.small-copy, .88rem) takes --font-size-meta (14 px, the nearest size of the scale), and
// the last two uses of an old name (.muted read --muted, which was --text-secondary, #53645a) take --text-muted (#47524b), the
// token the design system folds --muted and --text-secondary into (design system 2.1).

// The old names (design system 2.1, "Migration rule for names"): all gone from the stylesheet, and none may come back.
const LEGACY_TOKENS = ['--text-primary', '--text-secondary', '--text-tertiary', '--page', '--focus', '--topbar-height',
  '--alerts-bar-clearance', '--tap-target', '--radius-control', '--radius-panel', '--green', '--green-2', '--green-3', '--muted',
  '--line', '--red', '--shadow']

describe('tokens de diseño: el bloque de arriba y nada escrito a mano fuera de él', () => {
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

  it('ningún color fuera del bloque de tokens: no queda ninguno escrito a mano', () => {
    // Hex, rgb()/rgba()/hsl() and the two keywords a rule would use for a surface or a text; transparent, currentColor and
    // the system colours of forced-colors are not values a token replaces.
    const literals = belowTokens().match(/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgb|hsl)a?\(|(?<![\w-])(?:white|black)(?![\w-])/gi) ?? []

    expect(literals).toEqual([])
  })

  it('los tamaños de letra salen de los tokens: no queda ningún font-size sin token', () => {
    const sizes = [...belowTokens().matchAll(/(?<![\w-])font-size\s*:\s*([^;}]+)/g)].map((match) => match[1].trim())
    const untokened = sizes.filter((size) => !/^var\(--font-size-[\w-]+\)$/.test(size))

    expect(untokened).toEqual([])
  })

  // Design system 2.3: a chosen or an invalid control gets an edge of 2 px without moving its layout, a border of 1 px plus an
  // inner box-shadow of 1 px of the same colour. That is the only box-shadow of the system; elevation does not exist.
  it('las únicas sombras son el segundo píxel interno del borde de lo elegido y de un campo inválido', () => {
    const shadows = allRules().filter(({ declarations }) => /(?<![\w-])box-shadow\s*:/.test(declarations))

    expect(shadows.map(({ selectors }) => selectors.join(', '))).toEqual([
      `${TEXT_BOX}[aria-invalid="true"]`,
      '.button[aria-pressed="true"], .choice[aria-pressed="true"], .choice:has(input:checked)'
    ])
    for (const { declarations } of shadows) {
      const edge = /border-color:\s*(var\(--[\w-]+\))/.exec(declarations)?.[1]
      expect(/box-shadow:\s*([^;]+)/.exec(declarations)?.[1].trim()).toBe(`inset 0 0 0 var(--border-width) ${edge}`)
    }
  })

  it('no queda ningún token viejo y toda variable que se usa está declarada', () => {
    const source = withoutComments(css)
    const declared = new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]))
    const used = new Set([...source.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]))

    expect(LEGACY_TOKENS.filter((name) => declared.has(name) || used.has(name))).toEqual([])
    expect([...used].filter((name) => !declared.has(name))).toEqual([])
    expect(css).not.toMatch(/legacy tokens/i)
  })

  it('el esquema claro se declara en el bloque de tokens y ninguna otra regla lo cambia', () => {
    const declarations = [...withoutComments(css).matchAll(/(?<![\w-])color-scheme\s*:\s*([^;}]+)/g)].map((match) => match[1].trim())

    expect(withoutComments(css.slice(0, markerIndex(TOKENS_END)))).toMatch(/(?<![\w-])color-scheme:\s*light\s*;/)
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
    const wide = media(1024)

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

  // Replaced in slice D4: the owner removed the line in capitals above the titles (2026-11-11: "Sacarlas todas"); the last three,
  // on the sign-in screens, went with this slice and their rule with them.
  it('no queda el renglón chico arriba de los títulos', () => {
    expect(selectorsOf(rulesNaming('eyebrow'))).toEqual([])
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

  // Changed in slice H1: the markup left the old names (.button-outline, .button-quiet, .button-danger-outline, .button-wide), so
  // each variant has its rule alone and no selector names an old one.
  it('las variantes del sistema existen y los nombres viejos de botón se fueron', () => {
    const secondary = rule('.button-secondary')
    const danger = rule('.button-danger')

    expect(secondary).toMatch(/border-color:\s*var\(--border\)/)
    expect(secondary).toMatch(/background:\s*var\(--surface\)/)
    expect(secondary).toMatch(/(?<![\w-])color:\s*var\(--text\)/)
    expect(danger).toMatch(/border-color:\s*var\(--bad\)/)
    expect(danger).toMatch(/(?<![\w-])color:\s*var\(--bad\)/)
    expect(rule('.button-link')).toMatch(/text-decoration:\s*underline/)
    expect(rule('.button-link')).toMatch(/(?<![\w-])color:\s*var\(--brand\)/)
    expect(rule('.button-block')).toMatch(/width:\s*100%/)
    expect(allSelectors().filter((selector) => /\.button-(?:outline|quiet|small|wide|danger-outline)(?![\w-])/.test(selector))).toEqual([])
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
    // A row's floor stops at 72 px, so with a large text it grows with its words, not with a scaled floor (device check).
    expect(rule('.nav-link')).toMatch(/min-height:\s*min\(var\(--bottom-nav-height\), 72px\)/)
    expect(rule('.nav-link', media(1024))).toMatch(/min-height:\s*var\(--target\)/)
    expect(Number(/--bottom-nav-height:\s*([\d.]+)rem/.exec(rule(':root'))?.[1])).toBeGreaterThanOrEqual(3)
  })

  // Device check before release (2026-11-12): with the system text at 170 % or more, the bar was wider than a 360 px screen and
  // the brand ran over «Cerrar sesión» (WCAG 1.4.4, 1.4.10). The destinations wrap to a second row instead, and the brand to a
  // second line; nothing is cut and no label shrinks.
  it('con texto grande la barra pasa a dos filas y la marca a dos renglones, sin cortar nada', () => {
    expect(rule('.nav-list')).toMatch(/flex-wrap:\s*wrap/)
    expect(rule('.nav-list > li')).toMatch(/min-width:\s*min-content/)
    expect(rule('.topbar > .brand')).toMatch(/flex-wrap:\s*wrap/)
    expect(rule('.topbar > .brand')).toMatch(/min-width:\s*0/)
  })
})

// The text box of a field: what is typed in, the select and the textarea. A checkbox or a radio inside a field is not one.
const TEXT_BOX = '.field :is(input:not([type=checkbox], [type=radio]), select, textarea)'
const allSelectors = () => allRules().flatMap(({ selectors }) => selectors)
/** A selector of an option tile. */
const isTile = (selector: string) => /\.choice(?![\w-])/.test(selector)

describe('campos, casillas y opciones: una sola forma', () => {
  it('el recuadro de texto es una sola regla y no alcanza a las casillas ni a los botones de opción', () => {
    const textBox = ruleListing(TEXT_BOX)

    expect(textBox.declarations).toMatch(/border-radius:\s*var\(--radius\)/)
    // Under 16 px iOS zooms the page when a field takes focus.
    expect(textBox.declarations).toMatch(/font-size:\s*var\(--font-size-body\)/)
    // The company switcher of the top bar is a text box outside a field and shares the box. Slice E6: the cells of the employees
    // table left the rule, since a person is edited in a form under the record.
    expect(textBox.selectors).toEqual([TEXT_BOX, '.company-switch'])
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
    // Slice H1: the form of a missing mark is a .field-group, so the old name .fieldset-plain left the rule.
    expect(ruleListing('.field-group').selectors).toEqual(['.field-group', 'fieldset.field'])
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
    // One rule for the error text. Slice E4: the error of a location capture is a message of the system, so its old name left
    // the rule. Slice F2b: the schedule editor and the employee's motive write their errors as FormField does, so the last two
    // old names left too.
    expect(error.selectors).toEqual(['.field-error'])
    expect(css).not.toMatch(/\.field-hint-error|\.employee-field-error/)
  })

  // Slice F2b: a group written as a field (a fieldset) loses the padding and border of the browser, which also took away the
  // bar of an invalid field; an invalid group gets it back.
  it('un grupo de controles inválido tiene la misma barra que un campo inválido', () => {
    const invalidGroup = rule('fieldset.field-invalid')

    expect(invalidGroup).toMatch(/border-left:\s*var\(--bar-width\) solid var\(--bad\)/)
    expect(invalidGroup).toMatch(/padding-left:\s*var\(--space-3\)/)
    // It comes after the rule that clears the fieldset, so it wins at the same specificity.
    expect(css.indexOf('fieldset.field-invalid {')).toBeGreaterThan(css.indexOf('.field-group, fieldset.field {'))
  })

  // The two times of a tramo align at their foot, so a hint over one of them does not lift it; an error goes under the control,
  // so a tramo with an error aligns at the top (it shows no hints then).
  it('las dos horas de un tramo quedan a la misma altura con o sin error', () => {
    expect(rule('.tramo-fields')).toMatch(/align-items:\s*end/)
    expect(rule('.tramo-fields:has(.field-error)')).toMatch(/align-items:\s*start/)
  })

  // Issue #177 (2026-11-12, Enrique on «Dar de alta un empleado» at desktop width: «Los labels o input tienen que estar a la misma
  // altura»): «Minutos de tolerancia», with a hint of one line, and «Contraseña provisoria», with two lines and then «Generar
  // contraseña», put their boxes at different heights. From 600 px every child of a two-column form takes the same five rows
  // (label, hint, control, error, what follows) and a field is a subgrid of them, so the parts of a row line up whatever the hint.
  it('en un formulario de dos columnas las etiquetas, las ayudas y los recuadros de una fila van a la misma altura', () => {
    const wide = media(600)
    const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()
    const field = ':is(.form-grid, .form-grid > .form-stack) > div.field'
    const grid = rule('.form-grid', wide)
    const child = rule('.form-grid > *', wide)
    const stack = rule('.form-grid > .form-stack:has(> div.field)', wide)

    expect(value(grid, 'grid-template-columns')).toBe('repeat(2, minmax(0, 1fr))')
    // The rows have no gap, so an empty one (a row of fields without hints, without errors) takes no room at all.
    expect(value(grid, 'row-gap')).toBe('0')
    expect(value(child, 'grid-row')).toBe('span 5')
    // The 16 px between the rows of the form is the margin of each child, except the ones of the first row. A group written as a
    // fieldset clears its margins with fieldset.field, so both rules weigh more than that one (a group lost its 16 px).
    expect(value(rule('.form-grid > :is(*, fieldset.field)', wide), 'margin-top')).toBe('var(--space-4)')
    expect(value(rule('.form-grid > :first-child:is(*, fieldset.field), .form-grid > :first-child:not(.field-wide) + :not(.field-wide)', wide), 'margin-top')).toBe('0')
    expect(css.indexOf('.form-grid > :is(*, fieldset.field)')).toBeGreaterThan(css.indexOf('.field-group, fieldset.field {'))
    // A field written with FormField shares the rows; its column never grows with a select's longest option (issue #173).
    for (const declarations of [rule(field, wide), stack]) {
      expect(value(declarations, 'display')).toBe('grid')
      expect(value(declarations, 'grid-template-rows')).toBe('subgrid')
      expect(value(declarations, 'grid-template-columns')).toBe('minmax(0, 1fr)')
      expect(value(declarations, 'row-gap')).toBe('0')
    }
    // Each part in its row, at the top of it (a taller neighbour never stretches a box), 4 px under the part above it.
    expect(value(rule(`${field} > *`, wide), 'grid-row')).toBe('3')
    expect(value(rule(`${field} > *`, wide), 'align-self')).toBe('start')
    expect(value(rule(`${field} > *`, wide), 'margin-top')).toBe('var(--space-1)')
    expect(value(rule(`${field} > .field-label`, wide), 'grid-row')).toBe('1')
    expect(value(rule(`${field} > .field-label`, wide), 'margin-top')).toBe('0')
    expect(value(rule(`${field} > .field-hint`, wide), 'grid-row')).toBe('2')
    expect(value(rule(`${field} > .field-error`, wide), 'grid-row')).toBe('4')
    // A field with something of its own under it («Generar contraseña»): the field takes four rows and the rest the fifth; a stack
    // without a field stays a stack, or its parts would all fall in the fifth row.
    expect(value(rule('.form-grid > .form-stack > div.field', wide), 'grid-row')).toBe('1 / span 4')
    expect(value(rule('.form-grid > .form-stack:has(> div.field) > :not(div.field)', wide), 'grid-row')).toBe('5')
    expect(value(rule('.form-grid > .form-stack:has(> div.field) > :not(div.field)', wide), 'margin-top')).toBe('var(--space-4)')
    // One column, under 600 px, is the flex column of a field as it was.
    expect(value(rule('.field'), 'display')).toBe('flex')
    expect(value(rule('.form-grid'), 'gap')).toBe('var(--space-4)')
    // The alignment at the foot of two forms was the first try at this; the rows replace it.
    expect(css).not.toMatch(/\.form-grid\.(?:work-days-form|employee-edit-form)/)
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
    // Slice E6: the checks of the employees table (.inline-checks, the bare «Activo» in a cell) are .check now.
    // Slice E4: the confirmation of a local's point is a .check too.
    // Slice E5: the people of «Horarios» are .check in a .check-list, so the old names left the rules.
    expect(label.selectors).toEqual(['.check'])
    expect(ruleListing('.check-list').selectors).toEqual(['.check-list'])
  })

  it('una opción elegida se distingue igual que un botón elegido: comparten la regla del borde de la marca (1.4.1)', () => {
    const chosen = ruleListing('.button[aria-pressed="true"]')

    expect(chosen.selectors).toEqual([
      '.button[aria-pressed="true"]', '.choice[aria-pressed="true"]', '.choice:has(input:checked)'
    ])
    expect(chosen.declarations).toMatch(/border-color:\s*var\(--brand\)/)
    expect(chosen.declarations).toMatch(/box-shadow:\s*inset 0 0 0 var\(--border-width\) var\(--brand\)/)
    expect(chosen.declarations).toMatch(/background:\s*var\(--surface-selected\)/)
    // The chosen shift was told apart by a class with a paler edge (2.27:1) and a fill of 1.08:1; aria-pressed says it now.
    // Slice H1: the shift picker is a list of .choice tiles, so the old names left every rule.
    expect(allSelectors().filter((selector) => /\.journey-(?:option|picker)/.test(selector))).toEqual([])
  })

  it('una opción es un control con el borde, las esquinas y el alto de los tokens', () => {
    const tile = ruleListing('.choice')

    // Slice D3: the kinds of motive are .choice tiles, so their old name left the rule; slice D4: so are the companies; slice H1:
    // so are the shifts of a day.
    expect(tile.selectors).toEqual(['.choice'])
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
    expect(disabled.selectors).toEqual(['.choice:disabled', '.choice:has(input:disabled)'])
    expect(disabled.declarations).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(disabled.declarations).toMatch(/background:\s*var\(--surface-tint\)/)
    expect(disabled.declarations).toMatch(/border-color:\s*var\(--border\)/)
    for (const selector of ['.button[aria-pressed="true"]:disabled', '.choice[aria-pressed="true"]:disabled']) {
      expect(ruleListing(selector).declarations, selector).toMatch(/border-color:\s*var\(--brand\)/)
    }
  })

  it('las opciones van en una columna y en dos desde 600 px', () => {
    const list = '.choice-list'

    expect(rule(list)).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(rule(list, media(600))).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
    // The one column is the base now: no narrow breakpoint has to bring it back. Slice G1: the 520 px block this read is gone,
    // and the only narrow block left is the one of 359 px.
    expect(mediaBlock('max-width: 359px')).not.toMatch(/\.(?:choice-list|employee-category-list)/)
  })

  // Slice N2 (D-20261111-02): the forms of a day open under the mark or the day they change, as one piece.
  it('un formulario que se abre en su lugar es una barra a la izquierda, plano, con el espacio de los tokens (4.7)', () => {
    // Slice E1: the inbox's old name of the form (.correction-form) left the rule with its markup.
    const form = rule('.inline-form')

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
    // Slice D3: the employee's tags are StatusTag with the employee's tone, so the two rules of his screen went. Slice H1: no
    // state of a day or of a case is INACTIVO, so .status-inactivo went.
    expect(tone('wait').selectors).toEqual(['.status-wait', '.status-motivo_pendiente'])
    // Slice E7: the steps of «Primeros pasos» are StatusTag, so the rule that turned their borrowed class amber went.
    expect(tone('todo').selectors).toEqual(['.status-todo', '.status-pendiente_revision'])
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

  // Issue #177 (2026-11-12, Enrique on «Hoy»: «Demasiado espacio entre el texto y el label»): «No hay días cargados para esta
  // fecha.» stood 24 px under the box of «Fecha», its own 8 px over the 16 px of the date's row. The text after a field goes 16 px
  // under it, as in a form (.form-stack); the line of a load takes the same place, so nothing moves when the answer comes.
  it('el texto de vacío o de carga debajo de la fecha de «Hoy» queda a la distancia de un campo al texto que sigue', () => {
    expect(rule('.toolbar')).toMatch(/margin:\s*0 0 var\(--space-4\)/)
    expect(rule('.toolbar + .empty-state, .toolbar + .loading')).toMatch(/padding-top:\s*0\s*(?:;|$)/)
    expect(rule('.empty-state')).toMatch(/padding:\s*var\(--space-2\) 0/)
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
// Slice E5: a schedule is a .record, so template-list and template-card left the list with their rules. Slice E7: the steps of
// «Primeros pasos» and the parts of «Configuración» are records, so simple-list and simple-row went too.
const RECORD_CLASSES = ['history-list', 'history-card', 'history-head', 'history-items']

describe('listas de registros y tablas: filas separadas por una línea, nunca tarjetas', () => {
  it('cada registro es una fila con una línea fina debajo, sin recuadro, esquinas, fondo ni sombra (principio 3)', () => {
    // Slice E4: a local is a .record, so '.simple-list > article' left the list with its rule.
    for (const record of ['.history-card']) {
      expect(rule(record), record).toMatch(HAIRLINE)
      expect(rule(record), record).toMatch(/padding:\s*var\(--space-3\) 0/)
    }
    // No rule of a record or of its list draws a box, at any width.
    const boxed = rulesNaming(...RECORD_CLASSES).filter(({ declarations }) => /(?<![\w-])(?:border|border-top|border-left|border-right|background|box-shadow|border-radius)\s*:/.test(declarations))
    expect(selectorsOf(boxed)).toEqual([])
  })

  it('las filas van una debajo de la otra sin hueco: las separa su línea, no el espacio entre tarjetas', () => {
    for (const list of ['.history-list']) expect(ruleListing(list).declarations, list).not.toMatch(/(?<![\w-])gap\s*:/)
    // Slice E1: the cases of the inbox are rows too, with no space between them. The employee's motives are records since D3.
    expect(rule('.case-list')).not.toMatch(/(?<![\w-])gap\s*:/)
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
    for (const detail of ['.history-items small']) {
      expect(rule(detail), detail).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
      expect(rule(detail), detail).toMatch(/font-size:\s*var\(--font-size-body\)/)
    }
    // A record has no avatar: the glyph of a local was decoration (aria-hidden) with a tinted box. Slice E4: the local is a
    // .record without one, so the rule that hid it is gone with the other rules of the old local row.
    expect(allSelectors().filter((selector) => selector.startsWith('.simple-list > article'))).toEqual([])
  })

  // Slice E2 (design system 4.12): «Hoy» is the first screen on the record-* names. A row: a title line (the identifier, then its
  // tag), detail lines in the muted colour at the working size, and its buttons; a voided mark reads muted besides struck.
  it('un registro de la lista nueva es una fila con su línea fina, su título, sus datos en 16 px secundarios y sus botones', () => {
    const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()
    const record = rule('.record')
    const meta = rule('.record-meta')

    expect(record).toMatch(HAIRLINE)
    expect(record).toMatch(/padding:\s*var\(--space-3\) 0/)
    expect(record).toMatch(/overflow-wrap:\s*anywhere/)
    expect(rule('.record-list')).toMatch(/list-style:\s*none/)
    expect(rule('.record-list')).not.toMatch(/(?<![\w-])gap\s*:/)
    expect(rule('.record-title > strong:first-child')).toMatch(/font-size:\s*var\(--font-size-body-lg\)/)
    expect(rule('.record-title > strong:first-child')).toMatch(/font-weight:\s*var\(--font-weight-heavy\)/)
    expect(meta).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
    expect(meta).toMatch(/font-size:\s*var\(--font-size-body\)/)
    expect(rule('.record-actions')).toMatch(/flex-wrap:\s*wrap/)
    expect(value(ruleListing('.record-voided').declarations, 'color')).toBe('var(--text-muted)')
    // The coordinates of a mark: the muted colour at the working size, with figures of one width.
    expect(value(rule('.mark-coordinates'), 'color')).toBe('var(--text-muted)')
    expect(rule('.mark-coordinates')).toMatch(/font-variant-numeric:\s*tabular-nums/)
    expect(rule('.mark-coordinates')).not.toMatch(/font-size/)
  })

  it('el día abierto y su lista de cambios se separan con espacio y una línea fina, sin recuadro; la fecha no se corre hacia afuera', () => {
    const changes = rule('.day-changes')

    expect(changes).toMatch(/border-top:\s*var\(--border-width\) solid var\(--rule\)/)
    expect(rule('.subsection-head')).toMatch(/flex-wrap:\s*wrap/)
    expect(rule('.subsection-head > h3')).toMatch(/margin:\s*0/)
    expect(selectorsOf(rulesNaming('record', 'record-list', 'record-title', 'record-meta', 'record-actions', 'day-changes', 'subsection-head')
      .filter(({ declarations }) => /(?<![\w-])(?:background|box-shadow|border-radius|border-left|border-right)\s*:/.test(declarations)))).toEqual([])
    // The date field sat 8 px over the line of its section title and pushed to the right edge.
    expect(/margin:\s*([^;]+)/.exec(rule('.toolbar'))?.[1].trim()).toBe('0 0 var(--space-4)')
    expect(rule('.toolbar')).not.toMatch(/flex-end/)
    // The marks of a day and the results of their forms are records now: the rule N2 kept for them in the old list is gone.
    expect(allSelectors()).not.toContain('.history-items li > .message')
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
    expect(/flex-direction:\s*([^;]+)/.exec(rule('.day-sheet-cell', media(600)))?.[1].trim()).toBe('row')
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

// Slice D3 (design system 4.5 and 4.7): «Para explicar» is a list of records; a motive still to write is an inline form with the
// amber bar of a task that waits for the person reading, and the kinds of motive are the option tiles of the system.
describe('pantalla del empleado: Para explicar', () => {
  it('un motivo por escribir lleva la barra ámbar del formulario en su lugar y ocupa todo su renglón', () => {
    expect(rule('.inline-form-todo')).toMatch(/border-left-color:\s*var\(--warn\)/)
    expect(rule('.record > .inline-form:first-child')).toMatch(/margin-top:\s*0/)
    // What was sent hangs from a hairline, not from a tinted box.
    const said = rule('.motive-said')
    expect(said).toMatch(/border-left:\s*var\(--border-width-strong\) solid var\(--rule\)/)
    expect(said).not.toMatch(/background|border-radius/)
  })

  it('el título y la ayuda de una opción van uno debajo del otro, la ayuda en el color apagado', () => {
    expect(rule('.choice-text')).toMatch(/display:\s*grid/)
    expect(rule('.choice small')).toMatch(/(?<![\w-])color:\s*var\(--text-muted\)/)
  })

  it('las tarjetas de motivos, sus opciones propias y su pregunta se fueron con su marcado', () => {
    const gone = /\.(?:motive-card|motive-list|employee-motive-question|employee-category-option|employee-category-list)(?![\w-])/

    expect(allSelectors().filter((selector) => gone.test(selector))).toEqual([])
  })
})

// Slice E1 (design system 4.2 and 4.11): «Para revisar» is a list of cases, each a row with a state bar on its left edge and a
// hairline under it, never a card; the decision pair stacks on a narrow row and sits side by side when it has room.
describe('«Para revisar»: los casos y el par de decisiones', () => {
  const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()
  /** The body of the `@container (<condition>) {` block. */
  function containerBlock(condition: string) {
    const opening = `@container (${condition}) {`
    const start = css.indexOf(opening)
    if (start < 0) throw new Error(`No container query for ${condition}`)
    return css.slice(start + opening.length, css.indexOf('\n}', start))
  }

  it('un caso es una fila con su barra de estado a la izquierda y una línea fina debajo, sin recuadro ni sombra', () => {
    const row = rule('.case')

    expect(value(rule('.case-list'), 'list-style')).toBe('none')
    expect(rule('.case-list')).not.toMatch(/(?<![\w-])gap\s*:/)
    expect(value(row, 'border-left')).toBe('var(--state-bar-width) solid var(--border)')
    expect(row).toMatch(HAIRLINE)
    expect(row).toMatch(/overflow-wrap:\s*anywhere/)
    expect(selectorsOf(rulesNaming('case', 'case-list', 'case-head', 'case-person', 'case-title', 'case-actions')
      .filter(({ declarations }) => /(?<![\w-])(?:box-shadow|border-radius)\s*:/.test(declarations)))).toEqual([])
  })

  it('la barra dice de quién es el turno: punteada mientras la persona no explicó, ámbar a revisar, verde o roja ya decidido', () => {
    expect(value(rule('.case-wait'), 'border-left-style')).toBe('dotted')
    expect(value(rule('.case-todo'), 'border-left-color')).toBe('var(--warn)')
    expect(value(rule('.case-ok'), 'border-left-color')).toBe('var(--ok)')
    expect(value(rule('.case-bad'), 'border-left-color')).toBe('var(--bad)')
    // Opened from a notification: the fill of what is selected, not a glow.
    expect(value(rule('.case-target'), 'background')).toBe('var(--surface-selected)')
  })

  it('la persona es el texto más fuerte de la fila y el motivo cuelga de una línea fina', () => {
    expect(value(rule('.case-person'), 'font-size')).toBe('var(--font-size-body-lg)')
    expect(value(rule('.case-person'), 'font-weight')).toBe('var(--font-weight-heavy)')
    expect(value(ruleListing('.motive-said').declarations, 'border-left')).toBe('var(--border-width-strong) solid var(--rule)')
  })

  it('el par se apila en una fila angosta, va lado a lado con lugar y en una pantalla ancha las decisiones van a la derecha del caso', () => {
    // Two buttons of at least 10 rem each: side by side from a row of about 332 px, one under the other below that.
    expect(rule('.button-pair')).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*10rem\),\s*1fr\)\)/)
    expect(value(rule('.case-actions'), 'max-width')).toBe('28rem')
    expect(value(rule('.case-list'), 'container-type')).toBe('inline-size')
    expect(value(rule('.case', containerBlock('min-width: 56rem')), 'grid-template-columns')).toBe('minmax(0, 1fr) minmax(0, 24rem)')
  })

  it('los filtros son una franja plana: sin recuadro, esquinas ni fondo', () => {
    expect(rule('.filter-bar')).not.toMatch(/(?<![\w-])(?:border|border-radius|background|box-shadow)\s*:/)
    expect(value(rule('.filter-bar'), 'gap')).toBe('var(--space-3)')
  })

  it('las reglas de las tarjetas de la bandeja se fueron con su marcado', () => {
    const gone = /\.(?:deviation-list|deviation-card|deviation-target|deviation-symbol|deviation-main|deviation-title|deviation-actions|reason-line|load-more|correction-form|filter-actions)(?![\w-])/

    expect(allSelectors().filter((selector) => gone.test(selector))).toEqual([])
  })
})

// Slice D4: the sign-in, password change and company screens sit under the top bar with the brand only, in one column on the
// white page. No card (principle 1): the title, its lead and the form read top to bottom, and the companies are option tiles.
describe('pantallas de acceso: la barra de la marca y una columna en la página blanca', () => {
  const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()
  const AUTH_CLASSES = ['auth-page', 'auth-lead', 'auth-hint', 'auth-footnote', 'company-list']

  it('la columna es plana: ninguna regla de estas pantallas dibuja recuadro, fondo, esquinas ni sombra', () => {
    const boxed = rulesNaming(...AUTH_CLASSES).filter(({ declarations }) => /(?<![\w-])(?:border|border-radius|background|box-shadow)\s*:/.test(declarations))

    expect(rulesNaming('auth-page').length).toBeGreaterThan(0)
    expect(selectorsOf(boxed)).toEqual([])
    // As wide as a field needs to be read and typed in, never wider than the screen minus its gutters.
    expect(value(rule('.auth-page'), 'width')).toBe('min(100% - 2 * var(--gutter), 26rem)')
  })

  it('el texto de estas pantallas usa los colores, los tamaños y los espacios de los tokens', () => {
    const written = rulesNaming(...AUTH_CLASSES).flatMap(({ selectors, declarations }) => [...declarations.matchAll(/([\w-]+)\s*:\s*([^;]+)/g)]
      .filter(([, property]) => /^(?:color|font-size|margin|margin-[\w-]+|padding|padding-[\w-]+|gap)$/.test(property))
      .map(([, property, written]) => ({ where: `${selectors.join(', ')} ${property}`, written: written.trim() })))
      // What is left once the tokens are taken out is a zero or nothing; a number written by hand would remain.
      .filter(({ written }) => /\d/.test(written.replace(/var\(--[\w-]+\)/g, '').replace(/(?<![\w.])0(?![\w.])/g, '')))

    expect(written).toEqual([])
    expect(value(rule('.auth-lead'), 'color')).toBe('var(--text-muted)')
    expect(value(rule('.auth-footnote'), 'color')).toBe('var(--text-muted)')
  })

  it('cada empresa es una opción del sistema en una lista sin viñetas, una debajo de la otra', () => {
    expect(value(rule('.company-list'), 'list-style')).toBe('none')
    expect(value(rule('.company-list'), 'display')).toBe('grid')
    expect(value(rule('.company-list'), 'gap')).toBe('var(--space-2)')
    // The tile is a button that takes the row; its name and role take what is left, so the arrow sits at the end.
    expect(value(rule('.company-list .choice'), 'width')).toBe('100%')
    expect(value(rule('.company-list .choice-text'), 'flex')).toBe('1 1 auto')
  })

  it('un botón de enlace dentro de un formulario apilado conserva el ancho de sus palabras y, después de un campo, se le acerca', () => {
    expect(value(rule('.form-stack > .button-link'), 'align-self')).toBe('flex-start')
    // 12 px up from the gap of 16 px: «Mostrar contraseña» reads with the field it shows, and its target stays clear of the box.
    expect(value(rule('.form-stack > .field + .button-link'), 'margin-top')).toBe('calc(-1 * var(--space-3))')
    expect(value(rule('.form-stack'), 'gap')).toBe('var(--space-4)')
    // A toggle link is drawn chosen when on (fill and edge of 2 px): it keeps a chip's room in both states.
    expect(value(rule('.button-link[aria-pressed]'), 'padding')).toBe('0 var(--space-3)')
  })

  it('la tarjeta, la marca propia de estas pantallas y la letra y la flecha de cada empresa se fueron con su marcado', () => {
    const gone = /\.(?:auth-card|auth-brand|company-choice|choice-icon|choice-arrow|password-toggle)(?![\w-])/

    expect(allSelectors().filter((selector) => gone.test(selector))).toEqual([])
  })
})

// Slice E3: «Días de trabajo» is built with the pieces of the system. The preview, the result and the notice of days loaded are
// messages; the days a load skipped are records inside its message; the forms space their messages with their own gap.
describe('«Días de trabajo»: la carga del mes con las piezas del sistema', () => {
  const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()

  it('los renglones de un mensaje van sin margen propio y la última fila de una lista dentro de un mensaje no lleva línea', () => {
    expect(value(rule('.message-body > p'), 'margin')).toBe('0')
    expect(value(rule('.message .record:last-child'), 'border-bottom')).toBe('0')
  })

  it('un mensaje dentro de los formularios de «Días de trabajo» lo separa el espacio del formulario, no un margen más', () => {
    expect(value(rule('.work-days-form .message'), 'margin')).toBe('0')
    expect(value(rule('.form-stack'), 'gap')).toBe('var(--space-4)')
  })

  it('las reglas propias de la vista previa, de lo omitido y del aviso se fueron con su marcado', () => {
    const gone = /\.(?:work-days-preview|work-days-skip|work-days-skips|coverage-notice|choice-row)(?![\w-])/

    expect(allSelectors().filter((selector) => gone.test(selector))).toEqual([])
    // A row of a list inside a message is a record now: nothing draws the old row there.
    expect(allSelectors()).not.toContain('.message .simple-row:last-child')
  })
})

// Slice E6: «Equipo» is built with the pieces of the system. A person is edited in a form under the record, the result of a form
// is a message inside it, and the password shown once is a result read aloud to the person, in the monospace face.
describe('«Equipo»: la lista de personas con las piezas del sistema', () => {
  const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()

  it('la contraseña provisoria va en la letra monoespaciada, grande para leerla en voz alta y sin espaciado propio', () => {
    const code = rule('.issued-password-code')

    expect(value(code, 'font-family')).toBe('var(--font-mono)')
    expect(value(code, 'font-size')).toBe('var(--font-size-title)')
    expect(value(rule('.issued-password-code', media(600)), 'font-size')).toBe('var(--font-size-display)')
    expect(value(code, 'font-weight')).toBe('var(--font-weight-heavy)')
    expect(code).not.toMatch(/letter-spacing/)
    // A result: the bar and the fill of a success message, no box.
    const block = rule('.issued-password')
    expect(value(block, 'border-left')).toBe('var(--bar-width) solid var(--ok)')
    expect(value(block, 'background')).toBe('var(--ok-surface)')
    expect(block).not.toMatch(/(?<![\w-])(?:border|border-radius|box-shadow)\s*:/)
  })

  it('un mensaje dentro de un formulario lo separa el espacio del formulario, no un margen más', () => {
    expect(value(rule('.inline-form > .message'), 'margin')).toBe('0')
    expect(value(rule('.form-result > .message'), 'margin')).toBe('0')
    expect(value(rule('.form-result'), 'gap')).toBe('var(--space-4)')
    // The rule of the inbox for the same thing is the general one now.
    expect(allSelectors()).not.toContain('.case .inline-form > .message')
  })

  it('las reglas de la tabla editable, del detalle de una persona y de las casillas sueltas se fueron con su marcado', () => {
    const gone = /\.(?:employee-detail|inline-checks|short-input|site-selection-checks)(?![\w-])|^td (?:> label|input)|^td:first-child input/

    expect(allSelectors().filter((selector) => gone.test(selector))).toEqual([])
  })
})

// Slice E4 (design system 4.20): «Locales» is built with the pieces of the system. The map is a frame in the flow of its form,
// as tall as a phone allows with the search above it and «Confirmar ubicación» under it; nothing about a top bar decides it, since
// the top bar scrolls away with the page (slice C1) and only the bottom bar stays.
describe('«Locales»: la lista, el formulario de ubicación y el marco del mapa', () => {
  const value = (declarations: string, property: string) => [...declarations.matchAll(new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`, 'g'))].map((match) => match[1].trim())

  it('el mapa mide una parte del alto de la pantalla entre un mínimo y un máximo, y más desde 768 px, sin contar la barra de arriba', () => {
    const canvas = rule('.site-map-canvas')

    // The vh value is the fallback of a browser without dvh; the last one wins where dvh is known.
    expect(value(canvas, 'height')).toEqual(['clamp(12.5rem, 45vh, 22.5rem)', 'clamp(12.5rem, 45dvh, 22.5rem)'])
    expect(value(rule('.site-map-canvas', media(768)), 'height')).toEqual(['clamp(16rem, 50vh, 27.5rem)', 'clamp(16rem, 50dvh, 27.5rem)'])
    expect(value(canvas, 'border')).toEqual(['var(--border-width) solid var(--border)'])
    expect(value(canvas, 'border-radius')).toEqual(['var(--radius)'])
    expect(css).not.toMatch(/--topbar-height/)
    // The zoom buttons of the map are as tall and wide as any control.
    expect(value(rule('.site-map-canvas.leaflet-container .leaflet-bar a'), 'height')).toEqual(['var(--target)'])
  })

  it('el panel del mapa y el punto elegido van planos en el flujo del formulario, sin recuadro ni fondo', () => {
    for (const part of ['.site-map-panel', '.site-location-selection']) {
      expect(rule(part), part).not.toMatch(/(?<![\w-])(?:background|border|border-radius|box-shadow)\s*:/)
    }
    const coordinates = rule('.site-location-coordinates')
    expect(value(coordinates, 'color')).toEqual(['var(--text)'])
    expect(coordinates).toMatch(/font-variant-numeric:\s*tabular-nums/)
    expect(coordinates).not.toMatch(/font-size/)
    // The history opened under a local: its title is spaced by the gap, and its last change leaves the line to the record.
    expect(value(rule('.inline-form > h3'), 'margin')).toEqual(['0'])
    expect(value(rule('.inline-form > .record-list:last-child > .record:last-child'), 'border-bottom')).toEqual(['0'])
  })

  it('las reglas propias de la fila de un local, de sus acciones, de su mensaje y de su casilla se fueron con su marcado', () => {
    const gone = /\.(?:site-location-field|site-location-actions|site-location-message|site-location-message-\w+|site-location-confirmation|audit-history|audit-items)(?![\w-])/

    expect(allSelectors().filter((selector) => gone.test(selector))).toEqual([])
    // No narrow breakpoint resizes the map: the base rule is the phone's. Slice G1: the 760 px block this read is gone, and the
    // only narrow block left is the one of 359 px.
    expect(mediaBlock('max-width: 359px')).not.toMatch(/site-map/)
  })
})

// Slice E5: «Horarios» is built with the pieces of the system. A schedule is a record whose parts are text, not chips; the form
// groups each tramo under its legend, with a hairline between tramos and its two times side by side at every width.
describe('«Horarios»: los horarios, sus tramos y su resumen con las piezas del sistema', () => {
  const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()

  it('el resumen de un horario es texto: las horas en el color del texto y las pausas apagadas, sin recuadros', () => {
    const parts = rule('.schedule-parts')
    const time = rule('.schedule-time')

    expect(value(parts, 'list-style')).toBe('none')
    expect(value(parts, 'color')).toBe('var(--text-muted)')
    expect(value(parts, 'flex-wrap')).toBe('wrap')
    expect(value(time, 'color')).toBe('var(--text)')
    expect(value(time, 'font-weight')).toBe('var(--font-weight-strong)')
    expect(time).toMatch(/font-variant-numeric:\s*tabular-nums/)
    expect(selectorsOf(rulesNaming('schedule-parts', 'schedule-time')
      .filter(({ declarations }) => /(?<![\w-])(?:border|border-radius|background|box-shadow)\s*:/.test(declarations)))).toEqual([])
  })

  it('cada tramo va separado del anterior por una línea fina y sus dos horas van lado a lado en todo ancho', () => {
    expect(value(rule('.tramo + .tramo'), 'border-top')).toBe('var(--border-width) solid var(--rule)')
    expect(value(rule('.tramo-fields'), 'grid-template-columns')).toBe('repeat(2, minmax(0, 1fr))')
    // The boxes of the two times stay level when one of them has a hint above it («Sale al día siguiente»).
    expect(value(rule('.tramo-fields'), 'align-items')).toBe('end')
    expect(selectorsOf(allRules().filter(({ selectors, declarations }) => selectors.some((selector) => selector.includes('.tramo-fields'))
      && /grid-template-columns/.test(declarations)))).toEqual(['.tramo-fields'])
  })

  it('el paso de asignar personas separa sus partes con el espacio del sistema, en la sección como debajo del horario', () => {
    expect(value(rule('.schedule-step'), 'gap')).toBe('var(--space-4)')
    expect(value(rule('.schedule-step > .message'), 'margin')).toBe('0')
    expect(value(rule('.inline-form > .message'), 'margin')).toBe('0')
    // The legend of a tramo is an ordinary line under the hairline, not a gap cut into it.
    expect(value(rule('.tramo > legend'), 'float')).toBe('left')
  })

  it('las reglas propias de las tarjetas, los tramos, las fichas y las casillas viejas de «Horarios» se fueron con su marcado', () => {
    const gone = /\.(?:template-list|template-card|template-card-open|template-card-slot|template-title|form-subhead|block-editor|block-fields|block-fields-tramo|remove-block|schedule-chips|schedule-block|check-grid|site-location-manual|site-location-coordinate-inputs)(?![\w-])/

    expect(allSelectors().filter((selector) => gone.test(selector))).toEqual([])
    // Its only rule was the coordinate fields of the fold: the breakpoint went with it.
    expect(css).not.toMatch(/@media \(max-width: 640px\)/)
  })
})

// Slice E7 (design system 4.19): «Primeros pasos» is a list of records. Each step has its number in a box of ink, its title and
// what is missing; its tag and «Ir» go under the text on a phone and beside it from 600 px. The next step has the amber bar of a
// task that waits for the person reading; a done step has a green check in its box.
describe('«Primeros pasos»: los pasos con las piezas del sistema', () => {
  const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()
  const areas = (declarations: string) => value(declarations, 'grid-template-areas')?.replace(/\s+/g, ' ')

  it('el número va en un recuadro de tinta de 40 px; el de un paso listo es la marca verde', () => {
    const number = rule('.step-number')

    expect(value(number, 'border')).toBe('var(--border-width-strong) solid var(--text)')
    expect(value(number, 'border-radius')).toBe('var(--radius)')
    expect(value(number, 'font-weight')).toBe('var(--font-weight-heavy)')
    expect(value(number, 'width')).toBe('2.5rem')
    expect(value(number, 'height')).toBe('2.5rem')
    expect(value(rule('.step-done .step-number'), 'color')).toBe('var(--ok)')
  })

  it('el próximo paso tiene la barra ámbar de lo que te espera y lo que falta va en ámbar y en negrita', () => {
    expect(value(rule('.step-next'), 'border-left')).toBe('var(--bar-width) solid var(--warn)')
    expect(value(rule('.step-detail'), 'color')).toBe('var(--warn)')
    expect(value(rule('.step-detail'), 'font-weight')).toBe('var(--font-weight-strong)')
  })

  it('la etiqueta y «Ir» van debajo del texto en el teléfono y a su lado desde 600 px, y un paso no es una tarjeta', () => {
    expect(areas(rule('.step'))).toBe('"number body" ". foot"')
    expect(areas(rule('.step', media(600)))).toBe('"number body foot"')
    expect(rule('.step-foot')).toMatch(/flex-wrap:\s*wrap/)
    // The row is a record: its hairline and padding come from .record; no rule of a step adds a fill, corners or a shadow.
    expect(selectorsOf(rulesNaming('step', 'step-body', 'step-foot', 'step-next', 'step-done')
      .filter(({ declarations }) => /(?<![\w-])(?:background|border-radius|box-shadow)\s*:/.test(declarations)))).toEqual([])
  })

  it('las reglas de las filas viejas, del cuadro del número y de la etiqueta prestada se fueron con su marcado', () => {
    const gone = /\.(?:simple-list|simple-row|row-avatar|first-steps|first-step|first-step-copy)(?![\w-])/

    expect(allSelectors().filter((selector) => gone.test(selector))).toEqual([])
  })
})

// Slice G1 (design system 2.4, WCAG 2.4.1, 1.4.10, 1.4.11, 2.1.1): the four breakpoints of the system and nothing else, and the
// last gaps of structure: the skip link, the states that forced colours would wipe out and the focus of what takes it by script.
describe('puntos de corte, colores forzados, salto al contenido y foco por código', () => {
  const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()

  it('la hoja usa solo los puntos de corte del sistema: min-width de 600, 768 y 1024 px, y max-width solo de 359 px', () => {
    const conditions = [...withoutComments(css).matchAll(/@media\s+([^{]+)\{/g)].map((match) => match[1])
    const widths = conditions.flatMap((condition) => [...condition.matchAll(/\((min|max)-width:\s*([^)]+)\)/g)].map((match) => `${match[1]}-width: ${match[2].trim()}`))

    expect(widths.filter((width) => width.startsWith('max-'))).toEqual(['max-width: 359px'])
    expect([...new Set(widths.filter((width) => width.startsWith('min-')))].sort()).toEqual(['min-width: 1024px', 'min-width: 600px', 'min-width: 768px'])
    // A phone lying down is a height, not a width; the list of cases switches by its own width (@container), not the screen's.
    expect(mediaBlock('max-height: 480px')).toMatch(/\.nav\s*\{/)
  })

  // What the old narrow blocks did is the base now, and the wide side moved to a block of the system: 520 px went to 600 px,
  // 760 px to 768 px and 1050 px to 1024 px.
  it('lo que cambiaba en las pantallas angostas es la regla de base y lo ancho va a un bloque del sistema', () => {
    expect(value(rule('.form-grid'), 'grid-template-columns')).toBe('minmax(0, 1fr)')
    expect(value(rule('.form-grid', media(600)), 'grid-template-columns')).toBe('repeat(2, minmax(0, 1fr))')
    // A wide field takes the whole row where the form has two columns; in one column it needs no rule.
    expect(allSelectors().filter((selector) => selector === '.field-wide')).toHaveLength(1)
    expect(value(rule('.field-wide', media(600)), 'grid-column')).toBe('1 / -1')
    expect(value(rule('.page-title-row'), 'flex-wrap')).toBe('wrap')
    expect(value(rule('.page-title-row'), 'align-items')).toBe('flex-start')
    expect(value(rule('.page-title-row', media(600)), 'flex-wrap')).toBe('nowrap')
    expect(value(rule('.page-title-row', media(768)), 'align-items')).toBe('flex-end')
    expect(value(rule('.content-grid'), 'grid-template-columns')).toBe('minmax(0, 1fr)')
    expect(value(rule('.content-grid', media(1024)), 'grid-template-columns')).toBe('minmax(0, .9fr) minmax(360px, 1.1fr)')
    // The content's own padding on a phone, and the wider one from 768 px in longhands, so the room kept for the bottom bar stays.
    expect(rule('.main-content')).toMatch(/padding:\s*26px 16px\s*;/)
    const wide = rule('.main-content', media(768))
    expect(wide).not.toMatch(/(?<![\w-])padding\s*:/)
    expect(value(wide, 'padding-top')).toBe('38px')
    // Never less than the phone's safe area on that side (the WebKit audit below).
    for (const side of ['right', 'left']) expect(value(wide, `padding-${side}`), side).toBe(`max(clamp(22px, 4vw, 64px), env(safe-area-inset-${side}))`)
  })

  // Forced colours drop fills and box shadows (the second pixel of a chosen edge); borders stay, in the text colour. So a chosen
  // toggle takes the system colours of a selected item, a chosen radio tile its edge, and the bars of the navigation the colour of
  // the page, but the current place's.
  it('con colores forzados lo elegido, lo apretado y el lugar actual se siguen viendo con los colores del sistema (1.4.11)', () => {
    const forced = mediaBlock('forced-colors: active')
    const pressed = rule('.button[aria-pressed="true"], .choice[aria-pressed="true"]', forced)

    expect(value(pressed, 'border-color')).toBe('Highlight')
    expect(value(pressed, 'background')).toBe('Highlight')
    expect(value(pressed, 'color')).toBe('HighlightText')
    // Left as written: the browser would paint the page's colour behind the words, where HighlightText does not read.
    expect(value(pressed, 'forced-color-adjust')).toBe('none')
    expect(value(rule('.choice[aria-pressed="true"] small', forced), 'color')).toBe('HighlightText')
    expect(value(rule('.choice:has(input:checked)', forced), 'border-color')).toBe('Highlight')
    expect(value(rule('.nav-link', forced), 'border-top-color')).toBe('Canvas')
    expect(value(rule('.nav-link', forced), 'border-left-color')).toBe('Canvas')
    expect(value(rule('.nav-link[aria-current]', forced), 'border-top-color')).toBe('Highlight')
    expect(value(rule('.nav-link[aria-current="page"]', forced), 'border-left-color')).toBe('Highlight')
  })

  it('«Ir al contenido» queda fuera de la vista hasta tener el foco y entonces aparece sobre la barra de arriba sin mover nada (2.4.1)', () => {
    const link = rule('.skip-link')
    const hidden = rule('.skip-link:not(:focus)')

    expect(value(link, 'position')).toBe('absolute')
    expect(value(link, 'min-height')).toBe('var(--target)')
    expect(value(link, 'background')).toBe('var(--surface)')
    expect(value(link, 'border')).toBe('var(--border-width) solid var(--border)')
    // Out of sight but still in the accessibility tree, as .visually-hidden.
    expect(value(hidden, 'clip-path')).toBe('inset(50%)')
    expect(hidden).not.toMatch(/display:\s*none|visibility:\s*hidden/)
    // The ring of the dark bar, which is what is around it.
    expect(value(rule('.skip-link:focus-visible'), 'outline-color')).toBe('var(--lime)')
  })

  // A heading, a row or a message the code gives the focus to (tabindex -1): a ring when the keyboard is in use, none after a tap
  // or a click, also where a browser would draw one for a script focus after a click.
  it('lo que toma el foco por código no muestra el anillo después de un toque o un clic', () => {
    expect(value(rule('[tabindex="-1"]:focus:not(:focus-visible)'), 'outline')).toBe('none')
    // Slice H1: one rule for all of them; the result of a mark and the question before one have tabindex -1 like the rest.
    expect(allSelectors().filter((selector) => selector.endsWith(':focus:not(:focus-visible)'))).toEqual(['[tabindex="-1"]:focus:not(:focus-visible)'])
  })

  // 2026-11-12, slice F2b: a date of the filters with its error under it stood taller than its neighbours, so its box sat higher.
  it('con un error en los filtros los campos se alinean arriba y los botones quedan a la altura de los recuadros', () => {
    // Every `@container (min-width: 56rem)` block joined: the list of cases has one too.
    const opening = '@container (min-width: 56rem) {'
    const wide = [...css.matchAll(/@container \(min-width: 56rem\) \{/g)].map((match) => css.slice(match.index + opening.length, css.indexOf('\n}', match.index))).join('\n')
    const buttons = '.filter-bar:has(.field-error) > .button-row'

    expect(value(rule('.filter-bar'), 'align-items')).toBe('flex-end')
    expect(value(rule('.filter-bar'), 'container-type')).toBe('inline-size')
    expect(value(rule('.filter-bar:has(.field-error)'), 'align-items')).toBe('flex-start')
    // On a line of their own the buttons stay at its foot, with no room added above them.
    expect(value(rule(buttons), 'align-self')).toBe('flex-end')
    expect(rule(buttons)).not.toMatch(/margin/)
    // Where the bar holds the fields and the buttons in one line, they move down by a label (one line of the body text) and the
    // gap of a field: they start where the boxes start.
    expect(value(rule(buttons, wide), 'align-self')).toBe('flex-start')
    expect(value(rule(buttons, wide), 'margin-top')).toBe('calc(var(--font-size-body) * var(--line-height-body) + var(--space-1))')
    expect(value(rule('.field'), 'gap')).toBe('var(--space-1)')
  })

  // Issue #177, follow-up C of slice G2: with three fields of 10 rem on the first line and the fourth sharing the next one with
  // «Aplicar» and «Limpiar» (a bar of 600 to 733 px of screen), an error in «Hasta» put the buttons at the foot of its error. In
  // that span the buttons move down by a label and its gap, to the box of the field beside them, with the error in it or above.
  it('con un error en los filtros, cuando el cuarto campo comparte la línea con los botones, los botones van a la altura de su recuadro', () => {
    // A query cannot read a variable: 24 and 36 px are two and three gaps of --space-3 (12 px), asserted below.
    const opening = '@container (min-width: calc(30rem + 24px)) and (max-width: calc(40rem + 35.98px)) {'
    const start = css.indexOf(opening)
    expect(start).toBeGreaterThan(0)
    const shared = css.slice(start + opening.length, css.indexOf('\n}', start))
    const buttons = '.filter-bar:has(.field-error) > .button-row'

    expect(value(rule(buttons, shared), 'align-self')).toBe('flex-start')
    expect(value(rule(buttons, shared), 'margin-top')).toBe('calc(var(--font-size-body) * var(--line-height-body) + var(--space-1))')
    // The span is the one of three fields and their two gaps up to four fields and their three: the basis of a field and the gap.
    expect(value(rule('.filter-bar > .field'), 'flex')).toBe('1 1 10rem')
    expect(value(rule('.filter-bar'), 'gap')).toBe('var(--space-3)')
    expect(css).toMatch(/--space-3:\s*12px;/)
  })
})

// The WebKit audit after issue #173 (2026-11-12): every layout check had run in Chrome, which lets a select with a percentage width
// shrink to nothing when a column is sized by its content; WebKit sizes it by its longest option. What WebKit and Safari on an
// iPhone do differently is pinned here by pattern, so a new rule or screen that repeats it fails wherever it is written.
describe('Safari en el iPhone (WebKit): lo que en Chrome no se ve', () => {
  const value = (declarations: string, property: string) => new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`).exec(declarations)?.[1].trim()
  /** The arguments of a CSS function, split at its own commas. */
  const argumentsOf = (call: string) => splitSelectors(call.slice(call.indexOf('(') + 1, call.lastIndexOf(')')))
  /** The minimum of each track of a grid-template-columns value; a bare fr track has an auto minimum. */
  function trackMinimums(columns: string): string[] {
    const tracks: string[] = []
    let depth = 0
    let current = ''
    for (const character of columns.trim()) {
      if (character === '(') depth += 1
      if (character === ')') depth -= 1
      if (/\s/.test(character) && depth === 0) {
        if (current) tracks.push(current)
        current = ''
      } else current += character
    }
    if (current) tracks.push(current)
    return tracks.flatMap((track) => {
      if (track.startsWith('repeat(')) return trackMinimums(argumentsOf(track)[1])
      if (track.startsWith('minmax(')) return [argumentsOf(track)[0]]
      return [/^\d*\.?\d+fr$/.test(track) ? 'auto' : track]
    })
  }

  // A column whose minimum is its content grows with a select's longest option in WebKit. Only these hold no field: the brand and
  // «Cerrar sesión» of the top bar, «Buscar» next to the address, and the tag and «Ir» of a step. The context strip spans the
  // brand's column on a phone and holds the company switch, so its own width never counts there.
  it('solo la marca, «Cerrar sesión», «Buscar» y el pie de un paso tienen una columna que crece con su contenido', () => {
    const contentSized = allRules().filter(({ declarations }) => {
      const columns = value(declarations, 'grid-template-columns')
      return columns !== undefined && trackMinimums(columns).some((minimum) => /^(?:auto|min-content|max-content|fit-content)/.test(minimum))
    })

    expect(selectorsOf(contentSized)).toEqual(['.site-map-search', '.topbar', '.topbar', '.step'])
    expect(value(rule('.topbar-context'), 'contain')).toBe('inline-size')
  })

  // Under 16 px Safari zooms the page when a field takes focus, and a select is as wide as its longest option unless its place
  // says otherwise: every one of them is in a field of the system (FormField, Fieldset) or is the company switch.
  it('todo campo de texto y toda lista desplegable está en un campo del sistema o es el selector de empresa', () => {
    const insideOf = (before: string, tag: string) => before.lastIndexOf(`<${tag}`) > before.lastIndexOf(`</${tag}>`)
    const outside = appSourcePaths().flatMap((path) => {
      const text = readSource(path)
      return [...text.matchAll(/<(input|select|textarea)\b[^>]*/g)]
        .filter((match) => !/type="(?:checkbox|radio|hidden)"/.test(match[0]) && !match[0].includes('className="company-switch"'))
        .filter((match) => !['FormField', 'Fieldset'].some((tag) => insideOf(text.slice(0, match.index), tag)))
        .map((match) => `${path}: <${match[1]}`)
    })

    expect(outside).toEqual([])
    for (const selector of [TEXT_BOX, '.company-switch']) expect(ruleListing(selector).declarations).toMatch(/font-size:\s*var\(--font-size-body\)/)
    for (const selector of ['.field select', '.company-switch']) {
      expect(value(rule(selector), 'max-width'), selector).toBe('100%')
      expect(value(rule(selector), 'text-overflow'), selector).toBe('ellipsis')
    }
    // An inline form puts its fields straight in its own column, inside a record or a wrapping row: its content never widens them.
    expect(value(rule('.inline-form'), 'min-width')).toBe('0')
  })

  // A word longer than the screen (a name, a local, a schedule, a company) widens the page as a long option did. Where such a
  // text is written it may break anywhere; only what is never written by a person stays on one line.
  it('una palabra larga de un nombre se corta antes de ensanchar la página', () => {
    const nowrap = allRules().filter(({ declarations }) => /white-space:\s*nowrap/.test(declarations))
    const names = ['h1, h2, h3', '.topbar-who', '.choice-text', '.check', '.record', '.history-card', '.history-items li', '.case',
      '.motive-fact', '.motive-said', '.now-context', '.message-body', '.site-map-results .button']

    expect(selectorsOf(nowrap)).toEqual(['.visually-hidden', '.skip-link:not(:focus)', '.status-chip'])
    for (const selector of names) expect(value(rule(selector), 'overflow-wrap'), selector).toBe('anywhere')
  })

  // Safari on iOS centres the value of a date or a time and gives an empty one no line (no placeholder is drawn): the value starts
  // where typed text starts, as in @tailwindcss/forms. Its own rule: a browser that does not know the pseudo-element drops the
  // whole rule it is in.
  it('una fecha o una hora se lee desde la izquierda como el texto de los demás campos, también vacía', () => {
    const dateValue = rule('.field input::-webkit-date-and-time-value')

    expect(value(dateValue, 'text-align')).toBe('start')
    expect(value(dateValue, 'min-height')).toBe('calc(var(--line-height-body) * 1em)')
    expect(allSelectors().filter((selector) => selector.includes('::-webkit-'))).toEqual(['.field input::-webkit-date-and-time-value', '.fold > summary::-webkit-details-marker'])
  })

  // With viewport-fit=cover the page reaches under the rounded corners and the island of a phone lying down, which takes about
  // 47 px on each side; the ADMIN's content kept 16 to 34 px there. Safari enlarges text by itself when the phone turns unless
  // text-size-adjust says 100% (never none: that also blocks the reader's own text size). Pinch zoom stays allowed: inside the
  // installed app it is the only way to enlarge the text.
  it('apaisado, el contenido no queda bajo la isla del iPhone, el texto no se agranda solo al girar y se puede ampliar', () => {
    for (const block of [css, media(768)]) {
      for (const side of ['left', 'right']) {
        expect(value(rule('.main-content', block), `padding-${side}`), side).toMatch(new RegExp(`^max\\(.+, env\\(safe-area-inset-${side}\\)\\)$`))
      }
    }
    expect(value(rule('html'), '-webkit-text-size-adjust')).toBe('100%')
    expect(value(rule('html'), 'text-size-adjust')).toBe('100%')
    expect(css).not.toMatch(/text-size-adjust:\s*none/)
    const viewport = /<meta name="viewport" content="([^"]+)"/.exec(readSource('../index.html'))?.[1] ?? ''
    expect(viewport.split(/,\s*/)).toEqual(['width=device-width', 'initial-scale=1.0', 'viewport-fit=cover'])
  })

  // Safari's bars come and go while the page scrolls: 100vh is the screen without them, so a page of that height runs under them.
  it('toda altura en vh tiene después la misma en dvh', () => {
    const missing = allRules().flatMap(({ selectors, declarations }) => [...declarations.matchAll(/([\w-]+):\s*([^;]*\d+vh[^;]*)/g)]
      .filter((match) => !declarations.includes(`${match[1]}: ${match[2].trim().replace(/(\d+)vh/g, '$1dvh')}`))
      .map((match) => `${selectors.join(', ')} { ${match[1]} }`))

    expect(missing).toEqual([])
  })
})

// Slice G2: what the checks on the built app found (scratchpad g2, 2026-11-12).
describe('verificación sobre la aplicación construida', () => {
  // A date or time field has one more Tab stop, its calendar or clock button, inside the field. There neither :focus nor
  // :focus-visible matches the field, only :focus-within (Chrome 157, probed on the built app), so Chrome drew only its own thin
  // square around the icon instead of the ring of every other control.
  it('un campo de fecha u hora lleva el anillo común también cuando el foco está en su botón de calendario (2.4.7)', () => {
    const fields = 'input:is([type="date"], [type="time"], [type="datetime-local"]):focus-within'

    expect(rule(fields)).toMatch(/outline:\s*3px solid var\(--focus-ring\)/)
    expect(rule(fields)).toMatch(/outline-offset:\s*2px/)
    expect(mediaBlock('forced-colors: active')).toMatch(/input:is\(\[type="date"\], \[type="time"\], \[type="datetime-local"\]\):focus-within\s*\{\s*outline-color:\s*Highlight/)
  })

  // Forced colours drop the tinted fill that marks a disabled field, and its edge took the text colour: an empty disabled field
  // looked like one that can be used. A disabled button already turns GrayText there.
  it('con colores forzados un campo deshabilitado tiene el borde del color del sistema para lo deshabilitado', () => {
    const forced = mediaBlock('forced-colors: active')
    const disabled = rule('.field :is(input:not([type=checkbox], [type=radio]), select, textarea):disabled', forced)

    expect(disabled).toMatch(/border-color:\s*GrayText/)
  })
})

// Slice H1: one system left. The markup and the stylesheet name the same classes (the check that would have caught the class
// `mark-voided`, written with no rule, and the rule `.mark-action-primary`, which nothing wrote), and no screen draws a Unicode
// glyph where the system has an icon (finding F-22).
describe('una sola hoja para un solo marcado', () => {
  const sources = appSourcePaths().map((path) => ({ path, text: readSource(path) }))
  /** Every class a selector of the stylesheet names, media and container blocks included. */
  const sheetClasses = new Set(allSelectors().flatMap((selector) => [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1])))

  /**
   * The classes a `className` writes: the quoted words of its expression, the fixed words of a template and the quoted words
   * inside its `${…}`. A word glued to a `${…}` is built from a value: it is returned with a "*" where the value goes.
   */
  function writtenClasses(text: string) {
    const names: string[] = []
    for (const match of text.matchAll(/className=/g)) {
      const start = match.index + match[0].length
      let end = start
      if (text[start] === '"' || text[start] === "'") end = text.indexOf(text[start], start + 1) + 1
      else if (text[start] === '{') {
        for (let depth = 0; end < text.length; end++) {
          if (text[end] === '{') depth++
          else if (text[end] === '}' && --depth === 0) break
        }
        end++
      } else continue
      const expression = text.slice(start, end)
      const templates = [...expression.matchAll(/`([^`]*)`/g)].map((found) => found[1])
      const insideTemplates = templates.flatMap((template) => [...template.matchAll(/\$\{([^}]*)\}/g)].map((found) => found[1]))
      for (const quoted of [expression.replace(/`[^`]*`/g, ' '), ...insideTemplates].join(' ').matchAll(/'([^']*)'|"([^"]*)"/g)) {
        names.push(...(quoted[1] ?? quoted[2]).split(/\s+/))
      }
      for (const template of templates) names.push(...template.replace(/\$\{[^}]*\}/g, '*').split(/\s+/))
    }
    return names.filter((name) => name !== '' && name !== '*')
  }
  const written = sources.flatMap(({ path, text }) => writtenClasses(text).map((name) => ({ path, name })))
  const writtenNames = new Set(written.map(({ name }) => name))

  // Classes built from a value: the stylesheet has one rule per value the code can give, and the guard only sees the prefix.
  const BUILT_FROM_A_VALUE: Record<string, string> = {
    'message-': 'PageMessage and the notice of «Primeros pasos»: message-${kind}, one rule per kind of message',
    'status-': 'StatusTag (status-${tone}) and the tags of EmployeeViews and AdminHistoryRender built from an API state',
    'case-': 'a case of «Para revisar»: case-${tone}, one rule per tone of a case',
    'receipt-location-': 'the location line of a saved mark: receipt-location-${pending, sent or missing}'
  }
  // Written in the markup with no rule of their own, on purpose.
  const WITHOUT_A_RULE: Record<string, string> = {
    'mark-feedback': 'the slot of the result of a mark: tests find the result inside it; its focus rule is the one of [tabindex="-1"]',
    'employee-edit-form': 'the edit form of a person: its rule lined its boxes up at their foot; every two-column form lines its fields up by parts now (#177)'
  }
  // Named by the stylesheet and written by a library, not by the markup.
  const WRITTEN_BY_A_LIBRARY: Record<string, string> = {
    'leaflet-container': 'Leaflet, on the map of a local',
    'leaflet-bar': 'Leaflet, on the zoom buttons of that map'
  }

  it('toda clase que escribe el marcado tiene su regla en la hoja', () => {
    const dynamic = written.filter(({ name }) => name.includes('*'))
    const missing = written.filter(({ name }) => !name.includes('*') && !sheetClasses.has(name) && !(name in WITHOUT_A_RULE))

    expect(missing.map(({ path, name }) => `${path}: ${name}`)).toEqual([])
    // A class built from a value starts with a prefix of the list; the list is not a way around the guard for anything else.
    expect(dynamic.filter(({ name }) => !(name.slice(0, name.indexOf('*')) in BUILT_FROM_A_VALUE)).map(({ path, name }) => `${path}: ${name}`)).toEqual([])
    // The lists only hold what is still true: each prefix is still built, each class without a rule is still written without one.
    expect(Object.keys(BUILT_FROM_A_VALUE).filter((prefix) => !dynamic.some(({ name }) => name.startsWith(`${prefix}*`)))).toEqual([])
    expect(Object.keys(WITHOUT_A_RULE).filter((name) => !writtenNames.has(name) || sheetClasses.has(name))).toEqual([])
  })

  it('toda clase que nombra la hoja la escribe el marcado', () => {
    const unused = [...sheetClasses].filter((name) => !writtenNames.has(name) && !(name in WRITTEN_BY_A_LIBRARY)
      && !Object.keys(BUILT_FROM_A_VALUE).some((prefix) => name.startsWith(prefix)))

    expect(unused).toEqual([])
    expect(Object.keys(WRITTEN_BY_A_LIBRARY).filter((name) => !sheetClasses.has(name))).toEqual([])
  })

  // Finding F-22: the menu, the states and the marks drew Unicode glyphs, some of them twice for different things, and a screen
  // reader read them out. The system draws its icons (app/icons.tsx). «⋮» in the install help stays: it shows what the button of
  // Chrome looks like. «→» was the arrow of a change («A → B») in the history of a day; it reads «de A a B» now.
  it('ninguna pantalla dibuja los glifos del hallazgo F-22: el sistema tiene sus íconos', () => {
    const glyphs = /[✓◷▦☰⌖▤♙✔↗▸▾→]/u
    const found = sources.flatMap(({ path, text }) => text.split(/\r?\n/).map((line, index) => ({ where: `${path}:${index + 1}`, line })))
      .filter(({ line }) => glyphs.test(line))

    expect(found.map(({ where, line }) => `${where}: ${line.trim()}`)).toEqual([])
    expect(sources.some(({ path, text }) => path === 'device/pwa/InstallControl.tsx' && text.includes('⋮'))).toBe(true)
  })
})
