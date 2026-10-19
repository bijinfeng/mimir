import { useState } from 'react'
import { ThreadFrame } from './thread-frame'
import { demoModels, initialModel, selectModel } from './model-settings'
import { updateToolbar } from './composer-toolbar'
import type { ComposerToolbarState } from './composer-toolbar'
import { canRestoreQueuedDraft } from './composer-send-intent'
import type { ComposerSendIntent } from './composer-send-intent'
export function ModelLab({ strength = false }: { strength?: boolean }) {
  const [toolbar, setToolbar] = useState<ComposerToolbarState>({
    scope: '',
    sidebar: false,
    searchOnly: false,
    documents: ['文档 A', '文档 B'],
    documentsStatus: 'loaded',
    models: demoModels,
    selectedModel: initialModel,
    modelsStatus: 'loaded',
    initialMenu: strength ? 'strength' : 'model',
  })
  const [revision, setRevision] = useState(0)
  const [draft, setDraft] = useState('用这组模型和推理设置提问')
  const [receipt, setReceipt] = useState<ComposerSendIntent>()
  const [notice, setNotice] = useState('')
  return (
    <section className="component-lab">
      <h3>模型与推理等级 · 可操作演示</h3>
      <p>
        供应商、模型 A–H 及能力均为模拟配置，不代表任何真实模型。模型 A
        在两个供应商下同名；等级由各自配置决定。
      </p>
      <div className="demo-toolbar" onClick={() => setRevision((value) => value + 1)}>
        {(['loaded', 'loading', 'error', 'empty'] as const).map((status) => (
          <button
            type="button"
            key={status}
            onClick={() =>
              setToolbar((previous) => ({
                ...previous,
                modelsStatus: status,
                models: status === 'empty' ? [] : demoModels,
                initialMenu: 'model',
              }))
            }
          >
            {{ loaded: '已加载', loading: '加载中', error: '读取失败', empty: '未配置' }[status]}
          </button>
        ))}
        {demoModels.map((model) => (
          <button
            type="button"
            key={`${model.providerId}/${model.modelId}`}
            onClick={() =>
              setToolbar((previous) => ({
                ...previous,
                models: demoModels,
                modelsStatus: 'loaded',
                selectedModel: selectModel(model, previous.selectedModel),
                initialMenu: 'strength',
              }))
            }
          >
            {model.providerLabel.split(' · ')[0]} / {model.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setToolbar((previous) => ({ ...previous, sidebar: !previous.sidebar }))}
        >
          切换主对话 / 文档助手
        </button>
        <button
          type="button"
          onClick={() =>
            setToolbar((previous) => ({
              ...previous,
              models: demoModels.map((model, i) =>
                i === 0
                  ? { ...model, label: '具有很长名称的模型——用于检查省略、焦点与菜单宽度' }
                  : model,
              ),
              initialMenu: 'model',
            }))
          }
        >
          长模型名
        </button>
        <button
          type="button"
          disabled={!receipt}
          onClick={() => {
            if (receipt) {
              if (!canRestoreQueuedDraft(draft)) {
                setNotice('输入区已有新草稿，请先处理当前草稿再恢复。')
                return
              }
              setToolbar((previous) => ({
                ...previous,
                scope: receipt.scope,
                selectedModel: structuredClone(receipt.model),
              }))
              setDraft('恢复被冻结设置的草稿')
              setNotice('恢复本次发送时的模型、等级和范围。')
            }
          }}
        >
          恢复发送快照
        </button>
      </div>
      <div className="component-thread" style={{ height: 460 }}>
        <ThreadFrame
          key={revision}
          fixture={{
            toolbar,
            messages: [],
            draft,
            running: false,
            dark: false,
            zoom: false,
            suggestions: [],
          }}
          onCancel={() => setNotice('已停止本地演示')}
          onRetry={() => setNotice('请重新发送')}
          onSnapshotRemoved={() => {}}
          onDraft={setDraft}
          onSend={(_text, _files, intent) => {
            setReceipt(intent)
            setDraft('')
            setNotice('仅完成本地发送。快照不会随之后的模型切换变化。')
          }}
          onToolbarAction={(action, value) => {
            setToolbar((previous) => updateToolbar(previous, action, value))
            if (action === 'toolbar-model')
              setNotice('已切换模型；兼容等级保留，其余采用当前模型默认设置。')
            if (action === 'toolbar-manage-models')
              setNotice('产品将跳转模型管理；本页不修改真实配置。')
          }}
          onAttachmentError={setNotice}
        />
      </div>
      {notice && <p role="status">{notice}</p>}
      <pre aria-label="模型发送快照">
        {receipt ? JSON.stringify(receipt, null, 2) : '尚未发送；可以先切换模型、等级和范围。'}
      </pre>
    </section>
  )
}
