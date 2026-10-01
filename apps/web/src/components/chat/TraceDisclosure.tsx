import { Collapse, Steps, Tag } from 'antd'
import { createStyles } from 'antd-style'
import { BookOpen, Check, Search, Zap } from 'lucide-react'
import type { Trace, TraceStep } from '@mimir/shared'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 检索过程。默认折叠，标题是「思考 N 轮 · 调用 M 次工具 · 耗时 Xs」。
 *
 * `docs/PRD.md` §5.6：这条对个人知识库比对企业的更重要——AI 说「没找到」时，
 * 你能立刻分辨是**确实没存过**、还是**存了但分词没匹配上**、还是**范围设错了**。
 * 没有它，你只能怀疑自己记错了。
 *
 * ## 两个 antd 组件，各管一段
 *
 * - `Collapse` 管**展开/折叠**：受控开合、键盘可达、动效都现成
 * - `Steps`（`orientation="vertical"`）管**步骤时间轴**：圆点、连接线、
 *   每步的 title / content 布局都是它内建的
 *
 * ## v6 改过名的两处，写旧名不报错只是**什么都没发生**
 *
 * - `direction` → `orientation`（`direction` 会打废弃警告）
 * - `items[].description` / `.ant-steps-item-description` → `content` /
 *   `.ant-steps-item-content`。CSS 写旧类名时规则静默失配，这一步的明细
 *   退回正文的 14px 与正文色，比它自己的标题（12.5px）还显眼——
 *   层级是反的，而控制台里只有一条警告
 *
 * 一开始这两处都是手写的（自己画圆点和竖线、自己管展开状态）。
 * 手写版的问题不是不好看，而是**漏了细节**：连接线在最后一步要断掉、
 * 圆点要和文字首行对齐、键盘要能展开——这些 Steps 都处理好了。
 *
 * ## 数字必须是真的
 *
 * 三个数字与每一步的明细都来自服务端真实执行的结果（见
 * `apps/server/src/services/assistant-stream.ts`）。**编的数字比没有数字更糟**：
 * 用户会拿它做判断，而假数字会让他得出错误结论。
 */

const STEP_ICON: Record<TraceStep['icon'], React.ReactNode> = {
  think: <Zap size={9} />,
  search: <Search size={9} />,
  read: <BookOpen size={9} />,
  check: <Check size={9} />,
}

const useStyles = createStyles(({ css, token, prefixCls }) => ({
  /* 外壳。Collapse 默认是无边框的（ghost），这里给它一层描边 + 浅底：
     它是回答上方的一条独立信息，需要和正文分开，否则读起来像回答的第一段 */
  trace: css`
    margin-bottom: 12px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: ${token.borderRadius}px;
    background: ${token.tintNav};
    overflow: hidden;

    .${prefixCls}-collapse-header {
      padding: 8px 11px !important;
      font-size: ${FONT_SIZE.note}px;
      color: ${token.colorTextSecondary};
    }
    .${prefixCls}-collapse-content-box {
      padding: 2px 11px 10px !important;
      border-top: 1px solid ${token.colorBorderSecondary};
    }
    .${prefixCls}-collapse-item {
      border: none !important;
      background: transparent !important;
    }
  `,
  summary: css`
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: ${FONT_SIZE.note}px;
    color: ${token.colorTextSecondary};

    strong {
      color: ${token.colorText};
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  `,

  /* Steps 的排版收敛。默认的 Steps 是给「导航」用的，字号偏大、
     每步之间的留白也多；这里是紧凑的过程记录，要的是能一眼扫完 */
  steps: css`
    padding-top: 8px;

    .${prefixCls}-steps-item {
      padding-bottom: 4px;
    }
    .${prefixCls}-steps-item-title {
      font-size: ${FONT_SIZE.note}px !important;
      line-height: 1.6 !important;
      color: ${token.colorTextSecondary} !important;
    }
    /* v6 把这一层的类名从 -description 换成了 -content
       （items 里的 description 也随之废弃，见下面 Steps 的 items）。
       写旧类名不会报错——那条规则只是再也匹配不到任何元素，
       于是这一步的明细继承正文的 14px 与正文色，比它自己的标题还大
       （实测 14px / rgba(31,35,41,.88) 对标题的 12.5px / #5c6570）。 */
    .${prefixCls}-steps-item-content {
      font-size: ${FONT_SIZE.badge}px !important;
      line-height: 1.6 !important;
      color: ${token.colorTextTertiary} !important;
      margin-top: 1px !important;
    }
    /* 圆点缩小到与 12.5px 文字同高，否则它比一行字还大。
       里面的 9px 是**图标字形的大小**，不是文字——它不参与字号阶梯
       （阶梯管的是可读文本；图标的大小由它所在的圆点决定）。 */
    .${prefixCls}-steps-item-icon {
      width: 16px !important;
      height: 16px !important;
      margin-top: 3px !important;
      font-size: 9px !important; /* 图标字形，非文本 */
    }
    .${prefixCls}-steps-item-tail {
      inset-inline-start: 8px !important;
    }
  `,

  keywords: css`
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    margin-top: 4px;
  `,
  /* 分词结果用等宽字体：它们是被切开后的**词元**，不是自然语言，
     等宽能让「切成了哪几刀」这件事一眼可见 */
  keyword: css`
    margin-inline-end: 0 !important;
    font-family: ${token.fontFamilyCode};
    font-size: ${FONT_SIZE.badge}px;
    line-height: 1.6;
  `,
}))

export function TraceDisclosure({ trace }: { trace: Trace }) {
  const { styles } = useStyles()

  return (
    <Collapse
      ghost
      className={styles.trace}
      items={[
        {
          key: 'trace',
          label: (
            <span className={styles.summary}>
              <Zap size={14} />
              思考 <strong>{trace.rounds}</strong> 轮 · 调用 <strong>{trace.tools}</strong> 次工具 ·
              耗时 <strong>{(trace.tookMs / 1000).toFixed(1)}s</strong>
            </span>
          ),
          children: (
            <Steps
              orientation="vertical"
              size="small"
              className={styles.steps}
              items={trace.steps.map((step) => ({
                // 图标按步骤类型走，最后一步用成功色收尾
                icon: STEP_ICON[step.icon],
                status: step.icon === 'check' ? ('finish' as const) : ('process' as const),
                title: step.text,
                content: (
                  <>
                    {step.keywords && step.keywords.length > 0 && (
                      <span className={styles.keywords}>
                        {step.keywords.map((keyword) => (
                          <Tag key={keyword} className={styles.keyword}>
                            {keyword}
                          </Tag>
                        ))}
                      </span>
                    )}
                    {/* 每一步的具体数字：「词级召回 3 段 · 子串兜底 1 段」。
                        这一行是 trace 里信息量最大的部分——它把「没存过」和
                        「存了但分词没匹配上」区分开 */}
                    {step.meta}
                  </>
                ),
              }))}
            />
          ),
        },
      ]}
    />
  )
}
