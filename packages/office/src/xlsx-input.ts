/** Excel-style explicit text escape and scalar input; formula dispatch is handled by the caller. */
export function parseXlsxInput(text: string): string | number | boolean {
  if (text.startsWith("'")) return text.slice(1)
  if (/^true$/i.test(text.trim())) return true
  if (/^false$/i.test(text.trim())) return false
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) {
    const number = Number(text.trim())
    if (Number.isFinite(number)) return number
  }
  return text
}
