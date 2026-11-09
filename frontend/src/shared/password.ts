/** New passwords: 12 characters to 72 UTF-8 bytes, BCrypt's limit (D-20261102-04). Existing passwords are not affected. */
export const PASSWORD_MIN_CHARACTERS = 12
export const PASSWORD_MAX_BYTES = 72
/** Upper bound in characters for `maxLength`: a password of at most 72 bytes never has more than 72 characters. */
export const PASSWORD_MAX_CHARACTERS = PASSWORD_MAX_BYTES

export const PASSWORD_TOO_LONG_MESSAGE = 'La contraseña es demasiado larga: puede tener hasta 72 caracteres, y las letras con tilde y la ñ cuentan como 2.'
export const PASSWORD_LENGTH_HINT = 'De 12 a 72 caracteres; las letras con tilde y la ñ cuentan como 2.'
/** The person choosing their own password: the same 72-byte check, in plain words. */
export const OWN_PASSWORD_RULE = 'Elegí una clave de al menos 12 letras o números. Puede ser una frase.'
export const OWN_PASSWORD_TOO_SHORT_MESSAGE = 'La clave nueva tiene que tener al menos 12 letras o números.'
export const OWN_PASSWORD_TOO_LONG_MESSAGE = 'La clave es demasiado larga. Usá una más corta: las letras con tilde y la ñ cuentan doble.'

export function passwordBytes(value: string): number {
  return new TextEncoder().encode(value).length
}

/** The same bound the server answers with 422 PASSWORD_TOO_LONG, checked before any request. */
export function passwordTooLong(value: string): boolean {
  return passwordBytes(value) > PASSWORD_MAX_BYTES
}
