import { describe, expect, it, vi } from 'vitest'
import { generateTemporaryPassword, TEMPORARY_PASSWORD_ALPHABET } from './temporaryPassword'

describe('generateTemporaryPassword (same shape as TemporaryPasswordGenerator.java)', () => {
  it('is four groups of four characters without look-alike characters', () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const password = generateTemporaryPassword()
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){3}$/)
      expect(password).not.toMatch(/[0O1lI]/)
    }
  })

  it('uses the server alphabet and the browser random source', () => {
    expect(TEMPORARY_PASSWORD_ALPHABET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789')
    const random = vi.spyOn(crypto, 'getRandomValues')
    generateTemporaryPassword()
    expect(random).toHaveBeenCalled()
    random.mockRestore()
  })

  it('maps random values without modulo bias by rejecting values past the last full alphabet cycle', () => {
    let calls = 0
    // 255 is past 57 * 4 = 228 and must be discarded; 0 maps to the first character.
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
      const bytes = array as unknown as Uint8Array
      bytes.fill(calls++ === 0 ? 255 : 0)
      return array
    })
    expect(generateTemporaryPassword()).toBe('AAAA-AAAA-AAAA-AAAA')
    random.mockRestore()
  })
})
