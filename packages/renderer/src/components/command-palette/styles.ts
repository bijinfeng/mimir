import { createStyles } from 'antd-style'
import { FONT_SIZE } from '../../theme/tokens'

export const useStyles = createStyles(({ css, token, prefixCls }) => ({
  modal: css`
    padding-bottom: 0;
    @media (max-height: 540px), (max-width: 575px) {
      top: 12px !important;
      margin-bottom: 12px;
    }
  `,
  panel: css`
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 14vh - 24px);
    min-height: 0;
    @media (max-height: 540px), (max-width: 575px) {
      max-height: calc(100dvh - 24px);
    }
  `,
  searchRow: css`
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
    padding: 10px 12px;
    border-bottom: 1px solid ${token.colorSplit};
    .${prefixCls}-input-affix-wrapper {
      min-width: 0;
      padding: 7px 4px;
      box-shadow: none;
      font-size: ${FONT_SIZE.body}px;
    }
    .${prefixCls}-input-prefix {
      color: ${token.colorTextTertiary};
      margin-inline-end: 10px;
    }
  `,
  iconButton: css`
    flex: none;
    color: ${token.colorTextSecondary};
    @media (pointer: coarse), (max-width: 575px) {
      min-width: 44px;
      min-height: 44px;
    }
  `,
  list: css`
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px 8px 10px;
    scrollbar-color: ${token.colorBorder} transparent;
    scrollbar-width: thin;
  `,
  sectionLabel: css`
    padding: 10px 10px 6px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
    font-weight: 500;
  `,
  row: css`
    position: relative;
  `,
  item: css`
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 9px 10px;
    border: 0;
    border-radius: ${token.borderRadiusSM}px;
    background: transparent;
    color: ${token.colorText};
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    &:hover:enabled {
      background: ${token.colorFillQuaternary};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimaryBorder};
      outline-offset: -1px;
    }
    &:disabled {
      cursor: default;
      color: ${token.colorTextDisabled};
    }
  `,
  documentItem: css`
    padding-inline-end: 44px;
  `,
  itemActive: css`
    background: ${token.colorFillTertiary};
    & [data-role='title'] {
      font-weight: 500;
    }
  `,
  itemIcon: css`
    flex: none;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    color: ${token.colorTextSecondary};
  `,
  itemMain: css`
    flex: 1;
    min-width: 0;
  `,
  itemTitle: css`
    display: block;
    font-size: ${FONT_SIZE.item}px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  itemSub: css`
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-top: 3px;
    font-size: ${FONT_SIZE.meta}px;
    line-height: 1.6;
    color: ${token.colorTextSecondary};
    overflow-wrap: anywhere;
  `,
  path: css`
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 4px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
  `,
  detailButton: css`
    position: absolute;
    inset-inline-end: 2px;
    top: 7px;
    @media (pointer: coarse), (max-width: 575px) {
      min-width: 44px;
      min-height: 44px;
      top: 2px;
    }
  `,
  detail: css`
    padding: 10px 12px;
    margin: 2px 8px 8px;
    border-radius: ${token.borderRadiusSM}px;
    background: ${token.colorFillQuaternary};
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.meta}px;
    line-height: 1.65;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  `,
  status: css`
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
    padding: 8px 10px;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextSecondary};
    .${prefixCls}-btn {
      @media (pointer: coarse), (max-width: 575px) {
        min-height: 44px;
      }
    }
  `,
  aiRow: css`
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px 12px;
    padding: 10px 18px;
    border-top: 1px solid ${token.colorSplit};
    background: ${token.tintNav};
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.meta}px;
    .${prefixCls}-btn {
      @media (pointer: coarse), (max-width: 575px) {
        min-height: 44px;
      }
    }
  `,
  aiLabel: css`
    display: inline-flex;
    align-items: center;
    gap: 8px;
  `,
  foot: css`
    display: flex;
    flex: none;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 9px 18px;
    border-top: 1px solid ${token.colorSplit};
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
    & > span {
      white-space: nowrap;
    }
  `,
  kbd: css`
    font-family: ${token.fontFamilyCode};
    font-size: inherit;
    margin-inline-end: 4px;
    padding: 0 4px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 3px;
  `,
  srOnly: css`
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  `,
}))
