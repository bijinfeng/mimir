import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ChevronDown, ExternalLink, Search } from 'lucide-react'
import catalog from '../../research/agui-v5-interaction-catalog.json'
import scenes from './scenes.json'
import { CopyButton } from './chat-components'
import { ProtocolDemo } from './protocol-demo'
import './chat.css'
import './interactions.css'
import { ComponentLab } from './component-lab'
import { InterruptLab } from './interrupt-lab'
const groupNames: Record<string, string> = {
  run: '运行生命周期',
  step: '步骤 · 纯数据',
  text: '文本消息',
  tool: '工具调用',
  reasoning: '推理内容',
  legacy: '旧版兼容',
  state: '共享状态与快照',
  activity: '协议活动',
  extension: '扩展事件',
  subagent: '子 Agent',
  message: '消息与媒体',
  content: '消息与媒体',
  'protocol-boundary': '序列与兼容边界',
  'official-parity': '组件行为保真',
  envelope: '请求信封',
  hitl: '人工中断',
  business: 'Mimir 业务',
  'host-interaction': '宿主交互',
  interrupt: '人工中断',
  mimir: 'Mimir 业务',
  ui: '组件操作',
}
function App() {
  const initial = decodeURIComponent(location.hash.slice(1))
  const [selected, setSelected] = useState(
    catalog.items.find((i) => i.id === initial)?.id || catalog.items[0]!.id,
  )
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const item = catalog.items.find((i) => i.id === selected)!
  const groups = Array.from(new Set(catalog.items.map((i) => i.category)))
  const filtered = catalog.items.filter(
    (i) =>
      (category === 'all' || i.category === category) &&
      `${i.id} ${i.title} ${i.events.join(' ')}`.toLowerCase().includes(query.toLowerCase()),
  )
  const related = useMemo(() => {
    const key = item.id.startsWith('UI-') ? Number(item.id.slice(3)) : 0
    const track: Record<number, string> = {
      1: 'composer',
      2: 'send',
      3: 'stop',
      4: 'queue',
      5: 'scroll',
      6: 'messages',
      7: 'copy',
      8: 'recovery',
      9: 'reasoning',
      10: 'files',
      11: 'files',
      12: 'images',
      13: 'model',
      14: 'strength',
      15: 'scope',
      16: 'usage',
      17: 'save',
      18: 'history',
      19: 'empty',
      20: 'navigation',
      21: 'citations',
      22: 'agent',
      23: 'snapshot-queue',
      24: 'agent-media',
      25: 'agent-draft',
      26: 'agent-history',
      27: 'layout',
      28: 'failure',
      29: 'snapshot',
      30: 'trace',
    }
    return scenes.scenes
      .filter(
        (s) =>
          s.track ===
          (item.id.startsWith('MIMIR-')
            ? (
                {
                  'MIMIR-001': 'history',
                  'MIMIR-002': 'citations',
                  'MIMIR-003': 'failure',
                  'MIMIR-004': 'agent',
                  'MIMIR-005': 'agent-history',
                  'MIMIR-006': 'trace',
                } as Record<string, string>
              )[item.id]
            : track[key] || 'none'),
      )
      .slice(0, 20)
  }, [item.id])
  useEffect(() => {
    const sync = () => {
      const id = decodeURIComponent(location.hash.slice(1))
      if (catalog.items.some((i) => i.id === id)) setSelected(id)
    }
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])
  function choose(id: string) {
    setSelected(id)
    window.history.pushState(null, '', `#${id}`)
  }
  return (
    <div className="details-layout">
      <aside className="details-nav">
        <a className="back-link" href="review.html?mode=proposed#scene=CHAT-005.user">
          <ArrowLeft size={15} />
          返回对比稿
        </a>
        <h1>交互细节</h1>
        <p>AG-UI 协议与 Mimir 组件</p>
        <label className="detail-search">
          <Search size={15} />
          <input
            aria-label="搜索交互或协议事件"
            placeholder="搜索组件、事件或编号"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="交互分类"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="all">全部分类 · {catalog.items.length}</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {groupNames[g] || g}
            </option>
          ))}
        </select>
        <nav aria-label="协议组件目录">
          {filtered.map((i) => (
            <button
              key={i.id}
              aria-current={selected === i.id ? 'page' : undefined}
              onClick={() => choose(i.id)}
            >
              <span>{i.title}</span>
              <small>{i.id}</small>
            </button>
          ))}
          {!filtered.length && <p>没有匹配的交互。</p>}
        </nav>
      </aside>
      <main className="details-main">
        <header>
          <div>
            <h2>{item.title}</h2>
            <p>
              {item.id} ·{' '}
              {item.boundary.kind === 'agui'
                ? 'AG-UI 标准协议'
                : item.boundary.kind === 'mimir'
                  ? 'Mimir 业务交互'
                  : '扩展 / 组件交互'}
            </p>
          </div>
          <CopyButton value={location.href} label="复制本交互链接" />
        </header>
        <div className="detail-summary">
          <p>{item.boundary.notes}</p>
          <p>
            <strong>状态：</strong>
            {item.states.join(' → ')}
          </p>
          <p>
            <strong>事件：</strong>
            {item.events.length ? item.events.join(' · ') : '组件动作，没有专属 AG-UI 事件'}
          </p>
        </div>
        {item.id.startsWith('AGUI-HITL-') || item.id === 'AGUI-FLOW-007' ? (
          <>
            <InterruptLab
              key={item.id}
              id={item.id === 'AGUI-FLOW-007' ? 'AGUI-HITL-001' : item.id}
            />
            <ProtocolDemo key={`${item.id}-protocol`} item={item} />
          </>
        ) : item.id.startsWith('OFF-') ? (
          <ComponentLab key={item.id} id={item.id} states={item.states} />
        ) : item.id.startsWith('UI-') || item.id.startsWith('MIMIR-') ? (
          <>
            <section className="host-demo">
              <h3>完整场景与真实宿主动作</h3>
              <p>
                这些业务动作由 Mimir
                宿主负责。下方在原有场景中操作；协议播放器不能替代输入、菜单或画布守卫。
              </p>
              <div className="related-scenes">
                {related.map((s) => (
                  <a
                    key={s.id}
                    href={`review.html?mode=proposed#scene=${s.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {s.id} · {s.label}
                    <ExternalLink size={12} />
                  </a>
                ))}
              </div>
              {related[0] ? (
                <iframe
                  title={`${item.title}交互场景`}
                  sandbox="allow-scripts allow-forms allow-downloads allow-popups"
                  src={`review.html?mode=proposed&embed=detail#scene=${related[0].id}`}
                />
              ) : (
                <p className="pending-note">
                  业务细节仍需逐项验收，请通过对比稿目录定位。未进行真实服务验收。
                </p>
              )}
            </section>
          </>
        ) : (
          <>
            <ProtocolDemo key={item.id} item={item} />
            {(
              {
                'AGUI-MSG-003': 'OFF-017',
                'AGUI-MSG-004': 'OFF-019',
                'AGUI-MSG-005': 'OFF-020',
                'AGUI-MSG-006': 'OFF-018',
              } as Record<string, string>
            )[item.id] && (
              <ComponentLab
                key={`${item.id}-media`}
                id={
                  (
                    {
                      'AGUI-MSG-003': 'OFF-017',
                      'AGUI-MSG-004': 'OFF-019',
                      'AGUI-MSG-005': 'OFF-020',
                      'AGUI-MSG-006': 'OFF-018',
                    } as Record<string, string>
                  )[item.id]!
                }
                states={item.states}
              />
            )}
            {item.id === 'AGUI-MSG-007' && (
              <a href="interactions.html#UI-021">打开引用定位与未保存守卫的完整交互</a>
            )}
          </>
        )}
        <section className="interaction-contract">
          <h3>每一个动作的预期</h3>
          <table>
            <thead>
              <tr>
                <th>操作</th>
                <th>键盘</th>
                <th>前后状态</th>
                <th>结果与恢复</th>
              </tr>
            </thead>
            <tbody>
              {item.interactions.map((action, i) => (
                <tr key={i}>
                  <td>{action.action}</td>
                  <td>{action.keyboard}</td>
                  <td>
                    {action.from} → {action.to}
                  </td>
                  <td>{action.expected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <details className="evidence">
          <summary>
            边界与源码依据
            <ChevronDown size={14} />
          </summary>
          <p>
            协议定义事件与消息，并不规定组件外观。已保留每一项状态；“可播放”不代表已接通产品服务。
          </p>
          <ul>
            {item.evidence.map((e, i) => (
              <li key={i}>
                <code>{e}</code>
              </li>
            ))}
          </ul>
        </details>
      </main>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
