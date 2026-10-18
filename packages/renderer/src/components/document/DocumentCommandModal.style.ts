import { createStyles } from 'antd-style'

export const useStyles = createStyles(({ token }) => ({
  fields: { minWidth: 0 },
  label: { display: 'block', marginBottom: 8, color: token.colorText, fontSize: token.fontSize },
  help: {
    margin: '8px 0 0',
    color: token.colorTextSecondary,
    fontSize: token.fontSizeSM,
    lineHeight: 1.6,
  },
  path: {
    margin: '8px 0 0',
    color: token.colorTextSecondary,
    overflowWrap: 'anywhere',
    fontSize: token.fontSizeSM,
  },
  error: {
    marginTop: 8,
    color: token.colorErrorText,
    overflowWrap: 'anywhere',
    fontSize: token.fontSizeSM,
  },
}))
