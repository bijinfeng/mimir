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
   * 两个动作（更换 / 移除）共用同一档字号。
   *
   * 用的是 antd `Button type="link"`，所以颜色 / hover / 禁用态都走 token
   * （链接色是 `colorLink`——主色作文字在浅底上不达标，见
   * `docs/DESIGN.md` §3.5）。这里只压掉它默认的内边距，
   * 让两个按钮贴着头像排得紧一些。
   *
   * 第一版是 `<label>` + 隐藏的原生 `<input type="file">` 加一个裸
   * `<button>`：它们**不服从 token 体系**，深浅主题都管不到，
   * 于是成为这一块里唯一不属于这套设计的东西。
   */
  actionBtn: css`
    height: auto;
    padding: 0;
    font-size: ${FONT_SIZE.note}px;
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
