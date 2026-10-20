import { FONT_SIZE } from '@mimir/renderer/titlebar-kit'
import { createStyles } from 'antd-style'

export const useStyles = createStyles(({ css, token }) => ({
  page: css`
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: ${token.colorText};
    background: ${token.colorBgContainer};
    font-size: ${FONT_SIZE.body}px;
  `,
  body: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 24px;
    overflow-wrap: anywhere;
    @media (max-width: 420px) {
      padding: 20px 16px;
    }
  `,
  /**
   * 短内容在剩余高度里成组居中；说明变长时自动外边距归零，正文从顶部滚动。
   * 页脚在 body 之外，始终留在窗口底部。
   */
  content: css`
    flex: none;
    width: 100%;
    margin-block: auto;
  `,
  heading: css`
    margin: 0 0 4px;
    font-size: ${FONT_SIZE.pageTitle}px;
    font-weight: 600;
  `,
  meta: css`
    margin: 0;
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.meta}px;
    font-variant-numeric: tabular-nums;
  `,
  status: css`
    margin-top: 28px;
    h2 {
      margin: 0 0 8px;
      font-size: ${FONT_SIZE.section}px;
      font-weight: 600;
      line-height: 1.5;
    }
    p {
      margin: 0;
      line-height: 1.7;
      color: ${token.colorTextSecondary};
    }
  `,
  progress: css`
    margin-top: 16px;
    font-variant-numeric: tabular-nums;
  `,
  error: css`
    margin-top: 12px;
    color: ${token.colorErrorText};
    line-height: 1.7;
    overflow-wrap: anywhere;
  `,
  notes: css`
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid ${token.colorBorderSecondary};
    h3 {
      margin: 0 0 8px;
      font-size: ${FONT_SIZE.body}px;
      font-weight: 600;
    }
  `,
  releaseText: css`
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: ${FONT_SIZE.body}px;
    line-height: 1.7;
    color: ${token.colorText};
  `,
  preference: css`
    display: flex;
    align-items: flex-start;
    gap: 16px;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid ${token.colorBorderSecondary};
    > div {
      flex: 1;
      min-width: 0;
    }
    label {
      display: block;
      margin-bottom: 4px;
    }
  `,
  footer: css`
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid ${token.colorBorderSecondary};
    background: ${token.colorBgContainer};
    > div {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    @media (max-width: 420px) {
      padding: 12px 16px;
    }
  `,
}))
