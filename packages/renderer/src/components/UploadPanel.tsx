import { Alert, Button, Typography, Upload } from 'antd'
import { createStyles } from 'antd-style'
import { CircleCheck, CircleX, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { FILE_MAX_BYTES, formatBytes, formatLabel } from '@mimir/shared'
import { api } from '../lib/api'
import { FONT_SIZE } from '../theme/tokens'

/**
 * 「上传文件」这一页（`.trellis/spec/project/architecture.md` §13）。
 *
 * ## 为什么放在「收集内容」对话框里，而不是一个顶层按钮
 *
 * 粘贴链接与上传文件是**同一件事**：把外部的东西收进库。分成两个入口会让
 * 用户每次先判断「我这次算哪种」，而那个判断对目标没有任何影响——
 * 两者都进收件箱、都要整理（`.trellis/spec/project/product.md` §2.2 的收集环节）。
 *
 * ## 多选，但**逐个串行发请求**
 *
 * 一次 multipart 带多个文件看起来更省，但部分失败的报告会变成一团糊：
 * 三个文件里第二个失败时，界面该显示什么？标签应用到谁身上？
 * 逐个请求天然给出逐文件的答案，而单用户上传几个文件不是性能问题。
 *
 * ## 每个文件的结果如实分三种
 *
 * | 结果 | 界面 |
 * |---|---|
 * | 存下且提取出正文 | ✓ 原文名 · N 字 |
 * | 存下但没有正文 | ✓ 原文名 · 原件已保存（原因在详情里说） |
 * | 没存下（太大 / 空文件 / 网络） | ✗ 原文名 · 原因 |
 *
 * 中间那一行**必须算成功**：原件在库里、能下载、能整理，只是暂时搜不到。
 * 把它画成失败（红色叉）等于告诉用户白传了。
 */
export interface UploadPanelProps {
  onUploaded: (documentId: string) => void
  /** 归入的目录。从知识库页唤起时带当前路径；不带 = 库根 */
  folder?: string | null
  /** 用文件夹选择器（webkitdirectory），按相对子路径展开成目录树 */
  directory?: boolean
}

interface UploadRow {
  /** 稳定的 key：文件名 + 序号（同名文件会重复） */
  key: string
  name: string
  size: number
  state: 'pending' | 'uploading' | 'done' | 'failed'
  /** 成功后：正文字符数；失败后：原因 */
  detail: string
  documentId: string | null
}

/**
 * 这个文件该归入哪个目录。
 *
 * 文件夹上传时浏览器给每个文件一个 `webkitRelativePath`
 * （如 `论文集/2024/a.pdf`）——**首段是所选文件夹自己的名字**，保留它：
 * 用户选的是「论文集」，收进来就叫「论文集」，目录结构原样重现。
 * 单文件上传没有相对路径，落进目标目录本身。
 */
function targetFolderFor(file: File, folder?: string | null): string | undefined {
  const relative = file.webkitRelativePath ?? ''
  const dir = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : ''
  if (!dir) return folder ?? undefined
  return folder ? `${folder}/${dir}` : dir
}

export function UploadPanel({ onUploaded, folder, directory }: UploadPanelProps) {
  const { styles } = useStyles()
  const [rows, setRows] = useState<UploadRow[]>([])
  const [busy, setBusy] = useState(false)

  const allDone = rows.length > 0 && !busy && rows.every((row) => row.state !== 'pending')

  /**
   * 逐个上传。**串行**而不是并发：并发会让「哪个先完成」不确定，
   * 而下面的进度行是按选择顺序排的——顺序一跳，用户就找不到刚才那一条了。
   */
  async function uploadAll(files: File[]) {
    setBusy(true)

    const initial: UploadRow[] = files.map((file, index) => ({
      key: `${file.name}-${index}`,
      name: file.webkitRelativePath || file.name,
      size: file.size,
      state: 'pending',
      detail: '',
      documentId: null,
    }))
    setRows(initial)

    for (const [index, file] of files.entries()) {
      const target = targetFolderFor(file, folder)

      setRows((current) =>
        current.map((row, i) => (i === index ? { ...row, state: 'uploading' } : row)),
      )

      // 前端先挡一道大小：省掉一次必然失败的往返，也让反馈是立刻的。
      // 服务端仍然会校验——前端校验是体验，不是边界
      if (file.size > FILE_MAX_BYTES) {
        setRows((current) =>
          current.map((row, i) =>
            i === index
              ? {
                  ...row,
                  state: 'failed',
                  detail: `文件太大（${formatBytes(file.size)}），上限 ${formatBytes(FILE_MAX_BYTES)}`,
                }
              : row,
          ),
        )
        continue
      }

      try {
        const result = await api.documents.upload(file, target)
        setRows((current) =>
          current.map((row, i) =>
            i === index
              ? {
                  ...row,
                  state: 'done',
                  // 「存下但没有正文」也是成功——原因在详情里说明
                  detail:
                    result.charCount > 0
                      ? `已提取 ${result.charCount.toLocaleString('zh-CN')} 字`
                      : '原件已保存；可搜索状态见详情',
                  documentId: result.document.id,
                }
              : row,
          ),
        )
      } catch (error) {
        setRows((current) =>
          current.map((row, i) =>
            i === index
              ? {
                  ...row,
                  state: 'failed',
                  detail: error instanceof Error ? error.message : '上传失败',
                }
              : row,
          ),
        )
      }
    }

    setBusy(false)
  }

  /** 打开第一个成功的文档——用户刚传的通常是它，而失败的那些会留在列表上看得到 */
  const firstDone = rows.find((row) => row.state === 'done' && row.documentId !== null)

  return (
    <div className={styles.body}>
      <Upload.Dragger
        multiple
        /* 「上传文件夹」模式：webkitdirectory 选择整个目录，每个文件自带
           webkitRelativePath（见 targetFolderFor） */
        directory={directory}
        // 不设 accept：**任何格式都能收**。认不出的格式原件仍然保存、
        // 能下载——用一个 accept 白名单把用户挡在外面，等于替他决定
        // 什么东西不属于他的知识库
        beforeUpload={(_file, fileList) => {
          // 只在最后一个文件时触发一次上传（antd 会为每个文件调一次）
          if (fileList.length > 0 && _file === fileList[fileList.length - 1]) {
            void uploadAll(fileList as unknown as File[])
          }
          // 返回 false 阻止 antd 自己的上传——我们走自己的 API 客户端
          return false
        }}
        disabled={busy}
        showUploadList={false}
        className={styles.dragger}
      >
        <p className={styles.dropTitle}>
          {directory ? '选择一个文件夹' : '把文件拖到这里，或点击选择'}
        </p>
        <p className={styles.dropHint}>
          {directory
            ? '保留目录结构，跳过空文件夹'
            : `单个文件不超过 ${formatBytes(FILE_MAX_BYTES)}。Markdown 导入为笔记，其他格式保存原件`}
        </p>
      </Upload.Dragger>

      {rows.length > 0 && (
        <div className={styles.rows}>
          {rows.map((row) => (
            <div key={row.key} className={styles.row}>
              <span className={styles.rowIcon}>{iconFor(row.state, styles)}</span>
              <span className={styles.rowName} title={row.name}>
                {row.name}
              </span>
              <span className={styles.rowFormat}>
                {formatLabel(null, row.name)} · {formatBytes(row.size)}
              </span>
              <span className={styles.rowDetail}>{row.detail}</span>
            </div>
          ))}
        </div>
      )}

      {allDone && (
        <Alert
          type={rows.some((row) => row.state === 'failed') ? 'warning' : 'success'}
          showIcon
          message={
            rows.every((row) => row.state === 'done')
              ? `${rows.length} 个文件已上传`
              : '部分文件上传失败，请查看上方原因'
          }
        />
      )}

      {firstDone?.documentId && (
        <div className={styles.actions}>
          <Button type="primary" onClick={() => onUploaded(firstDone.documentId!)}>
            打开《<Typography.Text>{firstDone.name}</Typography.Text>》
          </Button>
          <Button onClick={() => setRows([])}>继续上传</Button>
        </div>
      )}
    </div>
  )
}

/** 每行的状态图标。颜色走语义 token——深色下也要对（DESIGN §3.4） */
function iconFor(state: UploadRow['state'], styles: Record<string, string>) {
  if (state === 'done') return <CircleCheck className={styles.iconDone} size={14} />
  if (state === 'failed') return <CircleX className={styles.iconFail} size={14} />
  if (state === 'uploading') return <LoaderCircle size={14} />
  return null
}

const useStyles = createStyles(({ css, token }) => ({
  body: css`
    display: flex;
    flex-direction: column;
    gap: 14px;
  `,
  dragger: css`
    /* antd 的 Dragger 自带虚线框与 hover 提亮，这里只调内边距——
       「拖拽区要看起来像能放东西」由它的默认形态负责 */
    padding: 8px 0;
  `,
  dropTitle: css`
    margin: 0;
    font-size: ${FONT_SIZE.body}px;
    color: ${token.colorText};
  `,
  dropHint: css`
    margin: 6px 0 0;
    font-size: ${FONT_SIZE.meta}px;
    color: ${token.colorTextTertiary};
    line-height: 1.7;
  `,
  rows: css`
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 240px;
    overflow: auto;
  `,
  row: css`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: ${FONT_SIZE.item}px;
    background: ${token.colorFillQuaternary};
  `,
  rowIcon: css`
    display: inline-flex;
    width: 16px;
    color: ${token.colorTextTertiary};
  `,
  rowName: css`
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  rowFormat: css`
    flex: none;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextQuaternary};
    white-space: nowrap;
  `,
  rowDetail: css`
    flex: none;
    max-width: 180px;
    font-size: ${FONT_SIZE.badge}px;
    color: ${token.colorTextTertiary};
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  actions: css`
    display: flex;
    gap: 8px;
  `,
  iconDone: css`
    color: ${token.colorSuccessText};
  `,
  iconFail: css`
    color: ${token.colorErrorText};
  `,
}))
