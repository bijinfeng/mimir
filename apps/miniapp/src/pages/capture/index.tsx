import { useEffect, useRef, useState } from 'react'
import { View, Text, Input } from '@tarojs/components'
import Taro, { useDidShow, useDidHide, useRouter, useUnload } from '@tarojs/taro'
import type { MiniappOperation } from '@mimir/shared/miniapp'
import { Action, Gate, FolderPicker, ErrorNotice, useFolders } from '../../components/ui'
import {
  ApiError,
  errorMessage,
  sendWrite,
  recoverWrite,
  operationProblem,
  pendingWrite,
} from '../../lib/api'
import { useSession, getSession } from '../../lib/session'
import { localKey, readStorage, writeStorage, requestId } from '../../lib/storage'
import { openReader } from '../../lib/navigation'
interface CaptureDraft {
  url: string
  folder: string
  requestId?: string
  operation?: MiniappOperation
}
export default function CapturePage() {
  const session = useSession()
  const router = useRouter()
  return (
    <Gate>
      {session && (
        <Capture
          key={session.user.id}
          ownerId={session.user.id}
          initialFolder={router.params.folder || ''}
        />
      )}
    </Gate>
  )
}
function Capture({ ownerId, initialFolder }: { ownerId: string; initialFolder: string }) {
  const initial = useRef(readStorage<CaptureDraft>(localKey(ownerId, 'capture')))
  const [form, setForm] = useState<CaptureDraft>(
    initial.current || { url: '', folder: initialFolder },
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { folders, error: foldersError } = useFolders()
  const latest = useRef(form)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visible = useRef(true)
  const inFlight = useRef(false)
  const attempts = useRef(0)
  const mounted = useRef(true)
  latest.current = form
  const valid = () => mounted.current && getSession()?.user.id === ownerId
  function persist(value = latest.current) {
    try {
      writeStorage(localKey(ownerId, 'capture'), value)
    } catch (error) {
      if (valid()) setError(errorMessage(error))
    }
  }
  function update(value: CaptureDraft) {
    latest.current = value
    setForm(value)
    persist(value)
  }
  function stop() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  function schedule() {
    stop()
    if (
      !visible.current ||
      attempts.current >= 12 ||
      !latest.current.requestId ||
      latest.current.operation?.status !== 'pending'
    )
      return
    timer.current = setTimeout(
      () => {
        attempts.current++
        void recover()
      },
      Math.min(5000, 1000 + attempts.current * 500),
    )
  }
  function accept(operation: MiniappOperation) {
    if (!valid()) return
    update({ ...latest.current, operation })
    setError(
      operation.status === 'failed' || operation.status === 'interrupted'
        ? operationProblem(operation)
        : '',
    )
    if (operation.status === 'pending') schedule()
    else stop()
  }
  async function recover() {
    const id = latest.current.requestId
    if (!id || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      accept(await recoverWrite(id))
    } catch (error) {
      if (valid())
        setError(
          error instanceof ApiError && error.status === 404
            ? '服务端未找到此操作。可重发原请求；请勿反复新建收集。'
            : errorMessage(error),
        )
    } finally {
      inFlight.current = false
      if (valid()) setBusy(false)
    }
  }
  async function submit() {
    if (inFlight.current || !form.url.trim() || !form.folder || form.requestId) return
    if (!/^https?:\/\/\S+$/i.test(form.url.trim())) {
      setError('请输入完整的 HTTP/HTTPS 链接。')
      return
    }
    const id = requestId()
    const value = { ...form, url: form.url.trim(), requestId: id }
    update(value)
    inFlight.current = true
    setBusy(true)
    setError('')
    attempts.current = 0
    try {
      accept(
        await sendWrite(ownerId, '/capture', {
          requestId: id,
          url: value.url,
          folder: value.folder,
        }),
      )
    } catch (error) {
      if (valid()) {
        setError(errorMessage(error))
        if (
          error instanceof ApiError &&
          error.status > 0 &&
          error.status < 500 &&
          ![408, 429].includes(error.status)
        )
          update({ ...value, requestId: undefined })
      }
    } finally {
      inFlight.current = false
      if (valid()) setBusy(false)
    }
  }
  async function retryOriginal() {
    const id = latest.current.requestId
    if (!id || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      try {
        accept(await recoverWrite(id))
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error
        const pending = pendingWrite(ownerId, id)
        if (!pending) throw new Error('原请求不在本机，请先到知识库确认是否已收集，再发起新操作。')
        accept(await sendWrite(ownerId, pending.path, { ...pending.data, requestId: id }))
      }
    } catch (error) {
      if (valid()) setError(errorMessage(error))
    } finally {
      inFlight.current = false
      if (valid()) setBusy(false)
    }
  }
  useDidShow(() => {
    visible.current = true
    attempts.current = 0
    if (latest.current.requestId && latest.current.operation?.status !== 'succeeded') void recover()
  })
  useDidHide(() => {
    visible.current = false
    stop()
    persist()
  })
  useUnload(() => {
    mounted.current = false
    visible.current = false
    stop()
    persist()
  })
  useEffect(
    () => () => {
      mounted.current = false
      stop()
    },
    [],
  )
  const operation = form.operation
  const result = operation?.result?.type === 'capture' ? operation.result.capture : null
  const stageNames = {
    fetch: '获取页面',
    extract: '提取正文',
    assets: '下载图片',
    convert: '转换与入库',
  }
  const locked = busy || Boolean(form.requestId)
  return (
    <View className="page">
      <Text className="page-title">收集链接</Text>
      <Text className="field-label section">资料链接</Text>
      <Input
        className="field"
        value={form.url}
        maxlength={2000}
        disabled={locked}
        placeholder="https://"
        onInput={(event) => update({ ...form, url: event.detail.value })}
      />
      <FolderPicker
        folders={folders}
        value={form.folder}
        disabled={locked}
        onChange={(folder) => update({ ...form, folder })}
      />
      <ErrorNotice error={error || foldersError} />
      {!form.requestId && (
        <View className="section">
          <Action
            primary
            disabled={busy || !form.folder || !form.url.trim()}
            onClick={() => {
              void submit()
            }}
          >
            收集
          </Action>
        </View>
      )}
      {form.requestId && (
        <View className="section">
          <Text className="section-title">
            {operation?.status === 'succeeded'
              ? result?.documentId
                ? result.stages.some((stage) => stage.status === 'failed')
                  ? '已入库，部分资源未完成'
                  : '已入库'
                : '处理结束，未生成资料'
              : operation?.status === 'failed'
                ? '收集失败'
                : operation?.status === 'interrupted'
                  ? '结果待确认'
                  : '正在获取资料，等待服务端结果'}
          </Text>
          {result && (
            <>
              <Text className="block muted">
                {result.label} · {result.note}
              </Text>
              {result.preview && (
                <View className="section-small">
                  <Text className="row-title">{result.preview.title}</Text>
                  <Text className="block muted">{result.preview.excerpt}</Text>
                  <Text className="row-meta">
                    {result.preview.charCount} 字 · {result.preview.imageCount} 张图片
                  </Text>
                </View>
              )}
              {result.stages.map((stage) => (
                <View className="stage-row" key={stage.stage}>
                  <Text className="strong">
                    {stageNames[stage.stage]} · {stage.status === 'done' ? '完成' : '失败'}
                  </Text>
                  <Text className="block muted">{stage.error || stage.meta || ''}</Text>
                </View>
              ))}
              {result.documentId && (
                <Action
                  primary
                  onClick={() => {
                    void openReader(result.documentId!)
                  }}
                >
                  查看资料
                </Action>
              )}
            </>
          )}
          <View className="action-row section-small">
            {operation?.status !== 'succeeded' && (
              <>
                <Action
                  disabled={busy}
                  onClick={() => {
                    attempts.current = 0
                    void recover()
                  }}
                >
                  查询结果
                </Action>
                <Action
                  disabled={busy}
                  onClick={() => {
                    void retryOriginal()
                  }}
                >
                  重发原请求
                </Action>
              </>
            )}
            {operation && operation.status !== 'pending' && (
              <Action
                disabled={busy}
                onClick={() => {
                  void Taro.showModal({
                    title: operation.status === 'succeeded' ? '继续收集' : '发起新收集？',
                    content:
                      operation.status === 'interrupted'
                        ? '旧操作结果可能不确定，请先在知识库确认，避免重复保存。'
                        : '将保留当前链接和位置，允许修改后发起一次新操作。',
                    confirmText: '继续',
                  }).then((answer) => {
                    if (answer.confirm) {
                      stop()
                      update({ url: form.url, folder: form.folder })
                      setError('')
                    }
                  })
                }}
              >
                修改 / 新收集
              </Action>
            )}
          </View>
        </View>
      )}
      <Text className="block muted small section">
        公众号或网页图片可能因防盗链失败。页面只展示服务端返回的真实阶段结果。
      </Text>
    </View>
  )
}
