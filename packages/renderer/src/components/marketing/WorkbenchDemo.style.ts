import { createStyles } from 'antd-style'
import { FONT_SIZE } from '../../theme/tokens'

export const useWorkbenchStyles = createStyles(({ css, token }) => ({
  frame: css`
    display: grid;
    grid-template-columns: 212px minmax(0, 1fr) 280px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    overflow: hidden;
    background: ${token.surfaceContent};
    font-size: ${FONT_SIZE.body}px;
    line-height: 1.65;
    @media (max-width: 1100px) {
      grid-template-columns: 190px minmax(0, 1fr);
    }
    @media (max-width: 700px) {
      grid-template-columns: minmax(0, 1fr);
    }
  `,
  sidebar: css`
    background: ${token.tintNav};
    border-right: 1px solid ${token.colorBorderSecondary};
    padding: 16px 10px;
    display: flex;
    flex-direction: column;
    min-width: 0;
    @media (max-width: 700px) {
      display: none;
    }
  `,
  brand: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px 24px;
    font-size: ${FONT_SIZE.section}px;
  `,
  navItem: css`
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.item}px;
  `,
  selected: css`
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    border-radius: ${token.borderRadius}px;
    font-weight: 600;
    color: ${token.navSelectedText};
    background: ${token.navSelectedBg};
  `,
  groupLabel: css`
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextSecondary};
    padding: 24px 10px 8px;
  `,
  documents: css`
    padding-left: 12px;
  `,
  document: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 6px;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextSecondary};
    & > span:last-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  documentSelected: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 6px;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorText};
    background: ${token.navSelectedBg};
    border-radius: ${token.borderRadius}px;
    font-weight: 600;
    & > span:last-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  sidebarFoot: css`
    margin-top: auto;
    padding: 24px 10px 4px;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextSecondary};
  `,
  reading: css`
    min-width: 0;
  `,
  toolbar: css`
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
    height: 48px;
    padding-inline: 20px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.meta}px;
    & > span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  paper: css`
    padding: 36px 40px 44px;
    & h2 {
      font-size: ${FONT_SIZE.display}px;
      line-height: 1.4;
      margin-bottom: 8px;
      letter-spacing: -0.02em;
    }
    & .tiptap {
      outline: none;
      font-size: ${FONT_SIZE.reading}px;
      line-height: 1.9;
    }
    & .tiptap p,
    & .tiptap ul {
      margin: 16px 0;
      color: ${token.colorText};
    }
    & .tiptap ul {
      padding-left: 22px;
    }
    & .tiptap h2 {
      margin: 28px 0 12px;
      font-size: ${FONT_SIZE.section}px;
      letter-spacing: normal;
    }
    @media (max-width: 700px) {
      padding: 28px 24px;
    }
  `,
  meta: css`
    font-size: ${FONT_SIZE.meta}px !important;
    color: ${token.colorTextSecondary};
  `,
  assistant: css`
    border-left: 1px solid ${token.colorBorderSecondary};
    @media (max-width: 1100px) {
      display: none;
    }
  `,
  conversation: css`
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    gap: 24px;
    & p {
      color: ${token.colorText};
      font-size: ${FONT_SIZE.body}px;
      line-height: 1.9;
    }
  `,
  prompt: css`
    padding: 12px 14px;
    background: ${token.tintList};
    border-radius: ${token.borderRadius}px;
  `,
  quote: css`
    border-top: 1px solid ${token.colorBorderSecondary};
    padding-top: 16px;
    & > span {
      color: ${token.colorLink};
      font-size: ${FONT_SIZE.meta}px;
    }
    & blockquote {
      margin: 8px 0 0;
      font-size: ${FONT_SIZE.note}px;
      color: ${token.colorTextSecondary};
      line-height: 1.8;
    }
  `,
}))
