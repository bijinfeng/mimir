/** Local typography in the approved library revision2; does not redefine the app theme. */
export const LIBRARY_FONT_SIZE = {
  badge: 11,
  meta: 12,
  item: 13,
  body: 14,
  onboard: 20,
  narrowTitle: 25,
  dialogTitle: 15,
  field: 16,
} as const

/** Frozen library-review-v1 revision2 surfaces; kept local to this approved module. */
export function libraryVisualTokens(dark: boolean) {
  return dark
    ? {
        fieldFocusBorder: '#89978e',
        fieldFocusOutline: '#a9b2ad38',
        bg: '#1f2220',
        subtle: '#171a18',
        hover: '#2d322e',
        border: '#373d38',
        text: '#e6e9e6',
        secondary: '#a3aca5',
        focus: '#88978c',
        accent: '#83ba91',
        accentBg: '#263b2c',
        danger: '#efa19a',
        errorBg: '#3b2827',
        scroll: '#5f6d63',
        shadow: '0 8px 32px #0005',
        primaryText: '#142419',
      }
    : {
        fieldFocusBorder: '#89978e',
        fieldFocusOutline: '#a9b2ad38',
        bg: '#ffffff',
        subtle: '#f6f7f7',
        hover: '#f1f3f2',
        border: '#e8e9e9',
        text: '#262a28',
        secondary: '#646b67',
        focus: '#a9b2ad',
        accent: '#34794d',
        accentBg: '#edf5ef',
        danger: '#ac3a35',
        errorBg: '#fff3f1',
        scroll: '#bbc2be',
        shadow: '0 8px 32px #17291e1f',
        primaryText: '#ffffff',
      }
}
