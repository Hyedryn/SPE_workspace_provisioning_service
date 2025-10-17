export const normalizeEmail = (value?: string | null): string | null => {
  if (!value) {
    return null
  }
  return value.trim().toLowerCase()
}
