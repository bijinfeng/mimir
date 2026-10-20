import { createStyles, keyframes } from 'antd-style'
import { FONT_SIZE } from '../../theme/tokens'

export const useCitationStyles = createStyles(({ css, token }) => {
  const reveal = keyframes`
    from { background-color: ${token.colorPrimaryBgHover}; }
    to { background-color: ${token.colorPrimaryBg}; }
  `
  return {
    demo: css`
      padding: 32px;
      min-width: 0;
      background: ${token.tintList};
      border-radius: 8px;
      @media (max-width: 700px) {
        padding: 24px;
      }
    `,
    question: css`
      font-size: ${FONT_SIZE.display}px;
      line-height: 1.5;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin-bottom: 28px;
      @media (max-width: 700px) {
        font-size: ${FONT_SIZE.settingsTitle}px;
        margin-bottom: 24px;
      }
    `,
    answer: css`
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 24px;
      & > svg {
        margin-top: 5px;
        color: ${token.colorLink};
      }
      & p {
        font-size: ${FONT_SIZE.reading}px;
        line-height: 1.9;
        color: ${token.colorText};
      }
    `,
    citation: css`
      width: 100%;
      height: auto;
      min-height: 48px;
      padding: 12px;
      background: ${token.colorPrimaryBg};
      color: ${token.colorLink};
      white-space: normal;
      text-align: left;
      justify-content: flex-start;
      & > span {
        flex: 1;
      }
      &:hover {
        background: ${token.colorPrimaryBgHover} !important;
        color: ${token.colorLink} !important;
      }
      & svg {
        flex: none;
      }
    `,
    source: css`
      margin-top: 16px;
      background: ${token.colorPrimaryBg};
      border-radius: ${token.borderRadius}px;
      padding: 16px;
      animation: ${reveal} 700ms cubic-bezier(0.16, 1, 0.3, 1);
      &[hidden] {
        display: none;
      }
      & blockquote {
        margin: 12px 0 0;
        color: ${token.colorText};
        font-size: ${FONT_SIZE.reading}px;
        line-height: 1.9;
      }
      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `,
    sourceHeading: css`
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: ${FONT_SIZE.meta}px;
      color: ${token.colorLink};
      & button {
        min-width: 44px;
        min-height: 44px;
      }
    `,
    label: css`
      margin-top: 16px !important;
      font-size: ${FONT_SIZE.meta}px !important;
      color: ${token.colorTextSecondary};
    `,
  }
})
