import { createStyles } from 'antd-style'
import { SEARCH_TYPE, searchVisualTokens } from './approved-visual'

export const useStyles = createStyles(({ css, token, prefixCls, isDarkMode }) => {
  const visual = searchVisualTokens(isDarkMode)
  return {
    modal: css`
      padding-bottom: 0;
      max-width: calc(100vw - 16px);
      &&& {
        margin-top: 0;
      }
      .${prefixCls}-modal-container {
        background: ${token.colorBgContainer};
        border-radius: 6px;
        box-shadow: ${visual.shadow};
      }
      svg {
        stroke-width: 1.65;
        flex: none;
      }
      @media (max-height: 360px) {
        top: 12px !important;
        margin-bottom: 12px;
      }
    `,
    panel: css`
      display: flex;
      flex-direction: column;
      max-height: calc(100dvh - 14vh - 24px);
      min-height: 0;
      color: ${token.colorText};
      @media (max-width: 575px) {
        max-height: calc(100dvh - 14vh - 48px);
      }
      @media (max-height: 360px) {
        max-height: calc(100dvh - 24px);
      }
    `,
    searchRow: css`
      display: flex;
      flex: none;
      align-items: center;
      min-height: 54px;
      gap: 10px;
      padding: 16px 18px;
      color: ${token.colorTextTertiary};
      border-bottom: 1px solid ${token.colorBorderSecondary};
      &:focus-within {
        border-bottom-color: ${token.focusRing};
      }
      @media (max-width: 575px) {
        padding: 10px 12px;
        gap: 6px;
      }
      @media (pointer: coarse) {
        padding-top: 10px;
        padding-bottom: 10px;
      }
    `,
    searchInput: css`
      &&,
      &&:hover,
      &&:focus,
      &&:focus-visible {
        flex: 1;
        width: 0;
        min-width: 0;
        height: 21px;
        padding: 0;
        border: 0;
        border-radius: 0;
        background: transparent;
        box-shadow: none;
        outline: none;
        color: ${token.colorText};
        font-size: ${SEARCH_TYPE.input}px;
        line-height: 21px;
        caret-color: ${token.colorLink};
      }
      &&::placeholder {
        color: ${token.colorTextTertiary};
      }
    `,
    iconButton: css`
      && {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 25px;
        min-width: 25px;
        height: 25px;
        padding: 0;
        margin: -3px -3px -3px 0;
        border: 0;
        border-radius: 4px;
        color: ${token.colorTextTertiary};
        background: transparent;
      }
      &&:hover:enabled {
        background: ${visual.hover};
        color: ${token.colorText};
      }
      &&:focus-visible {
        outline: 2px solid ${token.focusRing};
        outline-offset: 2px;
      }
      @media (pointer: coarse), (max-width: 575px) {
        && {
          width: 44px;
          min-width: 44px;
          height: 44px;
          margin: 0;
        }
      }
    `,
    list: css`
      min-height: 0;
      max-height: 440px;
      flex: 1 1 auto;
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: contain;
      padding: 8px;
      scrollbar-color: ${visual.field} transparent;
      scrollbar-width: thin;
    `,
    sectionLabel: css`
      padding: 12px 10px 7px;
      font-size: ${SEARCH_TYPE.label}px;
      color: ${token.colorTextTertiary};
      font-weight: 600;
      letter-spacing: 0.03em;
      line-height: normal;
    `,
    row: css`
      position: relative;
    `,
    item: css`
      display: flex;
      align-items: center;
      gap: 11px;
      width: 100%;
      min-height: 48px;
      padding: 7px 10px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: ${token.colorText};
      font-family: inherit;
      text-align: left;
      cursor: pointer;
      transition: background 0.1s ease-out;
      &:hover:enabled {
        background: ${visual.hover};
      }
      &:focus-visible {
        outline: 2px solid ${token.focusRing};
        outline-offset: -2px;
      }
      &:disabled {
        cursor: not-allowed;
        opacity: 0.48;
      }
      @media (prefers-reduced-motion: reduce) {
        transition: none;
      }
    `,
    documentItem: css`
      padding-right: 32px;
      @media (max-width: 575px) {
        padding-right: 54px;
        min-height: 52px;
      }
      @media (pointer: coarse) {
        padding-right: 54px;
      }
    `,
    hitItem: css`
      align-items: flex-start;
      min-height: 88px;
      padding: 10px 32px 10px 10px;
      gap: 10px;
      [data-role='icon'] {
        padding-top: 2px;
      }
      [data-role='snippet'] {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        white-space: normal;
        margin-top: 3px;
        line-height: 19px;
        color: ${token.colorTextSecondary};
      }
      @media (max-width: 575px) {
        padding-right: 54px;
        min-height: 52px;
      }
      @media (pointer: coarse) {
        padding-right: 54px;
      }
    `,
    itemActive: css`
      background: ${visual.selected};
      & [data-role='title'] {
        font-weight: 500;
      }
    `,
    itemIcon: css`
      flex: none;
      width: 26px;
      height: 30px;
      display: grid;
      place-items: center;
      color: ${token.colorTextTertiary};
    `,
    itemMain: css`
      flex: 1;
      min-width: 0;
    `,
    itemTitle: css`
      display: block;
      font-size: ${SEARCH_TYPE.title}px;
      line-height: 20px;
      color: ${token.colorText};
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `,
    itemSub: css`
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-top: 1px;
      font-size: ${SEARCH_TYPE.snippet}px;
      line-height: 18px;
      color: ${token.colorTextTertiary};
    `,
    path: css`
      display: flex;
      align-items: center;
      gap: 5px;
      overflow: hidden;
      white-space: nowrap;
      margin-top: 5px;
      font-size: ${SEARCH_TYPE.compact}px;
      line-height: 16px;
      color: ${token.colorTextTertiary};
      > span {
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
    detailButton: css`
      && {
        position: absolute;
        right: 6px;
        bottom: 6px;
        width: 25px;
        min-width: 25px;
        height: 25px;
        padding: 0;
        border: 0;
        border-radius: 4px;
        display: grid;
        place-items: center;
        background: transparent;
        color: ${token.colorTextTertiary};
      }
      &&:hover:enabled {
        background: ${token.colorBgContainer};
        color: ${token.colorLink};
      }
      &&:focus-visible {
        outline: 2px solid ${token.focusRing};
        outline-offset: 2px;
      }
      @media (pointer: coarse), (max-width: 575px) {
        && {
          min-width: 44px;
          width: 44px;
          height: 44px;
          right: 4px;
          bottom: 4px;
        }
      }
    `,
    status: css`
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px;
      min-height: 38px;
      font-size: ${SEARCH_TYPE.label}px;
      line-height: 18px;
      color: ${token.colorTextTertiary};
      > span:not([data-loading]) {
        flex: 1;
      }
    `,
    inlineFeedback: css`
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px;
      font-size: ${SEARCH_TYPE.label}px;
      line-height: 1.8;
      color: ${token.colorTextTertiary};
      flex-wrap: wrap;
      margin: 0;
    `,
    queryFeedback: css`
      padding: 24px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 9px;
      min-height: 140px;
      color: ${token.colorTextTertiary};
      font-size: ${SEARCH_TYPE.snippet}px;
      text-align: center;
      strong {
        font-size: ${SEARCH_TYPE.title}px;
        font-weight: 500;
        color: ${token.colorTextSecondary};
      }
      > span {
        font-size: ${SEARCH_TYPE.label}px;
        line-height: 1.7;
      }
      > button {
        margin-top: 4px;
      }
    `,
    textAction: css`
      && {
        height: auto;
        padding: 3px 4px;
        border: 0;
        margin-left: auto;
        color: ${token.colorLink};
        font-size: ${SEARCH_TYPE.label}px;
        line-height: inherit;
        white-space: nowrap;
      }
      @media (pointer: coarse) {
        && {
          min-height: 44px;
        }
      }
    `,
    outlineAction: css`
      && {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: auto;
        padding: 7px 12px;
        border: 1px solid ${visual.field};
        border-radius: 6px;
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
    `,
    actionError: css`
      display: flex;
      flex: none;
      gap: 8px;
      align-items: flex-start;
      background: ${token.colorErrorBg};
      padding: 12px 18px;
      color: ${token.colorErrorText};
      font-size: ${SEARCH_TYPE.label}px;
      line-height: 1.7;
      > span {
        flex: 1;
        min-width: 0;
      }
      > svg {
        margin-top: 3px;
      }
    `,
    pendingCreate: css`
      justify-content: space-between;
      border-top: 1px solid ${token.colorBorderSecondary};
      padding: 10px 18px;
      flex: none;
      > span:last-child {
        font-size: ${SEARCH_TYPE.compact}px;
      }
    `,
    compositionInfo: css`
      display: flex;
      flex: none;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: ${token.colorPrimaryBg};
      font-size: ${SEARCH_TYPE.compact}px;
      color: ${token.colorLink};
      line-height: 1.7;
    `,
    counter: css`
      flex: none;
      font-size: ${SEARCH_TYPE.compact}px;
      color: ${token.colorTextTertiary};
      padding: 5px 18px;
      text-align: right;
      border-bottom: 1px solid ${token.colorBorderSecondary};
    `,
    loading: css`
      display: inline-flex;
      align-items: center;
      gap: 6px;
    `,
    spin: css`
      animation: palette-spin 1s linear infinite;
      @keyframes palette-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `,
    errorText: css`
      color: ${token.colorErrorText};
    `,
    aiRow: css`
      display: flex;
      flex: none;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 2px 8px;
      padding: 11px 18px;
      border-top: 1px solid ${token.colorBorderSecondary};
      background: ${visual.nav};
      color: ${token.colorTextSecondary};
      font-size: ${SEARCH_TYPE.snippet}px;
      line-height: 1.7;
      @media (max-width: 575px) {
        padding: 8px 12px;
        flex-wrap: nowrap;
      }
    `,
    aiLabel: css`
      display: inline-flex;
      align-items: center;
      min-width: 0;
      gap: 8px;
      line-height: 1.7;
      > span {
        display: block;
        min-width: 0;
      }
      > svg {
        display: block;
        color: ${token.colorLink};
      }
      @media (max-width: 575px) {
        font-size: ${SEARCH_TYPE.compact}px;
        line-height: 1.7;
        gap: 6px;
        flex: 1;
      }
    `,
    askButton: css`
      && {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        gap: 5px;
        height: auto;
        padding: 2px 5px;
        border: 0;
        color: ${token.colorLink};
        font-size: ${SEARCH_TYPE.snippet}px;
        line-height: 1.7;
        white-space: nowrap;
        transition:
          color 0.2s,
          background-color 0.2s;
        > span {
          display: inline-flex;
          align-items: center;
        }
        > svg {
          display: block;
        }
      }
      /* AntD's link variant reapplies its border shorthand on hover/active. */
      &&&,
      &&&:hover:enabled,
      &&&:active:enabled,
      &&&:focus-visible,
      &&&:disabled {
        border: 0;
      }
      &&&:focus-visible {
        outline: 2px solid ${token.focusRing};
        outline-offset: 2px;
      }
      @media (max-width: 575px) {
        && {
          min-height: 44px;
          padding: 6px 4px;
          font-size: ${SEARCH_TYPE.label}px;
        }
      }
      @media (pointer: coarse) {
        && {
          min-height: 44px;
          min-width: 44px;
        }
      }
    `,
    foot: css`
      display: flex;
      flex: none;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px 10px;
      padding: 10px 18px;
      border-top: 1px solid ${token.colorBorderSecondary};
      font-size: ${SEARCH_TYPE.compact}px;
      color: ${token.colorTextTertiary};
      > span {
        white-space: nowrap;
        line-height: 18px;
      }
    `,
    kbd: css`
      font-family: ${token.fontFamilyCode};
      font-size: ${SEARCH_TYPE.compact}px;
      margin-right: 4px;
      padding: 1px 5px;
      border: 1px solid ${token.colorBorderSecondary};
      border-radius: 4px;
      background: ${visual.hover};
      line-height: 1.4;
      color: ${token.colorTextTertiary};
      white-space: nowrap;
    `,
    srOnly: css`
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    `,
  }
})
