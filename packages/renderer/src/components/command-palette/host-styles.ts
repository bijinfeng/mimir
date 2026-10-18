import { createStyles } from 'antd-style'
import { SEARCH_TYPE, searchVisualTokens } from './approved-visual'

/** The approved result detail and document command dialogs share one 480px host. */
export const useHostStyles = createStyles(({ css, token, prefixCls, isDarkMode }) => {
  const visual = searchVisualTokens(isDarkMode)
  return {
    modal: css`
      padding-bottom: 0;
      max-width: calc(100vw - 16px);
      &&& {
        margin-top: 0;
      }
      color: ${token.colorText};
      font-size: ${SEARCH_TYPE.title}px;
      line-height: 1.75;
      .${prefixCls}-modal-container {
        padding: 24px;
        border-radius: 6px;
        background: ${token.colorBgContainer};
        box-shadow: ${visual.shadow};
        max-height: calc(100dvh - 14vh - 48px);
        display: flex;
        flex-direction: column;
      }
      .${prefixCls}-modal-header {
        margin-bottom: 18px;
        flex-shrink: 0;
        background: transparent;
      }
      .${prefixCls}-modal-title {
        padding-right: 24px;
        font-size: ${SEARCH_TYPE.modalTitle}px;
        font-weight: 600;
        line-height: 1.75;
      }
      .${prefixCls}-modal-body {
        min-height: 0;
        overflow-y: auto;
        font-size: ${SEARCH_TYPE.title}px;
        line-height: 1.75;
      }
      .${prefixCls}-modal-footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        flex-shrink: 0;
        margin-top: 24px;
      }
      .${prefixCls}-modal-footer > .${prefixCls}-btn {
        margin: 0;
      }
      .${prefixCls}-modal-close {
        top: 13px;
        right: 13px;
        width: 25px;
        height: 25px;
        color: ${token.colorTextTertiary};
      }
      .${prefixCls}-modal-close:focus-visible {
        outline: 2px solid ${token.focusRing};
        outline-offset: 2px;
      }
      svg {
        stroke-width: 1.65;
        flex: none;
      }
      @media (max-height: 360px) {
        top: 12px !important;
        .${prefixCls}-modal-container {
          max-height: calc(100dvh - 24px);
        }
      }
      @media (max-width: 575px), (pointer: coarse) {
        .${prefixCls}-modal-close {
          width: 44px;
          height: 44px;
          top: 6px;
          right: 6px;
        }
        .${prefixCls}-modal-title {
          padding-right: 36px;
        }
      }
    `,
    button: css`
      && {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: auto;
        padding: 7px 12px;
        border-radius: 6px;
        border-color: ${visual.field};
        background: ${token.colorBgContainer};
        color: ${token.colorText};
        font-size: ${SEARCH_TYPE.snippet}px;
        line-height: 18px;
        box-shadow: none;
      }
      &&:hover:enabled {
        border-color: ${token.colorTextTertiary};
        color: ${token.colorText};
      }
      &&:disabled {
        opacity: 0.48;
        cursor: not-allowed;
      }
      &&:focus-visible {
        outline: 2px solid ${token.focusRing};
        outline-offset: 2px;
      }
      @media (max-width: 575px), (pointer: coarse) {
        && {
          min-width: 44px;
          min-height: 44px;
        }
      }
    `,
    primary: css`
      && {
        background: ${token.colorPrimary};
        border-color: ${token.colorPrimary};
        color: ${token.colorTextLightSolid};
      }
      &&:hover:enabled {
        background: ${token.colorPrimaryHover};
        border-color: ${token.colorPrimaryHover};
        color: ${token.colorTextLightSolid};
      }
    `,
    detailTitle: css`
      margin: 0;
      font-weight: 500;
      font-size: ${SEARCH_TYPE.input}px;
      line-height: 1.8;
      overflow-wrap: anywhere;
    `,
    fullPath: css`
      display: flex;
      align-items: flex-start;
      gap: 8px;
      font-size: ${SEARCH_TYPE.label}px;
      color: ${token.colorTextTertiary};
      margin: 12px 0;
      overflow-wrap: anywhere;
      > svg {
        margin-top: 3px;
      }
    `,
    fullExcerpt: css`
      font-size: ${SEARCH_TYPE.title}px;
      line-height: 1.9;
      max-height: 250px;
      overflow: auto;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      margin: 18px 0 0;
    `,
  }
})
