import { Button, Dropdown, Popover, Tooltip, Typography } from 'antd'
import { createStyles } from 'antd-style'
import { ChartPie, Check, ChevronDown, Plus, Zap } from 'lucide-react'
import type { ChatComposerStatus } from '../types.js'

/**
 * 输入区底栏的菜单与指示器（`docs/DESIGN.md` §8.8）。
 *
 * Codex 式底栏在 mimir M0 的诚实形态——每个控件都接真实状态，没有一个
 * 「看着能点」：
 *
 *  - **+ 添加上下文**：把本轮检索范围锁定到某篇文档。服务端的检索
 *    （`retrieve(question, documentId)`）按 documentId 过滤、逐轮生效；
 *    M0 先列最近的文档，附件 / 技能等留待后续。
 *  - **思考强度**：标准 / 深入 = 用对话角色还是推理角色回答。M0 的
 *    「思考强度」就是这条角色轴（模型绑定在设置页），真正的 effort
 *    透传要等后端加参数——到那时这个下拉才升级为 低 / 中 / 高。
 *  - **模型**：展示「这句话会发给谁」（随强度联动），菜单里是两个角色
 *    的绑定与「管理模型」入口。M0 不做会话级换模型：模型绑定是全局
 *    配置，会话级覆盖要后端加 per-request 参数。
 *  - **上下文容量**：usageLog 里该会话最近一次请求的 promptTokens——
 *    那是**真的发给模型的完整上下文**（系统提示 + 全部消息 + 检索命中），
 *    不是字符估算。没有记账（新会话还没发过）就不渲染，不显示一个 0。
 *
 * ## 数据与跳转都是注入的
 *
 * 这三个控件原先各自 `useQuery` 与 `useNavigate`，那让包 import 宿主的
 * `api.ts` 与 router——包不认识宿主。现在三份数据由**宿主取好**从
 * `composerStatus` 传进来（它手上有 queryClient 与键名），跳转走
 * `io.onManageModels()`。这里只剩渲染与那几条诚实文案。
 */

export interface ContextDoc {
  id: string
  title: string
}

/** + 添加上下文：列最近的文档，选中即锁定本轮检索范围 */
const useStyles = createStyles(({ css, token }) => ({
  /* 官方 ComposerAddAttachment：size-7 rounded-full、muted 字、
     hover 提亮 + muted/15 底、按下缩 0.96（attachment.aui.tsx） */
  addTrigger: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    flex: none;
    border: none;
    background: none;
    border-radius: 9999px;
    color: ${token.colorTextQuaternary};
    cursor: pointer;
    transition:
      color 0.12s ease-out,
      background-color 0.12s ease-out,
      transform 0.12s ease-out;

    &:hover,
    &:focus-visible {
      color: ${token.colorText};
      background: ${token.colorFillTertiary};
    }
    &:focus-visible {
      outline: 1px solid ${token.colorPrimaryBorder};
      outline-offset: 2px;
    }
    &:active {
      transform: scale(0.96);
    }
  `,
}))

export function AddContextDropdown({
  onPick,
  documents: docs,
}: {
  onPick: (doc: ContextDoc) => void
  documents: ChatComposerStatus['documents']
}) {
  const { styles } = useStyles()
  const items = docs.items.slice(0, 20)
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: docs.isLoading
          ? [{ key: 'loading', label: '加载中…', disabled: true }]
          : docs.isError
            ? /* 失败不能落进「知识库还没有文档」那一支——那句话把请求失败
                 说成了「你没有内容」。这里给一个能按的动作（见 LoadError）。 */
              [{ key: 'retry', label: '读取失败，点此重试' }]
            : items.length > 0
              ? items.map((doc) => ({
                  key: doc.id,
                  label: doc.title,
                  onClick: () => onPick({ id: doc.id, title: doc.title }),
                }))
              : [{ key: 'empty', label: '知识库还没有文档', disabled: true }],
        onClick: ({ key }) => {
          if (key === 'retry') void docs.refetch()
        },
      }}
    >
      {/* 官方 ComposerAddAttachment 的形态：28px 圆形幽灵钮，
          muted 字 → hover 提亮 + 浅底，按下缩 0.96；tooltip 走 antd */}
      <Tooltip title="添加上下文">
        <button type="button" className={styles.addTrigger} aria-label="添加上下文">
          <Plus size={16} />
        </button>
      </Tooltip>
    </Dropdown>
  )
}

/** 思考强度：标准 = 对话角色，深入 = 推理角色（`deepReasoning`） */
export function StrengthDropdown({
  value,
  onChange,
}: {
  value: boolean
  onChange: (deep: boolean) => void
}) {
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          { key: 'standard', label: '标准（对话模型）' },
          { key: 'deep', label: '深入（推理模型）' },
        ],
        selectedKeys: [value ? 'deep' : 'standard'],
        onClick: ({ key }) => onChange(key === 'deep'),
      }}
    >
      <Button type="text" size="small" aria-label="思考强度">
        <Zap size={16} />
        {value ? '深入' : '标准'}
        <ChevronDown size={12} />
      </Button>
    </Dropdown>
  )
}

/** 当前模型：展示 + 管理入口。M0 不做会话级换模型（见文件头说明） */
export function ModelDropdown({
  deepReasoning,
  modelRoles,
  onManageModels,
}: {
  deepReasoning: boolean
  modelRoles: ChatComposerStatus['modelRoles']
  onManageModels: () => void
}) {
  const chatModel = modelRoles.chat
  const deepModel = modelRoles.reasoning
  const activeKey = deepReasoning ? 'reasoning' : 'chat'
  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          {
            key: 'chat',
            icon: activeKey === 'chat' ? <Check size={16} /> : undefined,
            label: `对话模型：${chatModel || '未配置'}`,
            disabled: true,
          },
          {
            key: 'reasoning',
            icon: activeKey === 'reasoning' ? <Check size={16} /> : undefined,
            label: `深度思考模型：${deepModel || '未配置'}`,
            disabled: true,
          },
          { type: 'divider' },
          {
            key: 'manage',
            label: '管理模型',
            /* 跳转由宿主实现（它显式点名 `models` 而不是靠默认值：
               这是一个**有名字的目的地**，靠默认值会在分区顺序调整时
               悄悄落到别的 tab，而界面上没有任何东西提示这件事发生了） */
            onClick: onManageModels,
          },
        ],
      }}
    >
      <Button type="text" size="small" aria-label="当前模型">
        {(deepReasoning ? deepModel : chatModel) || '未配置模型'}
        <ChevronDown size={12} />
      </Button>
    </Dropdown>
  )
}

/** token 数的短写法：一万以上进「万」档，其余千分位 */
function formatTokens(value: number | null): string {
  if (value === null) return '—'
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`
  return value.toLocaleString()
}

/** 上下文容量：该会话最近一次请求的真实 promptTokens（usageLog.refId = 会话 id） */
export function ContextUsageChip({ usage }: { usage: ChatComposerStatus['usage'] }) {
  const row = usage
  // 没有记账就不渲染：新会话还没发过、或供应商没回传 usage——
  // 显示一个 0 是在说谎（与 usage.ts 里「null 与 0 不能合并」是同一条）
  if (!row || row.totalTokens === null) return null
  return (
    <Popover
      trigger="click"
      content={
        <div style={{ minWidth: 210 }}>
          {/* 字号走宿主桥进来的变量（与面板其余部分同一条规矩）：
              meta 档是「元信息：时间戳、路径」。这里量的是 token 数，
              落在同一档 */}
          <Typography.Text
            type="secondary"
            style={{ fontSize: 'var(--mimir-chat-font-meta, 12px)' }}
          >
            最近一次请求 · {row.model}
          </Typography.Text>
          <div
            style={{
              marginTop: 6,
              display: 'grid',
              gap: 2,
              fontSize: 'var(--mimir-chat-font-meta, 12px)',
            }}
          >
            <span>输入（上下文）：{formatTokens(row.promptTokens)} tok</span>
            <span>输出：{formatTokens(row.completionTokens)} tok</span>
            <span>合计：{formatTokens(row.totalTokens)} tok</span>
          </div>
        </div>
      }
    >
      <Button type="text" size="small" aria-label="上下文容量">
        <ChartPie size={16} />
        {formatTokens(row.promptTokens)} tok
      </Button>
    </Popover>
  )
}
