import { createStyles } from 'antd-style'

export const DOCUMENT_DIALOG_TYPE = { body: 13, heading: 17, narrowHeading: 15 } as const
const DOCUMENT_NARROW_NAV_WIDTH = 52

/** Shared document-review-v1 command and leave dialog geometry. */
export const useDocumentDialogStyles = createStyles(({ css, token, prefixCls }) => ({
  modal: css`
    padding-bottom: 0;
    && {
      max-width: calc(100vw - 20px);
      margin-inline: auto;
    }
    top: 56px;
    color: ${token.colorText};
    font-size: ${DOCUMENT_DIALOG_TYPE.body}px;
    line-height: 1.6;
    && .${prefixCls}-modal-container {
      padding: 24px;
      border-radius: 12px;
      background: ${token.colorBgContainer};
      box-shadow: ${token.boxShadowSecondary};
      max-height: calc(100dvh - 76px);
      display: flex;
      flex-direction: column;
    }
    && .${prefixCls}-modal-header {
      margin-bottom: 16px;
      flex: none;
      background: transparent;
    }
    && .${prefixCls}-modal-title {
      padding: 0;
      font-size: ${DOCUMENT_DIALOG_TYPE.heading}px;
      font-weight: 600;
      line-height: 1.6;
    }
    && .${prefixCls}-modal-body {
      min-height: 0;
      overflow-y: auto;
      font-size: ${DOCUMENT_DIALOG_TYPE.body}px;
      line-height: 1.75;
    }
    && .${prefixCls}-modal-footer {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
      flex: none;
      margin-top: 24px;
    }
    && .${prefixCls}-modal-footer > .${prefixCls}-btn {
      margin: 0;
    }
    svg {
      flex: none;
      stroke-width: 1.65;
    }
    @media (max-width: 700px) {
      && {
        top: 36px !important;
        max-width: calc(100vw - ${DOCUMENT_NARROW_NAV_WIDTH + 20}px);
        margin-inline: ${DOCUMENT_NARROW_NAV_WIDTH + 10}px 10px;
        margin-block: 0;
      }
      && .${prefixCls}-modal-container {
        padding: 18px;
        max-height: calc(100dvh - 56px);
      }
      && .${prefixCls}-modal-title {
        font-size: ${DOCUMENT_DIALOG_TYPE.narrowHeading}px;
      }
      && .${prefixCls}-modal-footer {
        margin-top: 12px;
      }
    }
    @media (max-width: 480px) {
      && {
        top: 24px !important;
      }
    }
    @media (max-height: 360px) {
      && {
        top: 12px !important;
      }
      && .${prefixCls}-modal-container {
        max-height: calc(100dvh - 24px);
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
      min-height: 32px;
      padding: 5px 10px;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: 6px;
      background: ${token.colorBgContainer};
      color: ${token.colorText};
      font-size: ${DOCUMENT_DIALOG_TYPE.body}px;
      line-height: 20px;
      box-shadow: none;
    }
    &&:hover:enabled {
      color: ${token.colorText};
      background: ${token.colorFillQuaternary};
      border-color: ${token.colorBorderSecondary};
    }
    &&:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    &&:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: 2px;
    }
    @media (max-width: 575px), (pointer: coarse) {
      && {
        min-height: 40px;
      }
    }
  `,
  primary: css`
    && {
      background: ${token.colorPrimary};
      border-color: transparent;
      color: ${token.colorTextLightSolid};
    }
    &&:hover:enabled {
      background: ${token.colorPrimaryHover};
      border-color: transparent;
      color: ${token.colorTextLightSolid};
    }
  `,
}))
