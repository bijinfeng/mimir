import { useEffect, useRef, useState } from 'react'
import { View, Text, Input, Textarea } from '@tarojs/components'
import Taro, { useDidHide, useRouter, useUnload } from '@tarojs/taro'
import type { MiniappDocument, MiniappOperation } from '@mimir/shared/miniapp'
import { Action, Gate, ErrorNotice, FolderPicker, useFolders } from '../../components/ui'
import { Markdown } from '../../components/markdown'
import {
  api,
  errorMessage,
  ApiError,
  sendWrite,
  recoverWrite,
  pendingWrite,
  operationProblem,
} from '../../lib/api'
import { useSession, getSession } from '../../lib/session'
import { draftKey, readStorage, writeStorage, requestId, type NoteDraft } from '../../lib/storage'

type Mode = NoteDraft['mode']
export default function EditorPage() {
  const session = useSession()
  const router = useRouter()
  const id = router.params.id || ''
  const mode: Mode = ['edit', 'append', 'metadata'].includes(router.params.mode || '')
    ? (router.params.mode as Mode)
    : 'new'
  return (
    <Gate>
      {session && (
        <Editor
          key={`${session.user.id}:${id}:${mode}:${router.params.draft || ''}`}
          ownerId={session.user.id}
          id={id}
          mode={mode}
          folder={router.params.folder || ''}
          restoreIdentity={router.params.draft}
        />
      )}
    </Gate>
  )
}
function Editor({
  ownerId,
  id,
  mode,
  folder,
  restoreIdentity,
}: {
  ownerId: string
  id: string
  mode: Mode
  folder: string
  restoreIdentity?: string
}) {
  const identity = useRef(
    restoreIdentity || (mode === 'new' ? `new:${requestId()}` : `${mode}:${id}`),
  ).current
  const initial = useRef(readStorage<NoteDraft>(draftKey(ownerId, identity)))
  const [draft, setDraft] = useState<NoteDraft>(
    initial.current || {
      identity,
      documentId: id || null,
      mode,
      title: '',
      body: '',
      tags: [],
      folder,
      revision: '',
      updatedAt: new Date().toISOString(),
    },
  )
  const [tagText, setTagText] = useState(initial.current?.tags.join(', ') || '')
  const [document, setDocument] = useState<MiniappDocument | null>(null)
  const [ready, setReady] = useState(mode === 'new')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [restored, setRestored] = useState(Boolean(initial.current))
  const [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState(false)
  const { folders, error: folderError } = useFolders()
  const latest = useRef(draft)
  const alive = useRef(true)
  const modified = useRef(Boolean(initial.current))
  const busyRef = useRef(false)
  latest.current = draft
  function valid() {
    return alive.current && getSession()?.user.id === ownerId
  }
  function persist() {
    if (modified.current && !saved) {
      try {
        writeStorage(draftKey(ownerId, identity), latest.current)
      } catch (error) {
        if (valid()) setError(errorMessage(error))
      }
    }
  }
  function replaceDraft(value: NoteDraft) {
    latest.current = value
    setDraft(value)
  }
  function change(patch: Partial<NoteDraft>) {
    if (busyRef.current || latest.current.pendingRequestId) return
    modified.current = true
    const value = { ...latest.current, ...patch, updatedAt: new Date().toISOString() }
    replaceDraft(value)
    try {
      writeStorage(draftKey(ownerId, identity), value)
    } catch (error) {
      setError(errorMessage(error))
    }
  }
  function fromDocument(value: MiniappDocument): NoteDraft {
    return {
      identity,
      documentId: value.id,
      mode,
      title: value.title,
      body: mode === 'append' ? '' : value.body,
      tags: value.tags,
      folder: value.folder || '',
      revision: value.revision,
      updatedAt: new Date().toISOString(),
    }
  }
  useEffect(() => {
    let live = true
    if (mode !== 'new')
      api
        .document(id)
        .then((result) => {
          if (!live || !valid()) return
          if (mode !== 'metadata' && !result.document.canEditBody) {
            setError('此资料正文只读，只能整理标题、标签和位置。')
            return
          }
          setDocument(result.document)
          if (!initial.current) {
            replaceDraft(fromDocument(result.document))
            setTagText(result.document.tags.join(', '))
          }
          setReady(true)
        })
        .catch((error) => {
          if (live && valid()) setError(errorMessage(error))
        })
    return () => {
      live = false
      alive.current = false
    }
  }, [id, mode, ownerId, identity])
  useEffect(() => {
    if (modified.current && !saved)
      void Taro.enableAlertBeforeUnload({
        message: '未保存内容已保留为本机草稿，离开前请确认。',
      }).catch(() => undefined)
    else void Taro.disableAlertBeforeUnload().catch(() => undefined)
    return () => {
      void Taro.disableAlertBeforeUnload().catch(() => undefined)
    }
  }, [draft.updatedAt, saved])
  useDidHide(persist)
  useUnload(persist)
  async function settle(operation: MiniappOperation) {
    if (!valid()) return
    if (operation.status !== 'succeeded') {
      setError(operationProblem(operation))
      if (operation.status === 'failed') {
        const value = { ...latest.current, pendingRequestId: undefined }
        replaceDraft(value)
        writeStorage(draftKey(ownerId, identity), value)
        if (operation.error?.code === 'DOCUMENT_CONFLICT') setConflict(true)
      }
      return
    }
    if (operation.result?.type !== 'document')
      throw new Error('保存返回结果不完整，请查询操作结果。')
    const result = await api.document(operation.result.document.id)
    if (!valid()) return
    setSaved(true)
    modified.current = false
    Taro.removeStorageSync(draftKey(ownerId, identity))
    replaceDraft({
      ...latest.current,
      revision: result.document.revision,
      pendingRequestId: undefined,
    })
    await Taro.redirectTo({
      url: `/pages/reader/index?id=${encodeURIComponent(result.document.id)}`,
    })
  }
  async function save() {
    if (
      !ready ||
      busyRef.current ||
      (mode !== 'append' && !draft.folder) ||
      (mode !== 'append' && !draft.title.trim()) ||
      (mode === 'append' && !draft.body.trim())
    )
      return
    if (draft.tags.length > 20 || draft.tags.some((tag) => tag.length > 50)) {
      setError('标签最多 20 个，每个最多 50 个字。请调整后保存。')
      return
    }
    const recovering = Boolean(latest.current.pendingRequestId)
    let receivedOperation = false
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const current = latest.current
      if (current.pendingRequestId) {
        await settle(await recoverWrite(current.pendingRequestId))
        return
      }
      const operationId = requestId()
      const pending = { ...current, pendingRequestId: operationId }
      replaceDraft(pending)
      modified.current = true
      writeStorage(draftKey(ownerId, identity), pending)
      let path: string
      let payload: Record<string, unknown> & { requestId: string }
      if (mode === 'new') {
        path = '/notes'
        payload = {
          requestId: operationId,
          title: current.title.trim(),
          body: current.body,
          folder: current.folder,
          tags: current.tags,
        }
      } else if (mode === 'append') {
        path = `/documents/${encodeURIComponent(id)}/append`
        payload = { requestId: operationId, expectedRevision: current.revision, text: current.body }
      } else {
        path = `/documents/${encodeURIComponent(id)}/update`
        payload = {
          requestId: operationId,
          expectedRevision: current.revision,
          title: current.title.trim(),
          tags: current.tags,
          folder: current.folder,
          ...(mode === 'edit' ? { body: current.body } : {}),
        }
      }
      const operation = await sendWrite(ownerId, path, payload)
      receivedOperation = true
      await settle(operation)
    } catch (error) {
      if (!valid()) return
      setError(errorMessage(error))
      if (
        !recovering &&
        !receivedOperation &&
        error instanceof ApiError &&
        error.status > 0 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 429
      ) {
        replaceDraft({ ...latest.current, pendingRequestId: undefined })
        persist()
        if (error.code === 'DOCUMENT_CONFLICT') setConflict(true)
      }
    } finally {
      busyRef.current = false
      if (valid()) setBusy(false)
    }
  }
  async function retryOriginal() {
    const operationId = latest.current.pendingRequestId
    if (!operationId || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      try {
        await settle(await recoverWrite(operationId))
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error
        const original = pendingWrite(ownerId, operationId)
        if (!original)
          throw new Error('本机原始请求不存在。请保留草稿，刷新资料确认保存结果，再新建操作。')
        const result = await Taro.showModal({
          title: '重发原请求？',
          content: '服务端未找到此操作，将使用相同请求编号与原始内容重发。',
          confirmText: '重发',
        })
        if (result.confirm)
          await settle(
            await sendWrite(ownerId, original.path, { ...original.data, requestId: operationId }),
          )
      }
    } catch (error) {
      if (valid()) setError(errorMessage(error))
    } finally {
      busyRef.current = false
      if (valid()) setBusy(false)
    }
  }
  async function reload(keep: boolean) {
    if (busyRef.current || mode === 'new') return
    setBusy(true)
    busyRef.current = true
    setError('')
    try {
      if (keep) {
        const old = {
          ...latest.current,
          identity: `${identity}:preserved:${requestId()}`,
          pendingRequestId: undefined,
        }
        writeStorage(draftKey(ownerId, old.identity), old)
      }
      const result = await api.document(id)
      if (!valid()) return
      setDocument(result.document)
      setConflict(false)
      setRestored(false)
      modified.current = false
      Taro.removeStorageSync(draftKey(ownerId, identity))
      replaceDraft(fromDocument(result.document))
      setTagText(result.document.tags.join(', '))
      setReady(true)
    } catch (error) {
      if (valid()) setError(errorMessage(error))
    } finally {
      busyRef.current = false
      if (valid()) setBusy(false)
    }
  }
  async function saveAsNew() {
    if (busyRef.current || !draft.folder) return
    const fresh = {
      ...latest.current,
      identity: `new:${requestId()}`,
      documentId: null,
      mode: 'new' as const,
      title: `${draft.title || document?.title || '笔记'}（${mode === 'append' ? '追加草稿' : '草稿'}）`,
      revision: '',
      pendingRequestId: undefined,
      updatedAt: new Date().toISOString(),
    }
    try {
      writeStorage(draftKey(ownerId, fresh.identity), fresh)
      await Taro.navigateTo({
        url: `/pages/editor/index?mode=new&draft=${encodeURIComponent(fresh.identity)}`,
      })
    } catch (error) {
      setError(errorMessage(error))
    }
  }
  async function leave() {
    if (modified.current && !saved) {
      const result = await Taro.showModal({
        title: '保留草稿并离开？',
        content: '未保存内容将保留在本机“我的 → 草稿”，不会自动提交。',
        confirmText: '保留并离开',
      })
      if (!result.confirm) return
      persist()
    }
    await Taro.navigateBack().catch(() => Taro.switchTab({ url: '/pages/library/index' }))
  }
  const title =
    mode === 'append'
      ? '追加笔记'
      : mode === 'metadata'
        ? '整理资料'
        : mode === 'new'
          ? '新笔记'
          : '编辑笔记'
  const disabled = busy || Boolean(draft.pendingRequestId)
  return (
    <View className="page editor-page">
      <View className="toolbar editor-toolbar">
        <Text className="page-title">{title}</Text>
        <View className="action-row">
          <Action
            disabled={busy}
            onClick={() => {
              void leave()
            }}
          >
            返回
          </Action>
          <Action
            primary
            disabled={
              busy ||
              !ready ||
              (mode !== 'append' && !draft.folder) ||
              (mode === 'append' ? !draft.body.trim() : !draft.title.trim())
            }
            onClick={() => {
              void save()
            }}
          >
            {busy ? '处理中…' : draft.pendingRequestId ? '查询结果' : '保存'}
          </Action>
        </View>
      </View>
      {restored && (
        <View className="notice">
          <Text>已恢复本机草稿，尚未提交。</Text>
          {mode !== 'new' && (
            <Action
              disabled={busy || Boolean(draft.pendingRequestId)}
              onClick={() => {
                void reload(true)
              }}
            >
              保留草稿并读取最新
            </Action>
          )}
        </View>
      )}
      {mode === 'append' ? (
        <View className="append-target">
          <Text className="field-label">追加到</Text>
          <Text className="row-title">{document?.title || draft.title}</Text>
          <Text className="block muted">{document?.folder || draft.folder}</Text>
        </View>
      ) : (
        <>
          <Text className="field-label">标题</Text>
          <Input
            className="title-field"
            value={draft.title}
            maxlength={200}
            disabled={disabled || !ready}
            placeholder="笔记标题"
            onInput={(event) => change({ title: event.detail.value })}
          />
          <FolderPicker
            value={draft.folder}
            folders={folders}
            disabled={disabled}
            onChange={(folder) => change({ folder })}
          />
          <Text className="field-label">标签（用逗号分隔）</Text>
          <Input
            className="field"
            value={tagText}
            disabled={disabled}
            maxlength={1020}
            placeholder="标签"
            onInput={(event) => {
              setTagText(event.detail.value)
              change({
                tags: event.detail.value
                  .split(/[,，]/)
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              })
            }}
          />
        </>
      )}
      <ErrorNotice error={error || folderError} />
      {!ready && <Text className="loading">正在读取编辑基线…</Text>}
      {ready && mode !== 'metadata' && (
        <>
          <View className="toolbar section-small">
            <Text className="field-label">{mode === 'append' ? '追加内容' : 'Markdown 正文'}</Text>
            <View className="action-row">
              <Action onClick={() => setPreview(!preview)}>{preview ? '源文' : '预览'}</Action>
              <Action
                disabled={disabled}
                onClick={() => {
                  void Taro.setClipboardData({ data: draft.body })
                }}
              >
                复制
              </Action>
            </View>
          </View>
          {preview ? (
            <View className="editor-preview">
              <Markdown body={draft.body} />
            </View>
          ) : (
            <Textarea
              className="editor-input"
              value={draft.body}
              disabled={disabled}
              maxlength={-1}
              placeholder={mode === 'append' ? '只写需要补充的内容…' : '写下你的笔记…'}
              autoHeight
              adjustPosition
              cursorSpacing={24}
              onInput={(event) => change({ body: event.detail.value })}
            />
          )}
          <View className="action-row editor-tools">
            <Action disabled={disabled} onClick={() => change({ body: draft.body + '\n## ' })}>
              标题
            </Action>
            <Action disabled={disabled} onClick={() => change({ body: draft.body + '\n- ' })}>
              列表
            </Action>
            <Action disabled={disabled} onClick={() => change({ body: draft.body + '\n> ' })}>
              引用
            </Action>
            <Action
              disabled={disabled}
              onClick={() => change({ body: draft.body + '\n```\n\n```\n' })}
            >
              代码
            </Action>
          </View>
        </>
      )}
      {mode === 'metadata' && (
        <Text className="block muted section">仅保存标题、标签和位置，正文与原件不会回传。</Text>
      )}
      {draft.pendingRequestId && (
        <View className="notice warning">
          <Text>操作尚未确认，草稿已保留。请查询结果；未找到记录时可重发原请求。</Text>
          <View className="section-small">
            <Action
              disabled={busy}
              onClick={() => {
                void retryOriginal()
              }}
            >
              查询 / 重发原请求
            </Action>
          </View>
        </View>
      )}
      {conflict && (
        <View className="notice warning">
          <Text className="strong">资料已在其他端变化</Text>
          <Text className="block">
            未覆盖服务端内容。你可以继续保留草稿、读取最新版本，或把草稿另存为笔记。
          </Text>
          {mode !== 'metadata' && (
            <FolderPicker
              folders={folders}
              value={draft.folder}
              onChange={(folder) => change({ folder })}
              label="另存位置"
            />
          )}
          <View className="action-column section-small">
            <Action
              onClick={() => {
                persist()
                setConflict(false)
              }}
            >
              继续保留草稿
            </Action>
            <Action
              disabled={busy}
              onClick={() => {
                void reload(true)
              }}
            >
              保留草稿并重载
            </Action>
            {mode !== 'metadata' && (
              <Action
                disabled={busy || !draft.folder}
                onClick={() => {
                  void saveAsNew()
                }}
              >
                另存为新笔记
              </Action>
            )}
          </View>
        </View>
      )}
      <Text className="block muted small section">
        显式保存后才会写入知识库。
        {mode === 'append' ? '本次只提交追加内容与版本。' : '预览不会改写源文。'}
      </Text>
    </View>
  )
}
