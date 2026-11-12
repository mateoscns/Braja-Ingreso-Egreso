import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Session } from '../shared/api/types'
import { entryScreen, ENTRY_TITLES, pageTitle, useDocumentTitle } from './ui'

// App.tsx itself cannot be loaded here: it imports `virtual:pwa-register`, which only the PWA plugin of the Vite build resolves
// (vitest.config.ts does not load it). Its choice of screen and the title of each one are entryScreen and ENTRY_TITLES.

const membership = (role: 'ADMIN' | 'EMPLOYEE', companyId = 'c-1') => ({ companyId, companyName: `Empresa ${companyId}`, role })
const session = (patch: Partial<Session>) => ({ accountId: 'a-1', dni: '30123456', mustChangePassword: false, activeCompanyId: 'c-1', memberships: [membership('EMPLOYEE')], ...patch }) as Session

function Titled({ title }: { title: string | null }) {
  useDocumentTitle(title)
  return null
}

beforeEach(() => { document.title = 'Fichaje Braja' })
afterEach(cleanup)

// WCAG 2.4.2: every screen names itself in the browser tab (finding F-19); «Fichaje Braja» goes last, after what is shown.
describe('el título de cada pantalla de entrada', () => {
  it('cada pantalla que elige la aplicación tiene su título, y la del ADMIN lo deja a su sección', () => {
    expect(entryScreen(true, null)).toBe('boot')
    expect(entryScreen(false, null)).toBe('login')
    // Issue #169: without a session because the server could not be reached, not because it said there is none.
    expect(entryScreen(false, null, true)).toBe('offline')
    expect(entryScreen(false, session({}), true)).toBe('employee')
    expect(entryScreen(false, session({ mustChangePassword: true }))).toBe('password')
    expect(entryScreen(false, session({ activeCompanyId: null, memberships: [membership('EMPLOYEE', 'c-1'), membership('ADMIN', 'c-2')] }))).toBe('company')
    expect(entryScreen(false, session({}))).toBe('employee')
    expect(entryScreen(false, session({ memberships: [membership('ADMIN')] }))).toBe('admin')

    expect(ENTRY_TITLES).toEqual({
      boot: 'Fichaje Braja',
      login: 'Ingresar · Fichaje Braja',
      offline: 'Sin conexión · Fichaje Braja',
      password: 'Cambiá tu contraseña · Fichaje Braja',
      company: 'Elegí una empresa · Fichaje Braja',
      employee: 'Marcar · Fichaje Braja',
      admin: null
    })
  })

  it('el nombre de lo que se ve va primero y el del producto al final', () => {
    expect(pageTitle('Hoy')).toBe('Hoy · Fichaje Braja')
    expect(pageTitle()).toBe('Fichaje Braja')
  })

  it('el título sigue a la pantalla, y sin título la pestaña conserva el que le puso la pantalla de adentro', () => {
    const view = render(<Titled title="Ingresar · Fichaje Braja" />)
    expect(document.title).toBe('Ingresar · Fichaje Braja')

    view.rerender(<Titled title="Marcar · Fichaje Braja" />)
    expect(document.title).toBe('Marcar · Fichaje Braja')

    document.title = 'Para revisar · Fichaje Braja'
    view.rerender(<Titled title={null} />)
    expect(document.title).toBe('Para revisar · Fichaje Braja')
  })
})
