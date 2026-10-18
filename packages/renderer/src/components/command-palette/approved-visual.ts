/** Frozen search review v1 (2026-10-18). These local roles intentionally do not
 * follow later global density changes; see visual-parity-audit.md. */
export const SEARCH_TYPE = {
  input: 14,
  title: 13,
  snippet: 12,
  label: 11,
  compact: 10,
  modalTitle: 16,
} as const

export function searchVisualTokens(dark: boolean) {
  return dark
    ? {
        nav: '#242629',
        hover: '#303337',
        selected: '#34383c',
        field: '#454b47',
        shadow: '0 16px 40px rgba(0, 0, 0, 0.36)',
      }
    : {
        nav: '#f7f9f8',
        hover: '#f4f5f5',
        selected: '#eff0f0',
        field: '#e7e9e8',
        shadow: '0 12px 32px rgba(0, 0, 0, 0.16)',
      }
}
