import { createStyles } from 'antd-style'
import { FONT_SIZE } from '../../theme/tokens'

/**
 * 账号分区的样式（`.trellis/spec/project/design.md` §8.14）。
 *
 * 两栏：左边头像（72px 圆形 + 右下角相机按钮），右边名称与邮箱。
 *
 * ## 头像交互
 *
 * - **右下角相机按钮**：始终可见，点击即选图上传——这是头像编辑的主入口
 * - **右上角移除按钮**：仅在 hover 头像时出现，点击弹出确认后移除
 *
 * 头像独立成列而不是挤在名称左边，是因为**它有动作**——
 * 相机按钮需要贴着头像，混在表单行里会让动作与字段分不清。
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
       填充是按钮的语义（.trellis/spec/project/design.md §3.5） */
    background: ${token.colorPrimaryBg};
    color: ${token.colorLink};
    font-size: ${FONT_SIZE.pageTitle}px;
    font-weight: 600;
  `,
  /**
   * 头像包裹层：相对定位，给右下角相机按钮和右上角移除按钮提供定位参照。
   * 尺寸与头像一致（72px），这样按钮贴边时不会跑到头像外。
   *
   * hover 时让移除按钮显现——用属性选择器 `[data-role]` 而不是类名，
   * 因为 antd-style 的类名是哈希值，嵌套选择器里拿不到稳定的引用。
   */
  avatarWrapper: css`
    position: relative;
    width: 72px;
    height: 72px;
    &:hover [data-role='remove-avatar'] {
      opacity: 1;
    }
  `,
  /**
   * 右下角相机按钮：头像编辑的视觉提示。
   *
   * - 收在头像内部右下角（`right: 4px; bottom: 4px`），尺寸 18px——
   *   越小越不抢戏，但要大到能看清图标（10px）
   * - 仅作视觉提示——真正的点击区域是整个头像（见 `avatarClickable`）
   * - 用 2px 白边把按钮从头像里「切」出来，避免深色头像把按钮吞掉
   * - `pointer-events: none`：点击穿透到下面的头像，由头像统一处理文件选择
   */
  cameraBtn: css`
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${token.colorBgElevated};
    border: 2px solid ${token.colorBgContainer};
    color: ${token.colorText};
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: ${token.boxShadowTertiary};
    pointer-events: none;
  `,
  /**
   * 头像可点击区域：铺满整个头像，hover 时显示半透明遮罩。
   *
   * 点击它触发文件选择——比只点相机按钮更符合直觉（用户会自然地
   * 去点头像本身）。相机按钮只是视觉提示，不承担点击。
   *
   * `cursor: pointer` 让用户一眼看出这是可点击的。
   */
  avatarClickable: css`
    position: absolute;
    inset: 0;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    &::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: ${token.colorBgMask};
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    &:hover::after {
      opacity: 0.4;
    }
  `,
  /**
   * 右上角移除按钮：仅在 hover 头像时出现。
   *
   * 默认 `opacity: 0`，hover 包裹层时 `opacity: 1`。
   * 不是 `display: none`——那样过渡动画失效，按钮会突兀地蹦出来。
   */
  removeBtn: css`
    position: absolute;
    top: -4px;
    right: -4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: ${token.colorError};
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border: none;
    padding: 0;
    opacity: 0;
    transition: opacity 0.15s ease;
    &:hover {
      background: ${token.colorErrorHover};
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
