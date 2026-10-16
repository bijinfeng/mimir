import type { Appearance } from './appearance'

/** Product roles that are independent from antd brand/semantic states. */
export interface MimirCustomToken {
  /** Auxiliary surfaces: sidebar, list and outline. */
  tintList: string
  tintNav: string
  tintHover: string
  /** Navigation selection stays neutral; editor pressed states stay semantic green. */
  navSelectedBg: string
  navSelectedText: string
  /** Main reading/workspace surface, distinct from dark cards and inputs. */
  surfaceContent: string
  /** Visible keyboard ring; 2px with 2px offset at the consuming control. */
  focusRing: string
  inlineCodeFg: string
  highlightBg: string
  heatL1: string
  heatL2: string
  heatL3: string
  heatL4: string
}

declare module 'antd-style' {
  export interface CustomToken extends MimirCustomToken {}
}

const LIGHT: MimirCustomToken = {
  tintList: '#f7f8f8',
  tintNav: '#f7f8f8',
  tintHover: '#e9ebeb',
  navSelectedBg: '#eff0f0',
  navSelectedText: '#262626',
  surfaceContent: '#ffffff',
  focusRing: '#00834d',
  inlineCodeFg: '#b42349',
  highlightBg: '#fff3b0',
  heatL1: '#b5ddc7',
  heatL2: '#79bd98',
  heatL3: '#329666',
  heatL4: '#007a45',
}

const DARK: MimirCustomToken = {
  tintList: '#1f2022',
  tintNav: '#1f2022',
  tintHover: '#303235',
  navSelectedBg: '#303235',
  navSelectedText: '#eceeef',
  surfaceContent: '#18191a',
  focusRing: '#6bdaa5',
  inlineCodeFg: '#ffa6b4',
  highlightBg: '#4a3c10',
  heatL1: '#28543e',
  heatL2: '#347b56',
  heatL3: '#60b784',
  heatL4: '#a4e6be',
}

/** Chosen once by MimirProvider; component styles consume roles without branching. */
export function customTokenFor(appearance: Appearance): MimirCustomToken {
  return appearance === 'dark' ? DARK : LIGHT
}

export const mimirCustomToken = LIGHT
export const mimirDarkCustomToken = DARK
