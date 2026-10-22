import { describe, expect, it } from 'vitest'
import html from '../../index.html?raw'

describe('index.html', () => {
  it('enlaza el favicon SVG', () => {
    expect(html).toMatch(/<link[^>]+rel="icon"[^>]+href="\/favicon\.svg"/)
  })
})
