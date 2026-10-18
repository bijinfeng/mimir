import { createStyles } from 'antd-style'
import { DOCUMENT_FONT_SIZE } from './DocumentPanel.style'

const DOCUMENT_COMMAND_NARROW_INPUT = 16

export const useStyles = createStyles(({ css, token, prefixCls }) => {
  return {
    fields: css`
      min-width: 0;
    `,
    label: css`
      display: block;
      margin-bottom: 8px;
      color: ${token.colorText};
      font-size: ${DOCUMENT_FONT_SIZE.path}px;
    `,
    input: css`
      && {
        border: 1px solid ${token.colorBorderSecondary};
        border-radius: 6px;
        background: ${token.colorBgContainer};
        color: ${token.colorText};
        padding: 8px 10px;
        min-width: 0;
        width: 100%;
        font-size: ${DOCUMENT_FONT_SIZE.path}px;
        line-height: 1.75;
        outline: none;
        box-shadow: none;
      }
      &&:focus,
      &&:focus-within {
        border-color: ${token.focusRing};
        box-shadow: 0 0 0 2px ${token.colorPrimaryBg};
      }
      &&.${prefixCls}-input-status-error {
        border-color: ${token.colorErrorText};
      }
      @media (max-width: 575px) {
        && {
          font-size: ${DOCUMENT_COMMAND_NARROW_INPUT}px;
          min-height: 40px;
        }
      }
    `,
    select: css`
      && {
        width: 100%;
        height: auto;
        padding: 8px 10px;
        border-color: ${token.colorBorderSecondary};
        background: ${token.colorBgContainer};
        font-size: ${DOCUMENT_FONT_SIZE.path}px;
        line-height: 1.75;
        align-items: center;
      }
      &&.${prefixCls}-select-focused {
        border-color: ${token.focusRing};
        box-shadow: 0 0 0 2px ${token.colorPrimaryBg};
      }
      @media (max-width: 575px) {
        && {
          font-size: ${DOCUMENT_COMMAND_NARROW_INPUT}px;
          min-height: 40px;
        }
      }
    `,
    help: css`
      margin: 8px 0 0;
      color: ${token.colorTextTertiary};
      font-size: ${DOCUMENT_FONT_SIZE.control}px;
      line-height: 1.7;
    `,
    error: css`
      margin: 12px 0 0;
      padding: 10px 12px;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: 6px;
      background: ${token.colorErrorBg};
      color: ${token.colorErrorText};
      overflow-wrap: anywhere;
      font-size: ${DOCUMENT_FONT_SIZE.path}px;
      line-height: 1.7;
    `,
    folderFeedback: css`
      padding: 10px 12px;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: ${DOCUMENT_FONT_SIZE.path}px;
      color: ${token.colorText};
    `,
    retry: css`
      && {
        margin-left: auto;
        color: ${token.colorLink};
        height: auto;
        padding: 0;
        font-size: inherit;
      }
    `,
  }
})
