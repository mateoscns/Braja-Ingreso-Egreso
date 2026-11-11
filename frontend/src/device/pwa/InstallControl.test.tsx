import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstallControl } from './InstallControl'

function useAgent(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('InstallControl', () => {
  it('en iPhone explica cómo instalar y al empleado no le habla de avisos push', () => {
    useAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
    render(<InstallControl audience="employee" />)
    fireEvent.click(screen.getByRole('button', { name: 'Cómo instalar' }))
    expect(screen.getByRole('status')).toHaveTextContent('En Safari, tocá Compartir y elegí Agregar a pantalla de inicio.')
    expect(screen.getByRole('status')).not.toHaveTextContent(/push|avisos/)
  })

  it('en iPhone el ADMIN sigue viendo que los avisos se activan desde la app instalada', () => {
    useAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')
    render(<InstallControl />)
    fireEvent.click(screen.getByRole('button', { name: 'Cómo instalar' }))
    expect(screen.getByRole('status')).toHaveTextContent('Los avisos se activan desde la app instalada.')
  })

  it('en Android sin aviso de instalación explica los pasos del menú de Chrome', () => {
    useAgent('Mozilla/5.0 (Linux; Android 13; SM-A135M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36')
    render(<InstallControl audience="employee" />)
    fireEvent.click(screen.getByRole('button', { name: 'Cómo instalar' }))
    expect(screen.getByRole('status')).toHaveTextContent('En Chrome, tocá el menú ⋮ (tres puntos) y elegí Agregar a pantalla de inicio.')
  })

  it('en una computadora sin aviso de instalación no muestra nada', () => {
    useAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36')
    const { container } = render(<InstallControl audience="employee" />)
    expect(container).toBeEmptyDOMElement()
  })
})
