/**
 * Set when the session expires while a mark is being sent, so the login screen can say the mark was not saved
 * (a 401 means the server did not record it). Memory only, never browser storage (rule 27).
 */
let interrupted = false

export const INTERRUPTED_MARK_MESSAGE = 'Pasó mucho tiempo y hay que entrar de nuevo. Tu marca todavía no se guardó.'

export function noteMarkInterrupted(): void { interrupted = true }

export function markWasInterrupted(): boolean { return interrupted }

export function clearMarkInterrupted(): void { interrupted = false }
