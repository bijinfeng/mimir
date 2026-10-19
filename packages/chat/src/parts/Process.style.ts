import { createStyles } from 'antd-style'

/** Shared presentation only; reasoning and tool state remain protocol-owned. */
export const useProcessStyles = createStyles(({ css, token }) => ({
  root: css`
    min-width: 0;
    margin: 12px 0;
    color: ${token.colorTextSecondary};
    font-size: var(--mimir-chat-font-excerpt, 13px);
    line-height: 1.75;
    &:first-child {
      margin-top: 0;
    }
    &:last-child {
      margin-bottom: 0;
    }
  `,
  trigger: css`
    display: flex;
    align-items: center;
    gap: 7px;
    width: fit-content;
    max-width: 100%;
    min-height: 30px;
    padding: 3px 6px;
    margin-inline-start: -6px;
    border: 0;
    border-radius: ${token.borderRadius}px;
    background: transparent;
    color: ${token.colorTextSecondary};
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      color 0.12s ease-out,
      background-color 0.12s ease-out;
    &:hover {
      color: ${token.colorText};
      background: ${token.colorFillQuaternary};
    }
    &:focus-visible {
      outline: 2px solid ${token.focusRing ?? token.colorPrimaryBorder};
      outline-offset: 2px;
    }
    > svg {
      flex: none;
    }
    > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    > small {
      flex: none;
      color: ${token.colorTextTertiary};
      font-size: var(--mimir-chat-font-meta, 12px);
    }
    > svg:last-child {
      transition: transform 0.15s ease-out;
    }
    &[aria-expanded='true'] > svg:last-child {
      transform: rotate(180deg);
    }
    @media (pointer: coarse) {
      min-height: 44px;
    }
    @media (prefers-reduced-motion: reduce) {
      &,
      > svg {
        transition: none;
      }
    }
  `,
  content: css`
    min-width: 0;
    margin: 8px 0 4px 7px;
    padding: 0 0 0 16px;
    border-inline-start: 1px solid ${token.colorBorderSecondary};
    font-size: var(--mimir-chat-font-excerpt, 13px);
    line-height: 1.8;
    overflow-wrap: anywhere;
    &:focus-visible,
    pre:focus-visible {
      outline: 2px solid ${token.focusRing ?? token.colorPrimaryBorder};
      outline-offset: -2px;
    }
    small {
      color: ${token.colorTextTertiary};
      font-size: var(--mimir-chat-font-meta, 12px);
    }
    pre {
      max-height: 240px;
      max-width: 100%;
      margin: 6px 0 12px;
      padding: 10px 12px;
      border: 0;
      border-radius: ${token.borderRadius}px;
      overflow: auto;
      background: ${token.colorFillQuaternary};
      color: ${token.colorTextSecondary};
      font-family: ${token.fontFamilyCode};
      font-size: var(--mimir-chat-font-meta, 12px);
      line-height: 1.7;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `,
  reasoning: css`
    max-height: 240px;
    overflow: auto;
    overscroll-behavior: contain;
  `,
  group: css`
    min-width: 0;
    margin: 8px 0 0 7px;
    padding-inline-start: 16px;
    border-inline-start: 1px solid ${token.colorBorderSecondary};
  `,
}))
