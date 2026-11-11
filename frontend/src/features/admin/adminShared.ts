// Helpers shared by the ADMIN containers of more than one section; the render files have their own in adminRenderShared.tsx.
export const errText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.'
