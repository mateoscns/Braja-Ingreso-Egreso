export const API_PATH_PATTERN = /^\/api\/v1(?:\/|$)/

export function isApiPath(pathname: string): boolean {
  return API_PATH_PATTERN.test(pathname)
}
