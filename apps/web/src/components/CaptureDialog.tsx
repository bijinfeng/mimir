import { CheckOutlined, CloseOutlined, InboxOutlined, LoadingOutlined } from '@ant-design/icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Input, Modal, Segmented, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { useState } from 'react'
import type { CaptureStage, CaptureStageResult, DetectedSource } from '@mimir/shared'
import { detectSource } from '@mimir/shared'
import { UploadPanel } from '@/components/UploadPanel'
import { api } from '@/lib/api'
import { FONT_SIZE } from '@/theme/tokens'

/**
 * 收集内容对话框：**粘贴链接与上传文件两个页签**（`docs/TECH.md` §13）。
 *
 * 这是原型阶段补的第一个洞（`docs/PRD.md` §2.2）：插件列表里列了六个抓取器，
 * 但界面上根本没有地方粘贴链接。收集不到东西，后面整条链都没有意义。
 *
 * 上传文件与粘贴链接是**同一件事**——把外部的东西收进库，抓到即入库（收件箱
 * 流程已随 D-054 退役，新内容直接可用）。
 * 合成一个对话框而不是两个入口：用户不该先判断「我这次算哪种」，
 * 而那个判断对结果没有任何影响。
 *
 * 抓取过程**分阶段推进**，不是一个转圈：抓取失败时能直接指认是哪一步挂的。
 *「获取页面」失败是反爬，「提取正文」失败是页面结构不认识，「下载图片」
 * 失败是防盗链——三者对用户的下一步动作完全不同。
 */

export interface CaptureDialogProps {
  open: boolean
  onClose: () => void
  onCaptured: (documentId: string) => void
}

const STAGE_LABEL: Record<CaptureStage, string> = {
  fetch: '获取页面',
  extract: '提取正文',
  assets: '处理图片',
  convert: '统一转 Markdown',
}

const STAGE_ORDER: CaptureStage[] = ['fetch', 'extract', 'assets', 'convert']

const useStyles = createStyles(({ css, token }) => ({
  body: css`
    display: flex;
    flex-direction: column;
    gap: 12px;
  `,
  /* 两个页签的切换条。放在弹窗内容区顶部、通栏等宽——
     「粘贴链接 / 上传文件」是同一个动作的两种方式，没有主次 */
  tabs: css`
    margin-bottom: 16px;
  `,
  hint: css`
    font-size: ${FONT_SIZE.meta}px;
    line-height: 1.7;
    color: ${token.colorTextTertiary};
  `,

  /* 识别结果：输入框下方一行，告诉用户这会走哪条抓取路径 */
  kind: css`
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextSecondary};

    b {
      color: ${token.colorText};
    }
  `,
  kindWarn: css`
    color: ${token.colorWarningText};
  `,

  stages: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px 0;
  `,
  stage: css`
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 2px;
    font-size: ${FONT_SIZE.excerpt}px;
    color: ${token.colorTextSecondary};
  `,
  stageActive: css`
    color: ${token.colorText};
    font-weight: 500;
  `,
  stageDot: css`
    flex: none;
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextQuaternary};
    background: ${token.colorFillQuaternary};
  `,
  /**
   * 阶段标记的三种终态。
   *
   * **成对使用语义色**（浅底 + 同语义文字），与设置页的状态徽标同一个形态。
   * 原先这里是「语义实色底 + 白字」，两套外观下都不达标：白字压 `colorSuccess`
   * 浅色下只有 1.94:1，深色 2.98:1——而图标本身是「这一步成没成」的唯一线索。
   * 深色的语义实色比浅色亮（antd 的深色色阶如此），所以「白字压实色」
   * 在深色里只会更糟。成对使用则两边都过（`design.test.ts` 守着这三组）。
   */
  stageDotDone: css`
    color: ${token.colorSuccessText};
    background: ${token.colorSuccessBg};
  `,
  stageDotFail: css`
    color: ${token.colorErrorText};
    background: ${token.colorErrorBg};
  `,
  stageDotRun: css`
    /* 文字角色用 colorLink 而不是 colorPrimary——主色作文字在浅底上只有
       3.66:1，深色下更是 2.47:1（DESIGN §3.5 的同一条） */
    color: ${token.colorLink};
    background: ${token.colorPrimaryBg};
  `,
  stageMeta: css`
    margin-left: auto;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
    font-variant-numeric: tabular-nums;
  `,

  preview: css`
    padding: 11px 13px;
    border: 1px solid ${token.colorBorderSecondary};
    border-radius: 8px;
    background: ${token.tintList};
  `,
  previewTitle: css`
    font-size: ${FONT_SIZE.item}px;
    font-weight: 600;
    color: ${token.colorText};
    margin-bottom: 5px;
  `,
  previewText: css`
    font-size: ${FONT_SIZE.note}px;
    line-height: 1.7;
    color: ${token.colorTextSecondary};
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  `,
  previewMeta: css`
    display: flex;
    gap: 12px;
    margin-top: 8px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
  `,

  footer: css`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
  `,
  footerHint: css`
    flex: 1;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    text-align: left;
  `,
}))

export function CaptureDialog({ open, onClose, onCaptured }: CaptureDialogProps) {
  const { styles, cx } = useStyles()
  const queryClient = useQueryClient()

  const [url, setUrl] = useState('')
  const [tab, setTab] = useState<'url' | 'upload'>('url')
  const [stages, setStages] = useState<CaptureStageResult[]>([])
  const [failure, setFailure] = useState<{ message: string; stage?: string } | null>(null)

  /**
   * 来源识别在**前端本地做**，不走接口。
   *
   * `detectSource` 来自 `@mimir/shared`——服务端抓取时用的是同一个函数。
   * 所以既保证了「界面说的」与「实际做的」一致，又让边打边识别零延迟。
   * 规则只有一条定义处，这是 packages/shared 存在的意义。
   */
  const detected: DetectedSource | null = detectSource(url)

  /** 抓取失败时把已完成的阶段留下来，让用户看到卡在哪一步 */
  const capture = useMutation({
    mutationFn: (target: string) => api.capture.run(target),
    onMutate: () => {
      setFailure(null)
      setStages([])
    },
    onSuccess: (result) => {
      setStages(result.stages)
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['counts'] })

      if (result.documentId) {
        // 留一点时间让阶段列表走完，否则用户看不到「提取正文」这些步骤
        window.setTimeout(() => {
          reset()
          onCaptured(result.documentId!)
        }, 260)
      }
    },
    onError: (error: unknown) => {
      setFailure({
        message: error instanceof Error ? error.message : '抓取失败',
      })
    },
  })

  const reset = () => {
    setUrl('')
    setStages([])
    setFailure(null)
  }

  const close = () => {
    reset()
    onClose()
  }

  /**
   * 阶段进度。
   *
   * 抓取是**一次请求**（服务端分阶段执行，一起返回），所以这里的「进行中」
   * 只体现在最后一个未完成的阶段上。这比伪造动画诚实：
   * 用户看到的每一步都真的发生过。
   */
  const stageStates = STAGE_ORDER.map((stage) => {
    const done = stages.find((item) => item.stage === stage)
    return { stage, result: done }
  })
  const running = capture.isPending

  return (
    <Modal
      open={open}
      onCancel={close}
      title="收集内容"
      width={540}
      destroyOnHidden
      /*
       * 圆角 12px 与命令面板同一档。
       *
       * `docs/DESIGN.md` §5.2 把「对话框、命令面板、输入框组」定为 **12–14px**，
       * 而 antd 的 `borderRadiusLG` 是 base(8) + 2 = 10px（§8.10 记了同一件事），
       * 够不到那个区间。不覆写的话这个对话框是 10px，而命令面板是 12px——
       * 同族浮层并排看会有两种圆角，收集对话框显得更「硬」（实测两张截图
       * 的左上角弧线到 dx=6 / dx=8 才收到直角）。
       */
      styles={{ container: { borderRadius: 12 } }}
      footer={
        <div className={styles.footer}>
          <span className={styles.footerHint}>
            {tab === 'upload'
              ? '上传的文件直接入库，之后按标签与目录整理'
              : failure
                ? '这次没成功。可以先试试别的链接，或改用浏览器扩展。'
                : '抓到的内容直接入库，之后按标签与目录整理'}
          </span>
          <Button onClick={close}>{tab === 'upload' ? '关闭' : '取消'}</Button>
          {/* 上传页签的「行动按钮」在面板里（每行一个结果，按钮要说清打开哪一个），
              所以这里不重复放一个「上传」——它也不知道该上传什么 */}
          {tab === 'url' && (
            <Button
              type="primary"
              loading={running}
              disabled={!detected || running}
              onClick={() => capture.mutate(url.trim())}
            >
              抓取
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.tabs}>
        <Segmented
          block
          value={tab}
          onChange={(value) => setTab(value as 'url' | 'upload')}
          options={[
            { label: '粘贴链接', value: 'url' },
            { label: '上传文件', value: 'upload' },
          ]}
        />
      </div>

      {tab === 'upload' ? (
        <UploadPanel
          onUploaded={(documentId) => {
            close()
            onCaptured(documentId)
          }}
        />
      ) : (
        <div className={styles.body}>
          <Input
            autoFocus
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onPressEnter={() => {
              if (detected && !running) capture.mutate(url.trim())
            }}
            disabled={running}
            allowClear
          />

          {/* 边打边识别来源：让用户在点「抓取」之前就知道会走哪条路 */}
          {detected ? (
            <div className={styles.kind}>
              识别为 <b>{detected.label}</b>
              <span>· {detected.note}</span>
            </div>
          ) : url.trim() ? (
            <div className={cx(styles.kind, styles.kindWarn)}>
              无法识别的链接，需要以 http:// 或 https:// 开头
            </div>
          ) : (
            <div className={styles.hint}>支持网页、公众号文章、GitHub 仓库</div>
          )}

          {(running || stages.length > 0) && (
            <div className={styles.stages}>
              {stageStates.map(({ stage, result }) => {
                // 已完成的阶段之后的第一个阶段就是正在跑的那个
                const doneCount = stages.length
                const index = STAGE_ORDER.indexOf(stage)
                const isRunning = running && index === doneCount
                /*
                 * **必须收成 boolean。** `failure` 是 `{…} | null`，直接写
                 * `failure && index === doneCount` 时失败为 null 的那一帧
                 * `failed` 就是 `null`，而它被传给了 antd-style 的 `cx`——
                 * `isReactCssResult(null)` 会执行 `'styles' in null` 并抛
                 * TypeError（实测：点「抓取」的**那一刻**对话框就崩，
                 * 整棵树被 error boundary 接走，连成功后的 toast 都到不了）。
                 * `false` / `undefined` 没有问题，只有 `null` 会。
                 */
                const failed = Boolean(failure) && index === doneCount

                return (
                  <div key={stage} className={cx(styles.stage, isRunning && styles.stageActive)}>
                    <span
                      className={cx(
                        styles.stageDot,
                        result && styles.stageDotDone,
                        failed && styles.stageDotFail,
                        isRunning && styles.stageDotRun,
                      )}
                    >
                      {result ? (
                        <CheckOutlined />
                      ) : failed ? (
                        <CloseOutlined />
                      ) : isRunning ? (
                        <LoadingOutlined />
                      ) : null}
                    </span>
                    <span>{STAGE_LABEL[stage]}</span>
                    {result?.meta && <span className={styles.stageMeta}>{result.meta}</span>}
                  </div>
                )
              })}
            </div>
          )}

          {/* 失败时把原因原样带出来，并给出针对这一类的出路 */}
          {failure && (
            <Alert
              type="warning"
              showIcon
              message={failure.message}
              description={
                detected?.kind === 'wechat' ? (
                  <span className={styles.hint}>
                    公众号反爬严格，高频访问会撞墙，图片还需要 Referer 才下得动。
                    可以稍后重试，或改用浏览器扩展在你的会话里抓取。
                  </span>
                ) : undefined
              }
            />
          )}

          {!running && stages.length === STAGE_ORDER.length && !failure && (
            <div className={styles.preview}>
              <div className={styles.previewTitle}>抓取完成</div>
              <div className={styles.previewMeta}>
                <span>{stages[1]?.meta ?? ''}</span>
                <span>{stages[2]?.meta ?? ''}</span>
              </div>
            </div>
          )}

          {running && (
            <Typography.Text type="secondary" className={styles.hint}>
              <InboxOutlined /> 抓完会直接入库
            </Typography.Text>
          )}
        </div>
      )}
    </Modal>
  )
}
