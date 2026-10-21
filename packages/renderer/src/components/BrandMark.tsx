import { createStyles } from 'antd-style'
import { BRAND_PATH, BRAND_VIEW_BOX } from './brand.generated'

/** 圆润渡鸦标记。几何由 assets/brand/mimir-mark.svg 生成；颜色继承调用方。 */
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
      viewBox={BRAND_VIEW_BOX}
      fill="none"
      {...(title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': true })}
    >
      <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d={BRAND_PATH} />
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
