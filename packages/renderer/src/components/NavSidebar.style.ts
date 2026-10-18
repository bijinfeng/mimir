import { createStyles } from 'antd-style'
import {
  FONT_SIZE,
  NAV_ITEM_HEIGHT,
  NAV_ITEM_MARGIN,
  NAV_NARROW_QUERY,
  PANEL_HEADER_HEIGHT,
} from '../theme/tokens'

export const useStyles = createStyles(({ css, token, prefixCls }) => ({
  nav: css`
    position: relative;
    display: flex;
    min-width: 0;
    height: 100%;
    background: ${token.tintNav};
    border-inline-end: 1px solid ${token.colorBorderSecondary};
  `,
  rail: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 10px 3px 8px;
    background: ${token.tintNav};
  `,
  railBrand: css`
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    margin-bottom: 4px;
    color: ${token.navSelectedText};
  `,
  railButton: css`
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    min-width: 38px;
    padding: 0;
    color: ${token.colorTextSecondary};
    border-radius: 6px;
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      width: 44px;
      height: 44px;
      min-width: 44px;
    }
    &:hover {
      color: ${token.navSelectedText};
    }
  `,
  railActive: css`
    && {
      color: ${token.navSelectedText};
      background: ${token.navSelectedBg};
      font-weight: 600;
    }
    &&:hover {
      color: ${token.navSelectedText};
      background: ${token.navSelectedBg};
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
    height: 100%;
  `,
  panelHeading: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: none;
    height: ${PANEL_HEADER_HEIGHT}px;
    padding: 0 8px 0 16px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
    color: ${token.colorText};
    font-size: ${FONT_SIZE.body}px;
    font-weight: 600;
  `,
  brand: css`
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: ${FONT_SIZE.section}px;
    font-weight: 600;
    color: ${token.colorText};
  `,
  primaryActions: css`
    display: grid;
    gap: 4px;
    flex: none;
    padding: 12px 8px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  primaryButton: css`
    justify-content: flex-start;
    gap: 8px;
    height: 36px;
    padding-inline: 12px;
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      height: 44px;
    }
    color: ${token.colorTextSecondary};
    text-align: left;
  `,
  searchButton: css`
    justify-content: flex-start;
    height: 36px;
    margin-bottom: 4px;
    padding-inline: 12px;
    color: ${token.colorTextSecondary};
    background: ${token.colorBgContainer};
    border-color: ${token.colorBorderSecondary};
    box-shadow: none;
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      height: 44px;
    }
  `,
  searchLabel: css`
    min-width: 0;
    flex: 1;
    text-align: left;
  `,
  searchShortcut: css`
    flex: none;
    padding: 1px 5px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 4px;
    color: ${token.colorTextTertiary};
    background: ${token.tintNav};
    font-family: inherit;
    font-size: ${FONT_SIZE.meta}px;
    line-height: 1.5;
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      display: none;
    }
  `,
  body: css`
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px ${NAV_ITEM_MARGIN}px 6px;
  `,
  recentGroup: css`
    margin-top: 10px;
  `,
  recentHeading: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: ${NAV_ITEM_HEIGHT}px;
    padding: 0 8px;
    color: ${token.colorTextTertiary};
    font-size: ${FONT_SIZE.note}px;
    font-weight: 400;
    text-align: left;
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      height: 44px;
    }

    &:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: 2px;
    }
  `,
  recentList: css`
    display: grid;
    gap: 2px;
  `,
  recentItem: css`
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
    height: ${NAV_ITEM_HEIGHT}px;
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      height: 44px;
    }
    padding: 0 8px;
    font-size: ${FONT_SIZE.body}px;
    text-align: left;
    color: ${token.colorTextSecondary};
    > svg {
      flex: none;
      opacity: 0.72;
    }
    > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    &[aria-current='page'] {
      color: ${token.navSelectedText};
      background: ${token.navSelectedBg};
      font-weight: 600;
    }
    &&[aria-current='page']:hover {
      color: ${token.navSelectedText};
      background: ${token.navSelectedBg};
    }
    &:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: 2px;
    }
  `,
  recentEmpty: css`
    display: block;
    padding: 4px 8px 6px;
    color: ${token.colorTextTertiary};
    font-size: ${FONT_SIZE.note}px;
  `,
  conversationEmpty: css`
    margin: 0;
    padding: 4px 8px 6px;
    color: ${token.colorTextTertiary};
    font-size: ${FONT_SIZE.note}px;
  `,
  queryFeedback: css`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding-inline: 8px;
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.note}px;
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      button { min-height: 44px; }
    }
  `,
  accountMenuError: css`
    max-width: min(212px, calc(100vw - 16px));
    margin: 4px 0 0;
    padding: 8px 12px;
    border-radius: ${token.borderRadius}px;
    background: ${token.colorBgElevated};
    color: ${token.colorErrorText};
    font-size: ${FONT_SIZE.note}px;
  `,
  menu: css`
    background: transparent;
    border-inline-end: none !important;
    font-size: ${FONT_SIZE.body}px;

    .${prefixCls}-menu-item,
    .${prefixCls}-menu-submenu-title {
      height: ${NAV_ITEM_HEIGHT}px;
      line-height: ${NAV_ITEM_HEIGHT}px;
      width: 100% !important;
      margin: 1px 0;
      padding-inline: 8px !important;
      border-radius: 6px;
      color: ${token.colorTextSecondary};
      @media (pointer: coarse), ${NAV_NARROW_QUERY} {
        height: 44px;
        line-height: 44px;
      }
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
      display: flex;
      align-items: center;
      height: ${NAV_ITEM_HEIGHT}px;
      margin-top: 10px;
      padding: 0 8px !important;
      color: ${token.colorTextTertiary};
      font-size: ${FONT_SIZE.note}px;
      font-weight: 400;
    }
    .${prefixCls}-menu-item-selected {
      background: ${token.navSelectedBg} !important;
      color: ${token.navSelectedText} !important;
      font-weight: 600;
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
      color: ${token.navSelectedText};
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
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    padding: 8px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
  accountRowCollapsed: css`
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 4px 0 5px;
    border-top: 0;
  `,
  account: css`
    display: flex;
    align-items: center;
    justify-content: flex-start;
    flex: none;
    gap: 8px;
    width: 100%;
    height: ${NAV_ITEM_HEIGHT}px;
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      height: 44px;
    }
    margin: 0;
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
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      width: 44px;
      height: 44px;
    }
  `,
  accountAvatar: css`
    flex: none;
    background: ${token.navSelectedBg};
    color: ${token.navSelectedText};
    font-size: ${FONT_SIZE.badge}px;
    font-weight: 600;
  `,
  accountSettings: css`
    flex: none;
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
    height: ${NAV_ITEM_HEIGHT}px;
    padding: 0 8px;
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.body}px;
    .${prefixCls}-btn-icon {
      display: inline-flex;
      justify-content: center;
      width: 26px;
    }
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      height: 44px;
    }
  `,
  accountSettingsActive: css`
    color: ${token.navSelectedText};
    background: ${token.navSelectedBg};
  `,
  accountName: css`
    min-width: 0;
    overflow: hidden;
    color: ${token.colorText};
    font-size: ${FONT_SIZE.body}px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  accountMenuPopup: css`
    &.${prefixCls}-dropdown {
      width: min(212px, calc(100vw - 16px));
      max-width: calc(100vw - 16px);
    }
    @media (pointer: coarse), ${NAV_NARROW_QUERY} {
      &.${prefixCls}-dropdown {
        width: min(224px, calc(100vw - 16px));
      }
    }
    @media (max-width: 370px) {
      &.${prefixCls}-dropdown-menu-submenu-popup {
        left: auto !important;
        right: 8px;
      }
    }
    &.${prefixCls}-dropdown-menu-submenu-popup {
      overflow: hidden;
      background: ${token.colorBgElevated};
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadiusLG}px;
      box-shadow: ${token.boxShadowSecondary};
    }
    &.${prefixCls}-dropdown-menu-submenu-popup .${prefixCls}-dropdown-menu {
      min-width: 136px;
      background: transparent;
      border: 0;
      box-shadow: none;
    }
    .${prefixCls}-dropdown-menu {
      min-width: 0;
      max-width: calc(100vw - 16px);
      padding: 0 4px 4px;
      background: ${token.colorBgElevated};
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: ${token.borderRadiusLG}px;
      box-shadow: ${token.boxShadowSecondary};
    }
    && .${prefixCls}-dropdown-menu-item-group-title {
      padding: 0;
      line-height: normal;
    }
    && .${prefixCls}-dropdown-menu-item-group-list {
      margin: 3px 0 0;
    }
    && .${prefixCls}-dropdown-menu-item,
    && .${prefixCls}-dropdown-menu-submenu-title {
      display: flex;
      align-items: center;
      min-height: 32px;
      padding: 5px 8px;
      border-radius: ${token.borderRadiusSM}px;
      color: ${token.colorText};
      font-size: ${FONT_SIZE.body}px;
      line-height: 1.4;
      @media (pointer: coarse), ${NAV_NARROW_QUERY} {
        min-height: 44px;
      }
    }
    .${prefixCls}-dropdown-menu-item-icon {
      display: inline-flex;
      align-items: center;
      color: ${token.colorTextSecondary};
    }
    .${prefixCls}-dropdown-menu-item-danger {
      color: ${token.colorErrorText};
    }
    .${prefixCls}-dropdown-menu-item-danger .${prefixCls}-dropdown-menu-item-icon {
      color: ${token.colorErrorText};
    }
    .${prefixCls}-dropdown-menu-item-active,
    .${prefixCls}-dropdown-menu-submenu-active > .${prefixCls}-dropdown-menu-submenu-title {
      background: ${token.colorFillTertiary};
    }
    .${prefixCls}-dropdown-menu-item:focus-visible,
    .${prefixCls}-dropdown-menu-submenu-title:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: 2px;
    }
    .${prefixCls}-dropdown-menu-item-divider {
      margin: 3px 8px;
      background: ${token.colorBorderSecondary};
    }
  `,
  accountMenuIdentity: css`
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 8px 8px 7px;
    border-bottom: 1px solid ${token.colorBorderSecondary};
  `,
  accountMenuIdentityText: css`
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
    > span:focus-visible {
      outline: 2px solid ${token.focusRing};
      outline-offset: 2px;
    }
  `,
  accountMenuName: css`
    overflow: hidden;
    color: ${token.colorText};
    font-size: ${FONT_SIZE.body}px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  accountMenuEmail: css`
    overflow: hidden;
    color: ${token.colorTextTertiary};
    font-size: ${FONT_SIZE.note}px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}))
