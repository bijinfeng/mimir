import { createStyles } from 'antd-style'
import { SEARCH_TYPE, searchVisualTokens } from '../command-palette/approved-visual'

export const useStyles = createStyles(({ css, token, prefixCls, isDarkMode }) => {
  const visual = searchVisualTokens(isDarkMode)
  return {
    fields: css`
      min-width: 0;
    `,
    subtitle: css`
      font-size: ${SEARCH_TYPE.label}px;
      color: ${token.colorTextTertiary};
      margin: -10px 0 18px;
      overflow-wrap: anywhere;
    `,
    label: css`
      display: block;
      margin-bottom: 8px;
      color: ${token.colorText};
      font-size: ${SEARCH_TYPE.snippet}px;
    `,
    input: css`
      && {
        border: 1px solid ${visual.field};
        border-radius: 6px;
        background: ${token.colorBgContainer};
        color: ${token.colorText};
        padding: 8px 10px;
        min-width: 0;
        width: 100%;
        font-size: ${SEARCH_TYPE.title}px;
        line-height: 1.75;
        outline: none;
        box-shadow: none;
      }
      &&:focus,
      &&:focus-within {
        border-color: ${token.focusRing};
        box-shadow: none;
      }
      &&.${prefixCls}-input-status-error {
        border-color: ${token.colorErrorText};
      }
    `,
    select: css`
      && {
        width: 100%;
        height: auto;
        padding: 8px 10px;
        border-color: ${visual.field};
        background: ${token.colorBgContainer};
        font-size: ${SEARCH_TYPE.title}px;
        line-height: 1.75;
        align-items: center;
      }
      &&.${prefixCls}-select-focused {
        border-color: ${token.focusRing};
        box-shadow: none;
      }
    `,
    help: css`
      margin: 8px 0 0;
      color: ${token.colorTextTertiary};
      font-size: ${SEARCH_TYPE.label}px;
      line-height: 1.7;
    `,
    path: css`
      margin: 8px 0 0;
      color: ${token.colorTextTertiary};
      overflow-wrap: anywhere;
      font-size: ${SEARCH_TYPE.label}px;
      line-height: 1.7;
    `,
    error: css`
      margin-top: 12px;
      margin-bottom: 0;
      color: ${token.colorErrorText};
      overflow-wrap: anywhere;
      font-size: ${SEARCH_TYPE.snippet}px;
      line-height: 1.7;
    `,
    folderFeedback: css`
      padding: 20px 12px;
      border: 1px solid ${visual.field};
      border-radius: 5px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: ${SEARCH_TYPE.snippet}px;
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
