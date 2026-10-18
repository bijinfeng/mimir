import type { CaptureStage, CaptureStageResult } from '@mimir/shared'
import { Check, X } from 'lucide-react'
import { useCaptureStyles } from './styles'
export const STAGE_LABEL: Record<CaptureStage, string> = {
  fetch: '获取页面',
  extract: '提取正文',
  assets: '处理图片',
  convert: '整理内容',
}
export const STAGE_ORDER: CaptureStage[] = ['fetch', 'extract', 'assets', 'convert']

export function CaptureStages({
  stages,
  failedStage,
}: {
  stages: CaptureStageResult[]
  failedStage?: CaptureStage
}) {
  const { styles } = useCaptureStyles()
  return (
    <div className={styles.stages} aria-label="服务器返回的阶段结果" role="status">
      {STAGE_ORDER.map((stage) => {
        const result = stages.find((item) => item.stage === stage)
        const state = result?.status ?? (stage === failedStage ? 'failed' : undefined)
        return (
          <div className={styles.stage} key={stage}>
            <span className={styles.dot} data-state={state}>
              {state === 'done' ? (
                <Check size={13} aria-hidden="true" />
              ) : state === 'failed' ? (
                <X size={13} aria-hidden="true" />
              ) : null}
            </span>
            <span>{STAGE_LABEL[stage]}</span>
            <span className={styles.stageMeta}>
              {state === 'failed'
                ? (result?.error ?? '失败')
                : (result?.meta ?? (state === 'done' ? '完成' : '未返回状态'))}
            </span>
          </div>
        )
      })}
    </div>
  )
}
