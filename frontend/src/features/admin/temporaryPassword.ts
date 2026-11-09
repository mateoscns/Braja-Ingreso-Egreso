/** The alphabet of backend TemporaryPasswordGenerator: no look-alike characters (0/O, 1/l/I). */
export const TEMPORARY_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const LENGTH = 16
// Bytes at or past the last full cycle of the alphabet are discarded so every character is equally likely.
const LIMIT = 256 - (256 % TEMPORARY_PASSWORD_ALPHABET.length)

/**
 * A temporary password the ADMIN hands over in person, with the same shape as the server's: four groups of four characters
 * (19 with dashes, about 93 bits). It lives only in component state; it is never written to browser storage.
 */
export function generateTemporaryPassword(): string {
  const characters: string[] = []
  const bytes = new Uint8Array(LENGTH * 2)
  while (characters.length < LENGTH) {
    crypto.getRandomValues(bytes)
    for (const byte of bytes) {
      if (byte >= LIMIT) continue
      characters.push(TEMPORARY_PASSWORD_ALPHABET[byte % TEMPORARY_PASSWORD_ALPHABET.length])
      if (characters.length === LENGTH) break
    }
  }
  return [0, 4, 8, 12].map((index) => characters.slice(index, index + 4).join('')).join('-')
}
