import { createStyles } from 'antd-style'
import { FONT_SIZE, NAV_ITEM_HEIGHT, NAV_ITEM_MARGIN } from '../theme/tokens'

export const useStyles = createStyles(({ css, token, prefixCls }) => ({
  nav: css`
    position: relative;
    display: flex;
    min-width: 0;
    height: 100%;
    background: ${token.tintNav};
  `,
  rail: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    width: 52px;
    min-width: 52px;
    height: 100%;
    padding: 10px 5px 8px;
    background: ${token.colorBgLayout};
    border-inline-end: 1px solid ${token.colorBorderSecondary};
  `,
  railBrand: css`
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    margin-bottom: 13px;
    color: ${token.colorLink};
  `,
  railButton: css`
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    min-width: 38px;
    padding: 0;
    color: ${token.colorTextSecondary};
    border-radius: 9px;
    &:hover {
      color: ${token.colorLink};
    }
  `,
  railActive: css`
    color: ${token.colorLink};
    background: ${token.colorPrimaryBg};
    &:hover {
      background: ${token.colorPrimaryBg};
    }
  `,
  railSpacer: css`
    flex: 1;
  `,
  railFoot: css`
    width: 100%;
  `,
  panel: css`
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    background: ${token.tintNav};
    border-inline-end: 1px solid ${token.colorBorderSecondary};
  `,
  panelOverlay: css`
    position: absolute;
    z-index: 20;
    top: 0;
    bottom: 0;
    left: 52px;
    width: min(242px, calc(100vw - 52px));
    box-shadow: ${token.boxShadowSecondary};
  `,
  panelHeading: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    height: 54px;
    padding: 0 14px 0 18px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    color: ${token.colorText};
    font-size: ${FONT_SIZE.item}px;
    font-weight: 600;
  `,
  body: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px ${NAV_ITEM_MARGIN}px 6px;
  `,
  menu: css`
    background: transparent;
    border-inline-end: none !important;
    font-size: ${FONT_SIZE.item}px;

    .${prefixCls}-menu-item,
    .${prefixCls}-menu-submenu-title {
      height: ${NAV_ITEM_HEIGHT}px;
      line-height: ${NAV_ITEM_HEIGHT}px;
      width: 100% !important;
      margin: 1px 0;
      padding-inline: 8px !important;
      border-radius: 6px;
      color: ${token.colorTextSecondary};
    }
    .${prefixCls}-menu-item:hover {
      background: ${token.tintHover};
    }
    .${prefixCls}-menu-title-content {
      margin-inline-start: 0 !important;
    }
    .${prefixCls}-menu-item-label,
    .${prefixCls}-menu-item-extra {
      line-height: normal !important;
    }
    .${prefixCls}-menu-item-group-title {
      padding: 14px 8px 4px !important;
      color: ${token.colorTextTertiary};
      font-size: ${FONT_SIZE.badge}px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .${prefixCls}-menu-item-selected {
      background: ${token.colorPrimaryBg} !important;
      color: ${token.colorLink} !important;
      font-weight: 500;
    }
    .${prefixCls}-menu-item-selected::after {
      display: none;
    }
    .${prefixCls}-menu-item-icon {
      margin-inline-end: 8px;
      opacity: 0.72;
    }
    .${prefixCls}-menu-item-extra {
      margin-inline-start: 8px;
      color: ${token.colorTextTertiary};
      font-size: ${FONT_SIZE.badge}px;
      font-variant-numeric: tabular-nums;
    }
    .${prefixCls}-menu-item-selected .${prefixCls}-menu-item-extra {
      color: ${token.colorLink};
    }
  `,
  treeGroup: css`
    padding: 0;
  `,
  foot: css`
    flex: none;
    border-top: 1px solid transparent;
    &[data-scrolled] {
      border-top-color: ${token.colorBorderSecondary};
    }
  `,
  accountRow: css`
    display: flex;
    align-items: center;
    padding: 2px 6px 3px 0;
  `,
  accountRowCollapsed: css`
    flex-direction: column;
    gap: 4px;
    width: 100%;
    padding: 4px 0 5px;
  `,
  account: css`
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex: 1;
    gap: 8px;
    height: ${NAV_ITEM_HEIGHT}px;
    margin: 1px ${NAV_ITEM_MARGIN}px 4px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    text-align: left;
    transition:
      color 0.2s,
      background-color 0.2s;
  `,
  accountCollapsed: css`
    justify-content: center;
    flex: none;
    width: 38px;
    height: 38px;
    margin: 0;
    padding: 0;
  `,
  accountAvatar: css`
    flex: none;
    background: ${token.colorPrimaryBg};
    color: ${token.colorLink};
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 600;
  `,
  accountSettings: css`
    flex: none;
    width: 26px;
    height: 26px;
    min-width: 26px;
    padding: 0;
    color: ${token.colorTextTertiary};
  `,
  accountSettingsActive: css`
    color: ${token.colorLink};
    background: ${token.colorPrimaryBg};
  `,
  accountName: css`
    min-width: 0;
    overflow: hidden;
    color: ${token.colorText};
    font-size: ${FONT_SIZE.item}px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}))
