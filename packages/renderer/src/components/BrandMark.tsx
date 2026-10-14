import { createStyles } from 'antd-style'

/**
 * 品牌标记：圆角工作页里的小写 m。
 * 方框取自登录页原型，加宽的笔画让它在紧凑的导航里仍有辨识度。
 * 方框内侧用 evenodd 镂空，颜色由调用方通过 currentColor 控制。
 */
const useStyles = createStyles(({ css }) => ({
  mark: css`
    display: block;
    flex: none;
  `,
}))

export interface BrandMarkProps {
  /** 边长（px）。导航用 20–23，登录页用 28 */
  size?: number
  /** 无障碍名称。只在标记独立出现时给（旁边有 mimir 文字时传 null） */
  title?: string | null
}

export function BrandMark({ size = 20, title = 'mimir' }: BrandMarkProps) {
  const { styles } = useStyles()

  return (
    <svg
      className={styles.mark}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="
          M7 2h18a5 5 0 0 1 5 5v18a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z
          M7 4a3 3 0 0 0-3 3v18a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7z
          M7 22V11h3.5v1.6c1.1-1.3 2.4-2 4-2 1.8 0 3 .8 3.7 2.3 1.2-1.5 2.6-2.3 4.3-2.3 2.8 0 4.3 1.8 4.3 4.7V22h-3.5v-6.2c0-1.5-.5-2.2-1.6-2.2-1.4 0-2.2 1.1-2.2 2.9V22h-3.5v-6.2c0-1.5-.5-2.2-1.6-2.2-1.4 0-2.2 1.1-2.2 2.9V22H7z
        "
      />
    </svg>
  )
}

/** 品牌组合：标记 + 文字。导航与登录页共用同一个比例 */
export function BrandLockup({ markSize = 20 }: { markSize?: number }) {
  return (
    <>
      <BrandMark size={markSize} title={null} />
      <b>mimir</b>
    </>
  )
}
