import { cleanup, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { BrandMark, ICON_NAMES, Icon } from './icons'

afterEach(cleanup)

// The project has no Node typings, hence the narrow local type (same as app/styles.test.tsx). Paths are relative
// to the frontend folder, where the tests run.
type NodeFs = { readFileSync(path: string, encoding: 'utf8'): string }
const nodeProcess = (globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): NodeFs } }).process
const appIcon = nodeProcess.getBuiltinModule('node:fs').readFileSync('public/icon.svg', 'utf8')

// The closed list of the design system (odd/ux-ui-refactor/design-system.md, section 6), by group.
const DESIGN_SYSTEM_ICONS = [
  'check', 'x', 'eye', 'bubble', 'waiting', 'pause', 'ban',
  'info', 'alert', 'error',
  'enter', 'exit', 'coffee', 'lunch', 'clock', 'pin', 'pinoff',
  'inbox', 'today', 'month', 'config', 'steps', 'store', 'schedule', 'people', 'bell', 'calendar',
  'refresh', 'filter', 'plus', 'right', 'external'
]

const SHAPES = 'path, circle, rect, line, polyline, polygon, ellipse'

function renderIcon(name: (typeof ICON_NAMES)[number]) {
  const { container } = render(<Icon name={name} />)
  return container.querySelector('svg')!
}

describe('íconos de la interfaz', () => {
  it('el conjunto es el del sistema de diseño: ni uno más ni uno menos', () => {
    expect([...ICON_NAMES].sort()).toEqual([...DESIGN_SYSTEM_ICONS].sort())
  })

  it.each(ICON_NAMES)('«%s» es un svg de adorno: oculto para lectores de pantalla y fuera del orden de foco', (name) => {
    const svg = renderIcon(name)

    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    // No name of its own: the visible text next to it names the control.
    expect(svg).not.toHaveAttribute('role')
    expect(svg).not.toHaveAttribute('aria-label')
    expect(svg).not.toHaveAttribute('aria-labelledby')
    expect(svg.querySelector('title, desc')).toBeNull()
  })

  it.each(ICON_NAMES)('«%s» se dibuja en la grilla de 24 con el trazo de la clase .icon, sin color ni grosor propios', (name) => {
    const svg = renderIcon(name)

    expect(svg).toHaveClass('icon')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg.querySelectorAll(SHAPES).length).toBeGreaterThan(0)
    // One family: the stroke, its width and its colour come from the .icon rule, so no shape overrides them.
    for (const element of [svg, ...svg.querySelectorAll('*')]) {
      for (const attribute of ['fill', 'stroke', 'stroke-width', 'style']) expect(element).not.toHaveAttribute(attribute)
    }
    // Its size follows the text through the same rule.
    expect(svg).not.toHaveAttribute('width')
    expect(svg).not.toHaveAttribute('height')
  })

  it('cada nombre tiene su propio dibujo', () => {
    const drawings = ICON_NAMES.map((name) => renderToStaticMarkup(<Icon name={name} />))

    expect(new Set(drawings).size).toBe(ICON_NAMES.length)
  })

  it('al lado de un texto no cambia el nombre del control ni aparece como imagen', () => {
    render(<button type="button"><Icon name="refresh" />Actualizar</button>)

    expect(screen.getByRole('button')).toHaveAccessibleName('Actualizar')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('un nombre que no está en el conjunto no compila y no dibuja nada', () => {
    // @ts-expect-error 'menu' is not an IconName: the union is closed, so a typo fails `npm run typecheck`.
    const markup = renderToStaticMarkup(<Icon name="menu" />)

    expect(markup).toBe('<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"></svg>')
  })
})

describe('marca de Fichaje Braja', () => {
  it('es el reloj del ícono de la aplicación, relleno con el color del texto que lo rodea', () => {
    const { container } = render(<BrandMark />)
    const svg = container.querySelector('svg')!
    const paths = svg.querySelectorAll(SHAPES)

    // The same path as the lime clock of public/icon.svg (the app icon), not the simplified one of favicon.svg.
    const clock = /<path d="([^"]+)" fill="#d8f078"\/>/.exec(appIcon)![1]
    expect(paths).toHaveLength(1)
    expect(paths[0]).toHaveAttribute('d', clock)
    expect(paths[0]).toHaveAttribute('fill', 'currentColor')
    // It is drawn with a fill: the .icon rule (fill: none, a stroke) would turn it into an outline.
    expect(svg).not.toHaveClass('icon')
    expect(svg).toHaveClass('brand-mark')
  })

  it('no tiene nombre accesible: el enlace que la rodea lleva el nombre', () => {
    const { container } = render(<a href="#inicio"><BrandMark />Fichaje Braja</a>)
    const svg = container.querySelector('svg')!

    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(svg).not.toHaveAttribute('role')
    expect(svg).not.toHaveAttribute('aria-label')
    expect(svg).not.toHaveAttribute('aria-labelledby')
    expect(svg.querySelector('title, desc')).toBeNull()
    expect(screen.getByRole('link')).toHaveAccessibleName('Fichaje Braja')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
