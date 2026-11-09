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

  it('deja lugar para que la barra de avisos fija no tape el foco (2.4.11)', () => {
    const clearance = (declarations: string) => Number(/--alerts-bar-clearance:\s*(\d+)px/.exec(declarations)?.[1])

    expect(rule('html:has(.push-control)')).toMatch(/scroll-padding-bottom:\s*calc\(var\(--alerts-bar-clearance\)/)
    expect(rule('.main-content')).toMatch(/calc\(var\(--alerts-bar-clearance\)/)
    // Measured heights of the bar: about 81 px on wide screens, 127 px at 360 px where its text wraps.
    expect(clearance(rule(':root'))).toBeGreaterThanOrEqual(110)
    expect(clearance(rule(':root', media(520)))).toBeGreaterThanOrEqual(150)
  })
})
