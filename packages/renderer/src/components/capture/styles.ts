import { createStyles } from 'antd-style'
import { CAPTURE_TYPE as T, captureVisualTokens } from './capture-tokens'

export const useCaptureStyles = createStyles(({ css, token, prefixCls, appearance }) => {
  const v = captureVisualTokens(appearance === 'dark')
  return {
    modal: css`
      top: 58px;
      padding-bottom: 16px;
      max-width: calc(100vw - 16px);
      .${prefixCls}-modal-container {
        display: flex;
        flex-direction: column;
        padding: 20px 24px;
        max-height: calc(100dvh - 74px);
        overflow: hidden;
        border-radius: 6px;
        background: ${v.floating};
        box-shadow: ${v.shadow};
      }
      .${prefixCls}-modal-header {
        flex: none;
        background: transparent;
        margin-bottom: 10px;
        min-height: 30px;
        padding-right: 30px;
      }
      .${prefixCls}-modal-title {
        font-size: ${T.title}px;
        line-height: 26px;
        font-weight: 600;
      }
      .${prefixCls}-modal-close {
        top: 14px;
        right: 12px;
        width: 32px;
        height: 32px;
        color: ${v.muted};
      }
      .${prefixCls}-modal-body {
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .${prefixCls}-modal-footer {
        flex: none;
        margin-top: 0;
        padding-top: 18px;
      }
      svg {
        display: block;
        flex: none;
        stroke-width: 1.7;
      }
      @media (max-width: 600px) {
        top: 30px;
        .${prefixCls}-modal-container {
          max-height: calc(100dvh - 46px);
        }
      }
      @media (max-width: 440px) {
        .${prefixCls}-modal-container {
          padding: 18px 16px;
        }
        .${prefixCls}-modal-header {
          min-height: 38px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
        }
        .${prefixCls}-modal-close {
          top: 8px;
          right: 4px;
          width: 44px;
          height: 44px;
        }
        .${prefixCls}-modal-footer {
          padding-top: 14px;
        }
      }
    `,
    frame: css`
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    `,
    body: css`
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      overflow: auto;
      min-height: 0;
      padding: 2px 0 8px;
      scrollbar-width: thin;
      scrollbar-color: ${v.field} transparent;
      overscroll-behavior: contain;
      > * {
        flex: none;
      }
    `,
    target: css`
      display: flex;
      gap: 7px;
      align-items: flex-start;
      font-size: ${T.hint}px;
      color: ${token.colorTextSecondary};
      line-height: 20px;
      margin-bottom: 16px;
      flex: none;
      > svg {
        margin-top: 3px;
      }
      > span:last-child {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      @media (max-width: 440px) {
        margin-bottom: 12px;
      }
    `,
    muted: css`
      color: ${v.muted};
    `,
    tabs: css`
      flex: none;
      margin-bottom: 22px;
      display: flex;
      gap: 2px;
      padding: 3px;
      border-radius: 5px;
      background: ${v.aside};
      && .${prefixCls}-btn {
        flex: 1;
        min-height: 28px;
        height: auto;
        padding: 4px 12px;
        font-size: ${T.button}px;
        line-height: 20px;
        color: ${token.colorTextSecondary};
        box-shadow: none;
        border: 0;
        border-radius: 4px;
        background: transparent;
        transition:
          color 0.12s,
          background-color 0.12s;
      }
      && .${prefixCls}-btn[aria-selected='true'] {
        background: ${v.floating};
        color: ${token.colorText};
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.07);
      }
      && .${prefixCls}-btn:not(:disabled):hover {
        border: 0;
        background: ${v.hover};
        color: ${token.colorText};
      }
      && .${prefixCls}-btn:disabled {
        color: ${v.disabledText};
      }
      @media (max-width: 440px) {
        margin-bottom: 17px;
        && .${prefixCls}-btn {
          min-height: 44px;
          padding: 10px 8px;
        }
      }
    `,
    field: css`
      display: flex;
      flex-direction: column;
      gap: 8px;
      > label {
        font-size: ${T.label}px;
        font-weight: 600;
        line-height: 1.7;
        color: ${token.colorText};
      }
    `,
    input: css`
      && {
        min-height: 34px;
        padding: 0 10px;
        border: 1px solid ${v.field};
        border-radius: 5px;
        background: ${v.surface};
        box-shadow: none;
        transition: border-color 0.12s;
      }
      &&:hover {
        border-color: ${v.fieldHover};
      }
      &&:focus-within {
        border-color: ${v.link};
        box-shadow: none;
      }
      &&[data-invalid='true'] {
        border-color: ${v.error};
      }
      &&:has(input:disabled) {
        background: ${v.disabled};
        border-color: ${v.field};
      }
      && input {
        height: 32px;
        padding: 5px 0;
        font-size: ${T.body}px;
        line-height: 22px;
        caret-color: ${v.link};
      }
      && .${prefixCls}-input-suffix {
        margin-inline-start: 5px;
      }
      && .${prefixCls}-input-suffix:has([data-capture-empty-suffix]) {
        margin-inline-start: 0;
      }
      @media (max-width: 440px) {
        && {
          min-height: 44px;
          padding-right: 0;
        }
        && input {
          min-height: 42px;
        }
        &&:has(button) {
          min-height: 46px;
        }
      }
    `,
    clear: css`
      && {
        display: grid;
        place-items: center;
        width: 16px;
        height: 16px;
        min-width: 16px;
        padding: 0;
        border: 1px solid transparent;
        border-radius: 50%;
        color: ${v.muted};
        background: ${v.selected};
      }
      &&:not(:disabled):hover {
        border: 1px solid transparent;
        background: ${v.field};
        color: ${token.colorText};
      }
      @media (max-width: 440px) {
        && {
          width: 44px;
          height: 44px;
          min-width: 44px;
          background: transparent;
        }
      }
    `,
    source: css`
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0 6px;
      font-size: ${T.hint}px;
      line-height: 1.7;
      color: ${token.colorTextSecondary};
      overflow-wrap: anywhere;
      @media (max-width: 440px) {
        line-height: 1.8;
      }
    `,
    invalid: css`
      color: ${v.error};
    `,
    wait: css`
      display: flex;
      gap: 10px;
      align-items: flex-start;
      background: ${v.aside};
      padding: 13px 14px;
      border-radius: 5px;
      font-size: ${T.hint}px;
      color: ${token.colorTextSecondary};
      > svg {
        margin-top: 3px;
      }
      strong {
        color: ${token.colorText};
        font-weight: 500;
      }
      p {
        margin: 3px 0 0;
        color: ${v.muted};
        line-height: 1.7;
      }
    `,
    spin: css`
      animation: capture-spin 1s linear infinite;
      @keyframes capture-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `,
    stages: css`
      background: ${v.aside};
      border: 1px solid ${v.line};
      border-radius: 5px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    `,
    stage: css`
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px 8px;
      min-height: 31px;
      padding: 5px 2px;
      font-size: ${T.button}px;
      color: ${token.colorTextSecondary};
    `,
    dot: css`
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      flex: none;
      background: ${v.selected};
      color: ${v.muted};
      border-radius: 50%;
      &[data-state='done'] {
        color: ${v.success};
        background: ${v.successBg};
      }
      &[data-state='failed'] {
        color: ${v.error};
        background: ${v.errorBg};
      }
    `,
    stageMeta: css`
      margin-left: auto;
      min-width: 0;
      overflow-wrap: anywhere;
      font-size: ${T.meta}px;
      color: ${v.muted};
      text-align: right;
      @media (max-width: 440px) {
        max-width: calc(100% - 28px);
        line-height: 1.7;
      }
    `,
    notice: css`
      padding: 11px 12px;
      display: flex;
      align-items: flex-start;
      gap: 9px;
      font-size: ${T.hint}px;
      line-height: 1.7;
      border-radius: 5px;
      background: ${v.aside};
      color: ${token.colorTextSecondary};
      overflow-wrap: anywhere;
      > svg {
        margin-top: 3px;
        flex: none;
      }
      > div {
        min-width: 0;
        flex: 1;
      }
      strong {
        font-size: ${T.button}px;
        font-weight: 500;
      }
      p {
        font-size: ${T.hint}px;
        margin: 3px 0 0;
      }
      &[data-tone='success'] {
        background: ${v.successBg};
        color: ${v.success};
      }
      &[data-tone='warning'] {
        background: ${v.warningBg};
        color: ${v.warning};
      }
      &[data-tone='error'] {
        background: ${v.errorBg};
        color: ${v.error};
      }
    `,
    guardContext: css`
      display: flex;
      gap: 10px;
      padding: 12px 0;
      align-items: flex-start;
      > svg {
        margin-top: 3px;
      }
      strong {
        font-size: ${T.body}px;
        font-weight: 600;
      }
      p {
        font-size: ${T.hint}px;
        line-height: 1.7;
        color: ${v.muted};
        margin: 2px 0 0;
      }
    `,
    guardDescription: css`
      font-size: ${T.button}px;
      line-height: 1.7;
      margin: 0;
    `,
    guardHint: css`
      font-size: ${T.hint}px;
      line-height: 1.7;
      color: ${v.muted};
      margin: 0;
    `,
    footer: css`
      > button + button {
        margin-inline-start: 0;
      }
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      flex-wrap: wrap;
    `,
    button: css`
      && {
        height: auto;
        min-height: 32px;
        max-width: 100%;
        padding: 5px 14px;
        font-size: ${T.button}px;
        line-height: 20px;
        border-radius: 5px;
        gap: 7px;
        transition:
          color 0.12s,
          background-color 0.12s,
          border-color 0.12s;
      }
      &&& {
        box-shadow: none;
      }
      &&&.${prefixCls}-btn-primary:not(:disabled) {
        border: 1px solid ${token.colorPrimary};
      }
      &&&.${prefixCls}-btn-primary:not(:disabled):hover {
        border: 1px solid ${token.colorPrimaryHover};
        box-shadow: none;
      }
      &&&.${prefixCls}-btn-primary:not(:disabled):active {
        border: 1px solid ${token.colorPrimaryActive};
        box-shadow: none;
      }
      &&&.${prefixCls}-btn-primary:not(:disabled):focus-visible {
        box-shadow: none;
      }

      && > span {
        min-width: 0;
      }
      &&:disabled {
        background: ${v.disabled};
        border-color: ${v.field};
        color: ${v.disabledText};
      }

      @media (max-width: 440px) {
        && {
          min-height: 44px;
          padding: 10px 14px;
        }
      }
    `,
    clip: css`
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    `,
  }
})
