import { createStyles } from 'antd-style'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 账号分区的样式（`docs/DESIGN.md` §8.14）。
 *
 * 两栏：左边头像（72px 圆形 + 两个动作），右边名称与邮箱。
 * 头像独立成列而不是挤在名称左边，是因为**它有动作**——
 * 「更换 / 移除」需要贴着头像，混在表单行里会让动作与字段分不清。
 */
export const useAccountStyles = createStyles(({ css, token }) => ({
  profile: css`
    display: flex;
    gap: 20px;
    align-items: flex-start;
  `,
  avatarColumn: css`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    flex: none;
  `,
  avatar: css`
    /* 无头像时的字母底色：走主色浅底而不是主色填充——
       填充是按钮的语义（docs/DESIGN.md §3.5） */
    background: ${token.colorPrimaryBg};
    color: ${token.colorLink};
    font-size: ${FONT_SIZE.pageTitle}px;
    font-weight: 600;
  `,
  avatarActions: css`
    display: flex;
    align-items: center;
    gap: 9px;
    font-size: ${FONT_SIZE.note}px;
  `,

  /**
   * 用 label 包 input 做上传按钮。
   *
   * 原生 `<input type="file">` 的样子由浏览器决定、且各浏览器不一致，
   * 所以隐藏它、用 label 当按钮——这是无脚本也能工作的做法
   * （比 JS 里 `inputRef.current.click()` 少一层状态）。
   */
  fileLabel: css`
    cursor: pointer;
    color: ${token.colorLink};
    font-size: ${FONT_SIZE.note}px;

    &:hover {
      text-decoration: underline;
    }
  `,
  fileInput: css`
    display: none;
  `,
  linkButton: css`
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    color: ${token.colorTextSecondary};
    font-size: ${FONT_SIZE.note}px;

    &:hover:not(:disabled) {
      color: ${token.colorErrorText};
    }
    &:disabled {
      cursor: default;
      opacity: 0.6;
    }
  `,
  avatarHint: css`
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
    white-space: nowrap;
  `,

  profileBody: css`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  nameRow: css`
    display: flex;
    align-items: center;
    gap: 9px;
  `,
  emailRow: css`
    display: flex;
    align-items: center;
    gap: 9px;
  `,
  /**
   * 「名称」与「邮箱」共用同一个标签列宽。
   *
   * 定宽 44px 让两个值左对齐——不定宽的话标签长度不同，
   * 输入框与文字会各自错开，看起来像两组无关的内容。
   */
  emailLabel: css`
    flex: none;
    width: 44px;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextSecondary};
  `,
  emailValue: css`
    font-size: ${FONT_SIZE.excerpt}px;
    color: ${token.colorText};
  `,
  nameInput: css`
    max-width: 260px;
  `,
}))
