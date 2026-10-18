import { createStyles } from 'antd-style'
import { CAPTURE_TYPE as T, captureVisualTokens } from './capture-tokens'

export const useUploadStyles = createStyles(({ css, token, prefixCls, appearance }) => {
  const v = captureVisualTokens(appearance === 'dark')
  return {
    uploadBody: css`
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 0;
      > * {
        flex: none;
      }
      svg {
        display: block;
        flex: none;
        stroke-width: 1.7;
      }
    `,
    dragger: css`
      &&.${prefixCls}-upload-wrapper .${prefixCls}-upload-drag {
        border: 1px dashed ${v.dropBorder};
        border-radius: 5px;
        background: ${v.aside};
        color: ${token.colorText};
        transition:
          background-color 0.12s,
          border-color 0.12s;
      }
      &&.${prefixCls}-upload-wrapper .${prefixCls}-upload-btn {
        padding: 16px 12px;
        min-height: 118px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      &&.${prefixCls}-upload-wrapper .${prefixCls}-upload-drag-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
      }
      &&.${prefixCls}-upload-wrapper .${prefixCls}-upload-drag:not(.${prefixCls}-upload-disabled):hover {
        border-color: ${v.link};
        background: ${v.hover};
      }
      &&.${prefixCls}-upload-wrapper .${prefixCls}-upload-disabled {
        border-color: ${v.field};
        background: ${v.disabled};
        color: ${v.disabledText};
      }
      &&.${prefixCls}-upload-wrapper .${prefixCls}-upload-disabled svg,
      &&.${prefixCls}-upload-wrapper .${prefixCls}-upload-disabled [data-drop-hint] {
        color: ${v.disabledText};
      }
      @media (max-width: 440px) {
        &&.${prefixCls}-upload-wrapper .${prefixCls}-upload-btn {
          min-height: 130px;
        }
      }
    `,
    compactDragger: css`
      &&.${prefixCls}-upload-wrapper .${prefixCls}-upload-btn {
        min-height: 54px;
        padding: 8px 12px;
      }
      &&.${prefixCls}-upload-wrapper .${prefixCls}-upload-drag-container {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        gap: 1px 10px;
        text-align: left;
      }
      && svg {
        grid-column: 1;
        grid-row: 1 / 3;
        margin: 0;
        width: 17px;
        height: 17px;
        align-self: center;
      }
      && [data-drop-title] {
        font-size: ${T.hint}px;
        line-height: 19px;
        grid-column: 2;
      }
      && [data-drop-hint] {
        font-size: ${T.compact}px;
        line-height: 18px;
        margin: 0;
        grid-column: 2;
      }
    `,
    dropIcon: css`
      color: ${v.link};
      margin-bottom: 12px;
    `,
    dropTitle: css`
      font-size: ${T.body}px;
      line-height: 22px;
    `,
    dropHint: css`
      font-size: ${T.hint}px;
      color: ${v.muted};
      margin-top: 6px;
      line-height: 1.7;
      max-width: 100%;
      overflow-wrap: anywhere;
      @media (max-width: 440px) {
        max-width: 270px;
      }
    `,
    rows: css`
      display: flex;
      flex-direction: column;
      border-top: 1px solid ${v.line};
      border-bottom: 1px solid ${v.line};
      max-height: 280px;
      overflow: auto;
      scrollbar-width: thin;
      scrollbar-color: ${v.field} transparent;
      overscroll-behavior: contain;
    `,
    row: css`
      display: grid;
      grid-template-columns: 17px minmax(0, 1fr);
      align-items: flex-start;
      gap: 10px;
      padding: 8px 2px;
      border-bottom: 1px solid ${v.line};
      font-size: ${T.item}px;
      min-width: 0;
      &:last-child {
        border-bottom: 0;
      }
      @media (max-width: 440px) {
        padding-left: 0;
        padding-right: 0;
      }
    `,
    rowIcon: css`
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      flex: none;
      margin-top: 3px;
      color: ${v.muted};
      &[data-state='done'] {
        color: ${v.success};
      }
      &[data-state='failed'] {
        color: ${v.error};
      }
    `,
    pendingDot: css`
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${v.field};
    `,
    rowMain: css`
      min-width: 0;
    `,
    rowName: css`
      display: block;
      line-height: 21px;
      overflow-wrap: anywhere;
    `,
    rowFormat: css`
      display: block;
      font-size: ${T.meta}px;
      color: ${v.muted};
      line-height: 18px;
      margin-top: 2px;
    `,
    rowDetail: css`
      grid-column: 2;
      margin-top: -6px;
      line-height: 20px;
      font-size: ${T.hint}px;
      color: ${token.colorTextSecondary};
      overflow-wrap: anywhere;
      > span {
        display: block;
      }
      &[data-state='failed'] {
        color: ${v.error};
      }
      summary {
        cursor: pointer;
        padding: 2px 0;
        color: ${v.error};
      }
      p {
        margin: 5px 0 0;
      }
    `,
    rawNote: css`
      color: ${v.muted};
      font-size: ${T.meta}px;
      margin-top: 2px;
    `,
    path: css`
      font-size: ${T.meta}px;
      color: ${v.muted};
      margin-top: 1px;
      overflow-wrap: anywhere;
      summary {
        display: flex;
        gap: 4px;
        align-items: center;
        cursor: pointer;
      }
      summary span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      > div {
        margin-top: 3px;
        line-height: 1.7;
      }
    `,
    batch: css`
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: ${T.hint}px;
      line-height: 20px;
      font-variant-numeric: tabular-nums;
      > span:last-child {
        margin-left: auto;
        font-size: ${T.meta}px;
        color: ${v.muted};
      }
    `,
    actions: css`
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
      @media (max-width: 440px) {
        > button {
          width: 100%;
        }
      }
    `,
    small: css`
      font-size: ${T.hint}px;
      line-height: 1.7;
      color: ${v.muted};
    `,
    integrated: css`
      position: absolute;
      left: 12px;
      right: 12px;
      top: 110px;
      bottom: 14px;
      z-index: 4;
      background: ${v.floating};
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow: auto;
      border: 1px solid ${v.line};
      border-radius: 6px;
      @media (max-width: 440px) {
        left: 6px;
        right: 6px;
        padding: 11px;
      }
    `,
    integratedHeading: css`
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: none;
      strong {
        font-size: ${T.body}px;
      }
      span {
        font-size: ${T.compact}px;
        color: ${v.muted};
        overflow-wrap: anywhere;
      }
    `,
  }
})
