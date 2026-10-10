import { createStyles } from 'antd-style'

/**
 * 品牌标记。
 *
 * ## 它是什么
 *
 * 两个引号，每个的碗里掏空一个圆 —— **引号本身就是一口井**。
 *
 * 两层读法，不需要任何一层作为前提：
 *
 * 1. **引号** —— 这是产品最核心的差异点。`.trellis/spec/project/product.md` §2.2 把「带引用地问答」
 *    列为闭环的最后一环，§5.2 要求引用占据整列。一个纯笔记应用不需要引号。
 * 2. **井** —— 名字来自北欧神话的 Mímir，至智者，守护智慧之井 Mímisbrunnr。
 *    奥丁为喝一口井水献出了一只眼睛。知道这个故事的人会看到第二层。
 *
 * 这个双层结构是刻意的：**不知道神话的人也读得懂**（它就是引号），
 * 知道的人多得到一层。反过来（一个必须懂神话才看得懂的符号）会把多数人挡在外面。
 *
 * ## 为什么是这个形状，不是别的
 *
 * 候选里淘汰掉的：
 *
 * | 方案 | 淘汰原因 |
 * |---|---|
 * | 同心环（井口 + 涟漪） | 16px 下三层环糊成一块色斑 |
 * | 井的剖面（三条递减横线） | 16px 下像「文本对齐」图标，且笔画太密 |
 * | 深度计（竖线 + 刻度） | 同上，16px 完全糊掉 |
 * | 引号由细线环构成 | 16px 下笔画粘连成两个实心球（实测放大 8 倍确认） |
 * | m 字即井 | 形状好，但导航里会变成「m mimir」，与文字首字母重复 |
 * | 井中之眼 | 故事最好，但「眼睛」在个人数据产品上有被监视的联想 |
 *
 * ## 两条实现约束
 *
 * 1. **孔用 `fill-rule="evenodd"` 而不是白色圆形覆盖。**
 *    白圆在一张白底上看起来没问题，但放到主色按钮上就会露出白点。
 *    evenodd 让孔是**真的空的**，于是这个标记在任何底色上都成立。
 * 2. **颜色走 `currentColor`。** 它由调用方的 `color` 决定，
 *    所以主题换色时 logo 跟着换，不需要第二个地方同步。
 */

const useStyles = createStyles(({ css }) => ({
  mark: css`
    display: block;
    flex: none;
  `,
}))

export interface BrandMarkProps {
  /** 边长（px）。导航用 20，登录页用 28，favicon 用 16 */
  size?: number
  /** 无障碍名称。只在标记**独立出现**时给（旁边有 mimir 文字时传 null） */
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
      {/*
        一个 path 装两个引号 + 两个井口。
        井口作为子路径追加在末尾，靠 evenodd 变成镂空。
        圆形的路径写法是在同一位置画两段半弧（`a` 两次），
        这样闭合成一个独立子路径。
      */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="
          M11 7.4c-3.1 1.5-4.9 4-4.9 7.3v6a2.1 2.1 0 0 0 2.1 2.1h3.2a2.1 2.1 0 0 0 2.1-2.1v-4a2.1 2.1 0 0 0-2.1-2.1H9.2c.2-1.7 1.1-2.9 2.7-3.7z
          M9.7 17.4a2 2 0 1 0 0 4 2 2 0 1 0 0-4z
          M25 7.4c-3.1 1.5-4.9 4-4.9 7.3v6a2.1 2.1 0 0 0 2.1 2.1h3.2a2.1 2.1 0 0 0 2.1-2.1v-4a2.1 2.1 0 0 0-2.1-2.1h-2.2c.2-1.7 1.1-2.9 2.7-3.7z
          M23.7 17.4a2 2 0 1 0 0 4 2 2 0 1 0 0-4z
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
