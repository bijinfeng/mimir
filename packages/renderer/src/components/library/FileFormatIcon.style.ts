import { createStyles } from 'antd-style'
import type { Appearance } from '../../theme/appearance'
import type { FileFormat } from './phosphor-file-icons/glyphs'

/** Local format roles from the approved revision 2 A palette, independent of status colors. */
export const FILE_FORMAT_COLORS: Record<Appearance, Record<FileFormat, string>> = {
  light: {
    word: '#4c75a6',
    excel: '#4b8562',
    powerpoint: '#ac7449',
    pdf: '#b45f5d',
    note: '#667c6c',
    image: '#4d8d85',
    audio: '#8a6ca5',
    video: '#6d75ae',
    web: '#4a82a0',
    html: '#4a82a0',
    wechat: '#4d9163',
    github: '#262a28',
    code: '#6679a3',
    archive: '#9a8557',
    text: '#646b67',
    unknown: '#646b67',
  },
  dark: {
    word: '#8aafd6',
    excel: '#8cbea0',
    powerpoint: '#d1a27e',
    pdf: '#dc9895',
    note: '#a3baaa',
    image: '#8cbdb6',
    audio: '#b5a0cd',
    video: '#a8afe0',
    web: '#8cb9d1',
    html: '#8cb9d1',
    wechat: '#8ac89d',
    github: '#e6e9e6',
    code: '#a5b3d7',
    archive: '#c6b588',
    text: '#a3aca5',
    unknown: '#a3aca5',
  },
}

export const useFileFormatIconStyles = createStyles(
  ({ css }, { color, size }: { color: string; size: number }) => ({
    icon: css`
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: ${size}px;
      height: ${size}px;
      vertical-align: middle;
      line-height: 0;
      color: ${color};

      > svg {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  }),
)
