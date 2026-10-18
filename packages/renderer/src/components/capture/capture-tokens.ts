import { FONT_SIZE } from '../../theme/tokens'

/** Frozen capture-review-v1 revision2; local roles, not global density settings. */
export const CAPTURE_TYPE = {
  compact: 11,
  meta: 11.5,
  hint: 12,
  button: 13,
  item: FONT_SIZE.item,
  body: FONT_SIZE.body,
  title: FONT_SIZE.section,
  label: FONT_SIZE.note,
} as const
export function captureVisualTokens(dark: boolean) {
  return dark
    ? {
        link: '#6bdaa5',
        aside: '#1f2022',
        surface: '#202225',
        floating: '#26282b',
        muted: '#a0a5ac',
        line: '#3b3e43',
        field: '#454b47',
        hover: '#303337',
        selected: '#34383c',
        disabled: '#2d3031',
        disabledText: '#858b90',
        successBg: '#203b2c',
        success: '#8bceaa',
        warningBg: '#3c341f',
        warning: '#e8c16c',
        errorBg: '#432b2a',
        error: '#f2a49a',
        dropBorder: '#8b918d',
        fieldHover: '#b1b6b3',
        shadow: '0 12px 32px rgba(0,0,0,.2)',
      }
    : {
        link: '#007a45',
        aside: '#f7f8f8',
        surface: '#fff',
        floating: '#fff',
        muted: '#6b6b6b',
        line: '#e8e8e8',
        field: '#e7e9e8',
        hover: '#f4f5f5',
        selected: '#eff0f0',
        disabled: '#f4f5f5',
        disabledText: '#909692',
        successBg: '#edf7f1',
        success: '#27764a',
        warningBg: '#fff8e9',
        warning: '#85600a',
        errorBg: '#fff2f0',
        error: '#b94034',
        dropBorder: '#8b918d',
        fieldHover: '#b1b6b3',
        shadow: '0 12px 32px rgba(0,0,0,.2)',
      }
}
