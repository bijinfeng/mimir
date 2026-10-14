import { createStyles } from 'antd-style'
import { FONT_SIZE } from '../../theme/tokens'

/**
 * 账号分区的样式（`.trellis/spec/project/design.md` §8.14）。
 *
 * 两栏：左边 52px 圆形头像入口，右边名称与邮箱。
 *
 * ## 头像交互
 *
 * - **默认**：显示当前图片或姓名首字母
 * - **悬停或聚焦**：灰色圆形相机提示覆盖头像
 *
 * 头像独立成列，因为它本身就是上传入口。
 */
export const useAccountStyles = createStyles(({ css, token }) => ({
  profile: css`
    display: flex;
    gap: 20px;
    align-items: flex-start;
  `,
  avatarColumn: css`
    flex: none;
  `,
  avatarWrapper: css`
    position: relative;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    &:hover [data-role='avatar-camera-overlay'],
    &:focus-within [data-role='avatar-camera-overlay'] {
      opacity: 1;
    }
  `,
  avatarClickable: css`
    position: absolute;
    inset: 0;
    border-radius: 50%;
    cursor: pointer;
    &:focus-visible {
      outline: 2px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }
  `,
  avatar: css`
    width: 52px;
    height: 52px;
    background: ${token.colorPrimaryBg};
    color: ${token.colorLink};
    font-size: ${FONT_SIZE.section}px;
    font-weight: 600;
  `,
  avatarCameraOverlay: css`
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, ${token.colorTextBase} 55%, ${token.colorBgBase});
    color: ${token.colorWhite};
    opacity: 0;
    transition: opacity 0.15s ease;
    pointer-events: none;
    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
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
    min-width: 0;
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
    min-width: 0;
    max-width: 260px;
  `,
  accountFooter: css`
    display: flex;
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid ${token.colorBorderSecondary};
  `,
}))
