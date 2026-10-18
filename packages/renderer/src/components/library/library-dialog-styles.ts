import { createStyles } from 'antd-style'
import { LIBRARY_FONT_SIZE as T, libraryVisualTokens } from './library-tokens'

export const useLibraryDialogStyles = createStyles(({ appearance, prefixCls }) => {
  const v = libraryVisualTokens(appearance === 'dark')
  return {
    root: {
      [`&& .${prefixCls}-modal`]: { top: 56, marginBlock: 0, maxWidth: 'calc(100% - 32px)' },
      '@media (max-width: 700px)': { [`&& .${prefixCls}-modal`]: { top: 36 } },
      '@media (max-width: 480px)': {
        [`&& .${prefixCls}-modal`]: { top: 24, maxWidth: 'calc(100% - 20px)' },
      },
    },
    dialog: {
      '&&&': {
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100dvh - 76px)',
        padding: '20px 24px',
        background: v.bg,
        color: v.text,
        borderRadius: 8,
        boxShadow: v.shadow,
        [`.${prefixCls}-modal-title`]: { color: v.text, background: v.bg },
        [`.${prefixCls}-modal-header`]: { marginBottom: 12, background: v.bg },
        [`.${prefixCls}-modal-footer`]: { flex: 'none', marginTop: 16 },
        [`.${prefixCls}-btn`]: {
          height: 32,
          paddingInline: 12,
          color: v.text,
          background: v.bg,
          borderColor: v.border,
          boxShadow: 'none',
        },
        [`.${prefixCls}-btn:hover:not(:disabled)`]: {
          color: v.text,
          background: v.hover,
          borderColor: v.focus,
        },
        [`.${prefixCls}-btn-primary`]: {
          background: v.accent,
          borderColor: v.accent,
          color: v.primaryText,
        },
        [`.${prefixCls}-btn-primary:hover:not(:disabled)`]: {
          background: v.accent,
          borderColor: v.accent,
          color: v.primaryText,
          filter: 'brightness(1.05)',
        },
        [`.${prefixCls}-btn:disabled`]: {
          opacity: 0.5,
          color: v.secondary,
          background: v.subtle,
          borderColor: v.border,
        },
        [`.${prefixCls}-input`]: { background: v.subtle, color: v.text, borderColor: v.border },
        [`.${prefixCls}-input:focus`]: {
          borderColor: v.fieldFocusBorder,
          outline: `2px solid ${v.fieldFocusOutline}`,
          outlineOffset: 1,
          boxShadow: 'none',
        },
        [`.${prefixCls}-input[aria-invalid="true"]`]: { borderColor: v.danger },
        '@media (max-width: 700px)': { padding: 20 },
        '@media (max-width: 480px)': {
          padding: 18,
          maxHeight: 'calc(100dvh - 48px)',
          [`.${prefixCls}-modal-title`]: { fontSize: T.dialogTitle },
          [`.${prefixCls}-input`]: { fontSize: T.field },
          [`.${prefixCls}-modal-footer`]: { paddingTop: 12 },
        },
      },
    },
    body: { minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', fontSize: T.item },
    label: { display: 'block', marginBottom: 8, fontWeight: 500, color: v.text, fontSize: T.item },
    hint: {
      margin: '8px 0 12px',
      color: v.secondary,
      fontSize: T.badge,
      lineHeight: 1.7,
      overflowWrap: 'anywhere',
    },
    error: {
      margin: '8px 0 12px',
      color: v.danger,
      background: v.errorBg,
      borderRadius: 4,
      padding: '8px 12px',
      fontSize: T.meta,
      overflowWrap: 'anywhere',
    },
    text: { margin: '0 0 12px', fontSize: T.item, lineHeight: 1.7, overflowWrap: 'anywhere' },
    muted: { color: v.secondary, fontSize: T.item, lineHeight: 1.7, marginBottom: 12 },
    file: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
      background: v.subtle,
      borderRadius: 6,
      padding: 12,
      margin: '14px 0',
      '> span': { flex: 1, minWidth: 0, overflowWrap: 'anywhere', fontSize: T.meta },
      '> svg': { flex: 'none', color: v.secondary },
      [`.${prefixCls}-btn`]: { fontSize: T.meta, marginLeft: 'auto' },
    },
    notice: {
      padding: '8px 12px',
      background: v.subtle,
      color: v.secondary,
      fontSize: T.meta,
      lineHeight: 1.7,
      borderRadius: 4,
      overflowWrap: 'anywhere',
    },
  }
})
