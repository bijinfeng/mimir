import { createStyles } from 'antd-style'

export const useCodeBlockStyles = createStyles(({ css, token }) => ({
  frame: css`
    min-width: 0;
    max-width: 100%;
    margin: 16px 0;
    overflow: hidden;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    background: ${token.colorFillQuaternary};
    /* The frame owns its border and seam; Markdown owns prose only. */
    &&[data-code-frame] pre {
      margin: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      padding: 14px 16px;
      overflow: auto;
      line-height: 1.75;
      font-family: ${token.fontFamilyCode};
      font-size: var(--mimir-chat-font-excerpt, 13px);
      &:focus-visible {
        outline: 2px solid ${token.focusRing ?? token.colorPrimaryBorder};
        outline-offset: -2px;
      }
      code {
        padding: 0;
        background: transparent;
        color: ${token.colorText};
      }
    }
  `,
  bar: css`
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 3px 10px 3px 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    font-size: var(--mimir-chat-font-meta, 12px);
    color: ${token.colorTextSecondary};
  `,
  lang: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  copy: css`
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: ${token.borderRadius}px;
    background: transparent;
    color: ${token.colorTextSecondary};
    cursor: pointer;
    &:hover {
      color: ${token.colorText};
      background: ${token.colorFillTertiary};
    }
    &:focus-visible {
      outline: 2px solid ${token.focusRing ?? token.colorPrimaryBorder};
      outline-offset: 2px;
    }
    svg {
      grid-area: 1 / 1;
      transition: opacity 0.12s ease-out;
    }
    svg + svg {
      opacity: 0;
    }
    &[data-copied] svg {
      opacity: 0;
    }
    &[data-copied] svg + svg {
      opacity: 1;
    }
    @media (pointer: coarse) {
      width: 40px;
      height: 40px;
    }
    @media (prefers-reduced-motion: reduce) {
      svg {
        transition: none;
      }
    }
  `,
}))
