import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  App as AntApp,
  Button,
  Cascader,
  Checkbox,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Segmented,
  Select,
  Skeleton,
  Slider,
  Space,
  Switch,
  Tabs,
  Tooltip,
} from 'antd'
import { MimirProvider } from '../../../../packages/renderer/src/theme/MimirProvider'
import { setThemeMode, useAppearance } from '../../../../packages/renderer/src/theme/appearance'
import { BrandMark } from '../../../../packages/renderer/src/components/BrandMark'
import { FolderGlyph } from '../../../../packages/renderer/src/components/nav/folder-icons'
import { FOLDER_ICONS } from '../../../../packages/shared/src/structure'
import './review.css'

type Scene = {
  id: string
  name: string
  group: string
  states: string[]
  current: string
  change: string
  keep: string
  source: string
  checks: string[]
}
const scenes: Scene[] = [
  {
    id: 'fields',
    name: '字段与校验',
    group: '填写',
    states: ['默认', '内容较长', '错误', '警告', '禁用', '只读'],
    current: '当前共享控件与上轮已验收的细边框；知识库名称错误仍通过全局消息反馈。',
    change: '字段错误在字段下就地解释，保留用户输入；将清除、计数和独立操作焦点一起验收。',
    keep: '保留1px边框、32px控件、6px圆角及错误优先；不再次改变主题色。',
    source:
      'theme/tokens.ts · components/KnowledgeBaseCreateModal.tsx:130–181 · routes/login.tsx:399–461',
    checks: [
      '普通 / 密码 / 搜索 / 多行',
      '前后缀 / 清除 / 显隐 / 字数',
      'Tab焦点 / 中文输入 / 只读选择',
      '空白 / 过长 / 错误 / 警告 / 禁用',
    ],
  },
  {
    id: 'select',
    name: '搜索与选择',
    group: '填写',
    states: ['默认', '无结果', '加载中', '失败', '多选', '禁用'],
    current: '真实AntD选择、级联与多选行为；异步业务结果在各页面分别反馈。',
    change: '选择弹层内区分无匹配、加载、读取失败，并在原位提供清除搜索或重试；已选值保持。',
    keep: '保留可搜索预设、清除与Cascader层级；不提供不存在的模型。',
    source:
      'components/settings/ProviderForm.tsx:550–593 · components/DocumentPanel.tsx:958 · routes/_app.settings.tsx:167',
    checks: [
      'Select / 多选标签 / Cascader',
      '搜索 / 无结果 / 清除 / 回退',
      '方向键 / Enter / Escape',
      '浮层边界 / 长名称 / disabled',
    ],
  },
  {
    id: 'number',
    name: '数字与范围',
    group: '填写',
    states: ['默认', '最小值', '最大值', '错误', '禁用'],
    current: '设置数字使用共享InputNumber；头像裁切的范围控件独立使用Slider。',
    change: '范围和校验说明紧邻数值，越界显示可执行解释；保持保存按钮位置和显式保存。',
    keep: '沿用真实上下限与单位，本稿数值仅为交互示例，不替换业务默认值。',
    source: 'components/settings/SettingControl.tsx:158–176 · components/AvatarCropper.tsx:190+',
    checks: [
      '输入 / 步进 / 清空',
      '边界 / 非数字 / disabled',
      'Slider键盘微调 / 当前值',
      '单位与解释 / 显式保存',
    ],
  },
  {
    id: 'buttons',
    name: '按钮与工具提示',
    group: '操作',
    states: ['默认', '提交中', '失败', '成功', '禁用'],
    current: '主次文字按钮来自当前AntD，部分禁用原因已通过Tooltip提供。',
    change: '统一忙碌文案、防止重复触发，必要禁用原因就地可见；图标按钮仍保持独立键盘焦点。',
    keep: '保留当前按钮绿和原有操作语义；不让loading改变按钮宽度。',
    source:
      'theme/tokens.ts · components/nav/NavigationAction.tsx:16–43 · components/settings/ProviderList.tsx:175–193',
    checks: [
      '主 / 次 / 文字 / 危险 / 图标',
      'hover / pressed / focus / disabled',
      'loading / 防重 / 失败再试',
      'Tooltip鼠标与键盘可达',
    ],
  },
  {
    id: 'choices',
    name: '单复选与开关',
    group: '操作',
    states: ['默认', '部分选择', '保存中', '失败', '禁用'],
    current: '复选、单选与Switch保留强边界；设置Switch点击即提交，失败由全局消息反馈。',
    change: '开关提交失败时回到已保存值，并在控件旁给出失败与重试；部分选择显示明确数量。',
    keep: '开关仍即时保存，文本和数字仍显式保存；不扩大为整页自动保存。',
    source:
      'components/settings/SettingControl.tsx:177–186 · components/settings/ProviderForm.tsx:610–670',
    checks: [
      'Checkbox / indeterminate / Radio',
      'Switch即时提交 / 成功 / 失败恢复',
      'Space / 方向键 / Tab',
      '忙碌 / 禁用原因 / 已保存值',
    ],
  },
  {
    id: 'tabs',
    name: '分段与标签页',
    group: '操作',
    states: ['默认', '内容较长', '禁用'],
    current: '收集弹窗用分段切换链接/上传，设置用分区状态；它们不是新的多文档标签系统。',
    change: '分段、标签和状态说明对齐；窄容器长标签可达，键盘切换不丢当前输入。',
    keep: '保留已有页签和URL状态；不新增工作区文档标签功能。',
    source: 'components/CaptureDialog.tsx:317–327 · routes/_app.settings.tsx:95–181',
    checks: [
      'Segmented / Tabs',
      '键盘切换 / active可见',
      '长文案 / 窄屏 / disabled',
      '切换草稿保持（模拟）',
    ],
  },
  {
    id: 'menus',
    name: '菜单与浮层',
    group: '操作',
    states: ['默认', '长名称', '禁用'],
    current:
      '账号菜单已有关闭回焦；文件、目录更多与主题子菜单复用Dropdown。下方是跨页面机制组合示例。',
    change: '保留账号已有回焦，补齐其他入口的键盘与关闭检查；禁用原因可见，危险操作分组清楚。',
    keep: '真实账号、文件与目录菜单分别保留；组合示例只评审机制，不作为业务菜单重排方案。',
    source:
      'components/nav/AccountRow.tsx:150–215 · components/library/LibraryView.tsx:1048–1075 · components/document/doc-menu.tsx',
    checks: [
      '点击 / 右键 / 二级菜单',
      '禁用原因 / 长名称 / 边缘',
      '方向键 / Enter / Escape',
      '关闭回焦 / 点外部关闭',
    ],
  },
  {
    id: 'dialogs',
    name: '表单弹窗',
    group: '保护与反馈',
    states: ['默认', '错误', '提交中', '失败', '成功'],
    current: '创建知识库已有自动聚焦、图标选择、计数、禁用空名称和取消清空草稿。',
    change: '非法名称与请求失败留在弹窗中，首个错误能定位；提交中关闭入口一致锁定，结果可追溯。',
    keep: '保留520px弹窗、创建/取消和图标可取消选择，不新增业务字段。',
    source:
      'components/KnowledgeBaseCreateModal.tsx:112–206 · components/CaptureDialog.tsx:265–310',
    checks: [
      '打开 / 自动聚焦 / Tab',
      '取消 / Escape / 遮罩 / 回焦',
      '校验 / 失败保留 / 再试',
      'pending防重 / 提交锁定 / 成功',
    ],
  },
  {
    id: 'danger',
    name: '危险操作确认',
    group: '保护与反馈',
    states: ['默认', '提交中', '失败'],
    current: '供应商删除用Popconfirm；知识库文件删除区别笔记回收与原件直接删除。',
    change: '确认中明确对象、影响和准确动词，默认落在取消；删除失败保留上下文，仍可重试或取消。',
    keep: '不为不可恢复操作提供虚假的撤销；本稿不会真的删除任何内容。',
    source:
      'components/settings/ProviderList.tsx:183–193 · components/library/LibraryView.tsx:166–189',
    checks: [
      '对象 / 后果 / 取消优先',
      '确认 / pending / 防重',
      '失败 / 保留 / 重试',
      '焦点回归 / 无虚假撤销',
    ],
  },
  {
    id: 'unsaved',
    name: '未保存与离开',
    group: '保护与反馈',
    states: ['默认', '保存中', '保存失败', '自动保存中', '已自动保存'],
    current:
      '手动保存保留继续编辑/丢弃改动/保存并离开；自动保存分支不提供丢弃。已禁止Escape与遮罩误关闭。',
    change: '保持完整分支，仅让状态、说明和动作更紧凑；失败原因更靠近保存动作。',
    keep: '三选项、自动保存条件、失败不离开都已存在，本稿明确作为保留项。',
    source: 'components/UnsavedGuard.tsx:43–112 · lib/unsaved.tsx',
    checks: [
      '手动三选项 / 取消不丢',
      '自动保存中 / 已自动保存',
      '保存中禁用 / 失败不放行',
      '遮罩不关闭 / 键盘 / 回焦',
    ],
  },
  {
    id: 'feedback',
    name: '保存与读取反馈',
    group: '保护与反馈',
    states: ['已保存', '未保存', '保存中', '保存失败', '读取中', '空内容', '读取失败'],
    current:
      'SettingControl显式保存、失败保留草稿；LoadError区分读取失败与空数据；全局message负责结果。',
    change: '保存失败保留一条就地结果与重试，成功轻提示；加载、空、失败保持各自恢复动作。',
    keep: '不以空列表掩盖失败，不把未保存草稿当持久化成功。',
    source:
      'components/settings/SettingControl.tsx:86–103,232–260 · components/LoadError.tsx:29–81 · routes/__root.tsx:65–109',
    checks: [
      '未改 / dirty / pending / 成功',
      '保存失败 / 草稿 / 重试',
      'Skeleton / Empty / LoadError',
      '持久结果 / message / 重复操作',
    ],
  },
  {
    id: 'upload',
    name: '上传与批量结果',
    group: '保护与反馈',
    states: ['待选择', '上传中', '部分失败', '全部成功', '超出限制'],
    current: 'UploadPanel串行上传，逐项展示大小、结果、打开和继续上传；只在真实阶段完成后反馈。',
    change: '压缩结果行，文件名保留扩展名，成功与失败数量相邻；错误就地说明，可重新选择文件。',
    keep: '不伪造百分比、不新增后端续传/取消/重试承诺，真实流程在收集模块另行全页复核。',
    source: 'components/UploadPanel.tsx:70–227 · components/CaptureDialog.tsx:329–338',
    checks: [
      '点击选择 / 拖入 / 文件夹',
      '队列 / 进行中 / 防重复选择',
      '部分失败 / 超限 / 成功',
      '打开结果 / 继续上传 / 关闭限制',
    ],
  },
]
const icon = (name: string, size = 16) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {name === 'more' ? (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ) : name === 'search' ? (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ) : name === 'arrow' ? (
      <path d="m9 5 7 7-7 7" />
    ) : name === 'check' ? (
      <path d="m5 12 4 4L19 6" />
    ) : name === 'close' ? (
      <path d="m6 6 12 12M18 6 6 18" />
    ) : name === 'folder' ? (
      <path d="M3 7V5h7l2 2h9v13H3Z" />
    ) : name === 'upload' ? (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />
      </>
    ) : (
      <path d="M12 5v14M5 12h14" />
    )}
  </svg>
)
const options = [
  { value: 'notes', label: '技术笔记' },
  { value: 'product', label: '产品设计研究与交互细节' },
  { value: 'archive', label: '归档资料' },
]
const cascades = [
  {
    value: 'work',
    label: '工作资料',
    children: [
      { value: 'notes', label: '技术笔记' },
      { value: 'design', label: '产品设计' },
    ],
  },
  { value: 'life', label: '生活记录', children: [{ value: 'read', label: '阅读' }] },
]

const hint = (body: ReactNode, err = false) => (
  <div role={err ? 'alert' : undefined} className={`field-hint ${err ? 'error' : ''}`}>
    {body}
  </div>
)

function Specimen({ scene, state, after }: { scene: Scene; state: string; after: boolean }) {
  const { message } = AntApp.useApp()
  const [text, setText] = useState(
    state === '内容较长'
      ? '关于知识管理与团队资料归档的一些长期实践记录'
      : state === '错误'
        ? '技术/笔记'
        : '技术笔记',
  )
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState(''),
    [checked, setChecked] = useState(true),
    [choice, setChoice] = useState('url'),
    [num, setNum] = useState<number | null>(
      state === '最小值' ? 1 : state === '最大值' ? 20 : state === '错误' ? 0 : 10,
    ),
    [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | undefined>('notes'),
    [dirty, setDirty] = useState(false),
    [chosenIcon, setChosenIcon] = useState<string | null>(null)
  const [selection, setSelection] = useState(
    state === '部分选择' ? ['notes'] : options.map((x) => x.value),
  )
  const [recovered, setRecovered] = useState(false),
    [attempts, setAttempts] = useState(0),
    [menuOpen, setMenuOpen] = useState(false)
  const [uploadStage, setUploadStage] = useState(state),
    [validation, setValidation] = useState('')
  const markRecovered = () => {
    setRecovered(true)
    setDirty(false)
  }
  const trigger = useRef<HTMLButtonElement>(null),
    container = useRef<HTMLDivElement>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const pending = busy || state === '提交中' || state === '保存中' || state === '上传中'
  const disabled = state === '禁用'
  const error = (state === '错误' || state === '失败' || state === '保存失败') && !recovered
  const shouldFail = error && attempts === 0
  const finish = (
    success: string,
    failure = false,
    onSuccess?: () => void,
    onFailure?: () => void,
  ) => {
    if (busy) return
    setBusy(true)
    setResult('')
    timers.current.push(
      setTimeout(() => {
        setBusy(false)
        setAttempts((v) => v + 1)
        if (failure) {
          if (after) setResult('操作未完成，请重试。你的输入已保留。')
          else message.error('操作失败，请重试')
          onFailure?.()
        } else {
          markRecovered()
          setResult(success)
          if (success.includes('失败')) message.warning(success)
          else message.success(success)
          onSuccess?.()
        }
      }, 900),
    )
  }
  const close = () => {
    if (after && pending) return
    setOpen(false)
    setText('')
    setChosenIcon(null)
    setValidation('')
    setResult('')
  }
  const scope = () => container.current!
  const note = (
    <div className="local-note" role="status">
      {result || '所有操作仅在本地演示，不会写入你的资料。'}
    </div>
  )
  const modalCommon = {
    getContainer: scope,
    rootClassName: 'specimen-modal',
    width: 520,
    afterClose: () => trigger.current?.focus(),
  }
  const showError = Boolean(validation) || (result && result.includes('未完成'))
  let content: ReactNode
  if (scene.id === 'fields')
    content = (
      <div className="field-stack">
        <label htmlFor={`${after}-name`}>知识库名称</label>
        <Input
          id={`${after}-name`}
          aria-invalid={after && Boolean(validation || (state === '错误' && text.includes('/')))}
          value={text}
          allowClear
          disabled={disabled}
          readOnly={state === '只读'}
          status={
            after && (validation || (state === '错误' && text.includes('/')))
              ? 'error'
              : state === '警告'
                ? 'warning'
                : undefined
          }
          aria-describedby={`${after}-field-hint`}
          onChange={(e) => {
            setText(e.target.value)
            setValidation('')
          }}
          onPressEnter={(e) => {
            if (after && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229)) return
            if (text.includes('/')) {
              if (after) {
                setValidation('名称不能包含 /，请换成空格或短横线。')
                setResult('名称不能包含 /，请换成空格或短横线。')
              } else message.error('名称不能包含 /')
            }
          }}
        />
        <div id={`${after}-field-hint`}>
          {after && (validation || (state === '错误' && text.includes('/')))
            ? hint('名称不能包含 /，请换成空格或短横线。', true)
            : state === '警告'
              ? hint('已有相似名称，请确认知识库归属。')
              : hint(state === '只读' ? '此字段只读，可选中并复制。' : '按 Enter 试验名称校验。')}
        </div>
        <label>
          密码
          <Input.Password aria-label="演示密码" placeholder="输入密码" disabled={disabled} />
        </label>
        <label>
          搜索
          <Input.Search
            aria-label="演示搜索"
            placeholder="搜索已有资料"
            allowClear
            disabled={disabled}
            onSearch={(v) => setResult(v ? `已演示搜索「${v}」` : '请输入搜索内容')}
          />
        </label>
        <label>
          描述（可选）
          <Input.TextArea
            aria-label="演示描述"
            placeholder="简单描述这个知识库"
            maxLength={2000}
            showCount
            autoSize={{ minRows: 2, maxRows: 4 }}
            disabled={disabled}
          />
        </label>
        <label>
          带前缀的输入
          <Input
            aria-label="演示接口地址"
            prefix={<span className="muted">https://</span>}
            suffix={icon('check')}
            placeholder="example.com"
            disabled={disabled}
          />
        </label>
      </div>
    )
  else if (scene.id === 'select') {
    const unavailable = !recovered && ['无结果', '加载中', '失败'].includes(state)
    content = (
      <div className="field-stack">
        <label>
          知识库
          <Select
            aria-label="选择知识库"
            value={selected}
            labelRender={({ value }) => options.find((x) => x.value === value)?.label || '请选择'}
            showSearch={{ optionFilterProp: 'label', searchValue: query, onSearch: setQuery }}
            allowClear
            disabled={disabled}
            options={unavailable ? [] : options}
            onChange={(v) => setSelected(v)}
            loading={(!recovered && state === '加载中') || busy}
            notFoundContent={
              after ? (
                <div className="popup-empty">
                  {state === '加载中' || busy ? (
                    '正在读取…'
                  ) : state === '失败' && !recovered ? (
                    <>
                      暂时无法读取
                      <Button
                        type="link"
                        onClick={() => finish('已重新读取（演示）', false, () => setQuery(''))}
                      >
                        重试
                      </Button>
                    </>
                  ) : (
                    <>
                      没有匹配的结果
                      <Button
                        type="link"
                        onClick={() => {
                          setQuery('')
                          setRecovered(true)
                          setResult('已清除搜索，请重新选择')
                        }}
                      >
                        清除搜索
                      </Button>
                    </>
                  )}
                </div>
              ) : undefined
            }
            getPopupContainer={(node) => node.parentElement!}
          />
        </label>
        {after &&
          hint(
            state === '失败' && !recovered
              ? '读取失败不会清空已选知识库。'
              : '可用方向键选择，Enter 确认，Escape 关闭。',
            state === '失败' && !recovered,
          )}
        <label>
          多选标签
          <Select
            aria-label="多选用途"
            mode="multiple"
            defaultValue={state === '多选' ? ['notes', 'product', 'archive'] : ['notes']}
            options={options}
            maxTagCount="responsive"
            disabled={disabled}
            allowClear
            getPopupContainer={(node) => node.parentElement!}
          />
        </label>
        <label>
          目录层级
          <Cascader
            aria-label="选择目录层级"
            options={cascades}
            showSearch
            allowClear
            disabled={disabled}
            placeholder="选择目录"
            getPopupContainer={(node) => node.parentElement!}
          />
        </label>
        <p className="muted">当前搜索：{query || '未输入'}</p>
      </div>
    )
  } else if (scene.id === 'number')
    content = (
      <div className="field-stack">
        <label>
          结果数量
          <InputNumber
            aria-label="结果数量"
            value={num}
            min={1}
            max={20}
            disabled={disabled}
            status={state === '错误' ? 'error' : undefined}
            onChange={setNum}
            style={{ width: '100%' }}
          />
        </label>
        {after &&
          hint(
            state === '错误' ? '请输入 1 到 20 之间的整数。' : '示例范围 1–20，步长 1。',
            state === '错误',
          )}
        <label>
          裁切缩放 <span className="muted">{num ?? 10}%</span>
          <Slider
            aria-label="演示缩放"
            min={1}
            max={20}
            value={num ?? 10}
            onChange={(v) => setNum(v)}
            disabled={disabled}
          />
        </label>
        <div className="action-row">
          <Button
            type="primary"
            disabled={disabled || num === null || num < 1 || num > 20}
            onClick={() => finish('已保存（演示）')}
            loading={busy}
          >
            保存
          </Button>
        </div>
      </div>
    )
  else if (scene.id === 'buttons')
    content = (
      <>
        <div className="button-lines">
          <Space wrap>
            <Button
              type="primary"
              loading={pending}
              disabled={disabled}
              onClick={() => finish('保存成功（演示）', shouldFail)}
              style={{ minWidth: 104 }}
            >
              {after && pending ? '保存中' : '保存'}
            </Button>
            <Button disabled={pending || disabled} onClick={() => setResult('已取消（演示）')}>
              取消
            </Button>
            <Button type="text" disabled={disabled} onClick={() => setResult('已打开说明（演示）')}>
              了解详情
            </Button>
          </Space>
          <Space wrap>
            <Tooltip trigger={after ? ['hover', 'focus'] : ['hover']} title="添加资料">
              <Button
                aria-label="添加资料"
                icon={icon('plus')}
                disabled={disabled}
                onClick={() => setResult('已添加一条示例资料')}
              />
            </Tooltip>
            <Tooltip trigger={after ? ['hover', 'focus'] : ['hover']} title="更多操作">
              <Button
                aria-label="更多操作"
                icon={icon('more')}
                disabled={disabled}
                onClick={() => setResult('更多操作请在菜单场景体验')}
              />
            </Tooltip>
            <Button
              danger
              disabled={disabled || pending}
              onClick={() => setResult('危险确认请在对应场景体验')}
            >
              删除
            </Button>
          </Space>
          <Tooltip trigger={after ? ['hover', 'focus'] : ['hover']} title="请先选择一个供应商">
            <span tabIndex={0} className="disabled-wrap">
              <Button disabled>测试连接</Button>
            </span>
          </Tooltip>
          {after && hint('先选择供应商，即可测试连接。')}
        </div>
        {state === '成功' && hint('已保存', false)}
        {after && error && hint('保存失败，你可以保留输入并重试。', true)}
      </>
    )
  else if (scene.id === 'choices')
    content = (
      <div className="field-stack">
        <div className="list-heading">
          <Checkbox
            indeterminate={selection.length > 0 && selection.length < 3}
            checked={selection.length === 3}
            disabled={disabled}
            onChange={(e) => setSelection(e.target.checked ? options.map((x) => x.value) : [])}
          >
            全部选择
          </Checkbox>
          <span className="muted">已选 {selection.length} / 3</span>
        </div>
        {options.map((x) => (
          <Checkbox
            key={x.value}
            disabled={disabled}
            checked={selection.includes(x.value)}
            onChange={(e) =>
              setSelection(
                e.target.checked ? [...selection, x.value] : selection.filter((v) => v !== x.value),
              )
            }
          >
            {x.label}
          </Checkbox>
        ))}
        <div className="rule" />
        <Radio.Group aria-label="演示回答强度" defaultValue="normal" disabled={disabled}>
          <Space>
            <Radio value="normal">标准</Radio>
            <Radio value="deep">深入</Radio>
          </Space>
        </Radio.Group>
        <div className="switch-row">
          <div>
            <b>启用联网搜索</b>
            {after && (
              <div className="muted">
                {busy ? '正在保存…' : error ? '首次模拟失败，再次切换可重试' : '点击后即时保存'}
              </div>
            )}
          </div>
          <Switch
            aria-label="启用联网搜索"
            checked={checked}
            loading={busy || state === '保存中'}
            disabled={disabled}
            onChange={(v) => {
              const previous = checked
              setChecked(v)
              finish('已保存（演示）', shouldFail, undefined, () => {
                if (after) {
                  setChecked(previous)
                  setResult('未能保存，已恢复原设置。可再次切换重试。')
                }
              })
            }}
          />
        </div>
        {after && error && hint('连接暂时不可用，失败后恢复原值。再次切换演示恢复。', true)}
      </div>
    )
  else if (scene.id === 'tabs')
    content = (
      <>
        <Segmented
          block
          aria-label="收集方式"
          value={choice}
          disabled={disabled}
          options={[
            { value: 'url', label: '粘贴链接' },
            { value: 'file', label: state === '内容较长' ? '上传本地文件或文件夹' : '上传文件' },
          ]}
          onChange={(v) => setChoice(String(v))}
        />
        <div className="tab-body">
          {choice === 'url' ? (
            <label>
              网页链接
              <Input
                aria-label="演示网页链接"
                value={text === '技术笔记' ? '' : text}
                onChange={(e) => setText(e.target.value)}
                placeholder="https://example.com/article"
                allowClear
              />
            </label>
          ) : (
            <div className="upload-zone">
              {icon('upload', 24)}
              <p>点击或拖入文件</p>
              <span className="muted">本稿使用示例文件，不会上传。</span>
              <Button size="small" onClick={() => setResult('已选择示例文件（本地演示）')}>
                选择示例文件
              </Button>
            </div>
          )}
        </div>
        <Tabs
          defaultActiveKey="connection"
          items={[
            { key: 'connection', label: '连接配置', children: '保留当前连接草稿。' },
            { key: 'models', label: '模型', children: '切换回连接配置时，草稿仍在。' },
            { key: 'advanced', label: '高级选项', disabled: true },
          ]}
        />
      </>
    )
  else if (scene.id === 'menus')
    content = (
      <>
        <div className="document-row">
          {icon('folder', 20)}
          <span className="filename">
            {state === '长名称' ? '知识管理研究与项目资料长期归档记录.md' : '交互设计笔记.md'}
          </span>
          <Dropdown
            autoFocus={after}
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={['click', 'contextMenu']}
            getPopupContainer={(n) => n.parentElement!}
            menu={{
              onKeyDown: (e) => {
                if (e.key === 'Escape') {
                  setMenuOpen(false)
                  if (after) trigger.current?.focus()
                }
              },
              items: [
                { key: 'open', label: '打开' },
                { key: 'rename', label: '重命名' },
                {
                  key: 'theme',
                  label: '外观',
                  children: [
                    { key: 'light', label: '浅色' },
                    { key: 'dark', label: '深色' },
                    { key: 'auto', label: '跟随系统' },
                  ],
                },
                { key: 'move', label: disabled ? '移动（当前不可用）' : '移动', disabled },
                { type: 'divider' },
                { key: 'remove', label: '删除', danger: true },
              ],
              onClick: ({ key }) => {
                setMenuOpen(false)
                setResult(`已选择「${key}」（演示）`)
                if (after) trigger.current?.focus()
              },
            }}
          >
            <Button
              ref={trigger}
              aria-label="文件更多操作"
              icon={icon('more')}
              onKeyDown={(e) => {
                if (
                  after &&
                  ((e.shiftKey && e.key === 'F10') ||
                    e.key === 'ContextMenu' ||
                    e.key === 'ArrowDown')
                ) {
                  e.preventDefault()
                  setMenuOpen(true)
                }
              }}
            />
          </Dropdown>
        </div>
        <p className="muted">
          {after ? '点击更多按钮、在按钮上右键或按 Shift+F10。' : '点击更多按钮或在按钮上右键。'}
        </p>
        {after && disabled && hint('当前文件正在处理，完成后可移动。')}
        <Tooltip
          title={state === '长名称' ? '知识管理研究与项目资料长期归档记录.md' : '交互设计笔记.md'}
        >
          <button className="text-link">查看完整名称</button>
        </Tooltip>
      </>
    )
  else if (scene.id === 'dialogs')
    content = (
      <>
        <div className="mini-description">
          <h3>创建知识库</h3>
          <p className="muted">名称、描述与图标保持现有内容。</p>
          <div className="dialog-summary">
            <span>名称</span>
            <b>{state === '错误' ? '技术/笔记' : '技术笔记'}</b>
            <span>描述</span>
            <span className="muted">集中整理资料与笔记</span>
          </div>
          {after &&
            error &&
            hint(
              state === '错误'
                ? '名称不能包含 /，请换个名称。'
                : '创建失败，你的内容已保留，可以重试。',
              true,
            )}
        </div>
        <Button
          ref={trigger}
          type="primary"
          onClick={() => {
            setText(state === '错误' ? '技术/笔记' : state === '失败' ? '技术笔记' : '')
            setValidation(state === '错误' ? '名称不能包含 /，请换个名称。' : '')
            setOpen(true)
          }}
        >
          体验创建弹窗
        </Button>
        <Modal
          {...modalCommon}
          title="创建知识库"
          open={open}
          okText="创建"
          cancelText="取消"
          onCancel={close}
          closable={after ? !pending : true}
          keyboard={after ? !pending : true}
          mask={{ closable: after ? !pending : true }}
          confirmLoading={pending}
          okButtonProps={{ disabled: !text.trim() }}
          cancelButtonProps={{ disabled: after && pending }}
          onOk={() => {
            if (text.includes('/')) {
              if (after) {
                setValidation('名称不能包含 /，请换成空格或短横线。')
                setResult('名称不能包含 /，请换成空格或短横线。')
              } else message.error('名称不能包含 /')
              return
            }
            finish('已创建知识库（演示）', state === '失败' && shouldFail, () => {
              setOpen(false)
              setText('')
              setChosenIcon(null)
              setValidation('')
            })
          }}
        >
          <div className="field-stack">
            <label>
              名称
              <Input
                aria-label="弹窗知识库名称"
                value={text}
                autoFocus
                maxLength={60}
                status={after && Boolean(validation) ? 'error' : undefined}
                onChange={(e) => {
                  setText(e.target.value)
                  setValidation('')
                }}
              />
            </label>
            {after && showError && hint(validation || result, true)}
            <label>
              描述（可选）
              <Input.TextArea
                aria-label="弹窗描述"
                placeholder="简单描述这个知识库"
                rows={3}
                maxLength={2000}
                showCount
              />
            </label>
            <span>图标</span>
            <div className="icon-picks">
              {FOLDER_ICONS.map((x) => (
                <button
                  type="button"
                  key={x.key}
                  aria-label={x.label}
                  aria-pressed={chosenIcon === x.key}
                  className={`icon-cell ${chosenIcon === x.key ? 'active' : ''}`}
                  onClick={() => setChosenIcon(chosenIcon === x.key ? null : x.key)}
                >
                  <FolderGlyph iconKey={x.key} size={18} />
                  {x.label}
                </button>
              ))}
            </div>
            {after && result && !showError && hint(result)}
          </div>
        </Modal>
      </>
    )
  else if (scene.id === 'danger')
    content = (
      <>
        <div className="document-row">
          <span className="file-symbol">PDF</span>
          <div className="filename">
            <b>项目资料.pdf</b>
            <div className="muted">示例原件 · 不会实际删除</div>
          </div>
        </div>
        <Button danger ref={trigger} onClick={() => setOpen(true)}>
          {after ? '删除原件…' : '删除'}
        </Button>
        <Modal
          {...modalCommon}
          title={after ? '删除「项目资料.pdf」？' : '删除《项目资料.pdf》？'}
          open={open}
          onCancel={() => !busy && setOpen(false)}
          closable={!pending}
          keyboard={!pending}
          mask={{ closable: !pending }}
          footer={
            <>
              <Button autoFocus disabled={pending} onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                danger
                type="primary"
                loading={pending}
                onClick={() =>
                  finish(
                    '已删除文件与原件（演示）',
                    shouldFail,
                    () => setOpen(false),
                    () => {
                      if (!after) setOpen(false)
                    },
                  )
                }
              >
                {after ? '删除原件' : '删除'}
              </Button>
            </>
          }
        >
          <p>
            {after ? '文件与原件将一并删除，此操作无法撤销。' : '不可撤销：记录与原件都会删除。'}
          </p>
          {after && error && hint('首次模拟删除失败，原件仍在。你可以重试或取消。', true)}
          {after && result && hint(result, Boolean(showError))}
        </Modal>
        <div className="rule" />
        <p className="muted">供应商行内确认（现有 Popconfirm 机制保留）</p>
        <Popconfirm
          title="删除此供应商？"
          description="供应商配置将移除。"
          okText="删除"
          cancelText="取消"
          getPopupContainer={(n) => n.parentElement!}
          onConfirm={() => finish('已删除示例供应商（演示）')}
        >
          <Button danger>删除示例供应商</Button>
        </Popconfirm>
        {after && hint('对象与后果沿用当前合同，不提供虚假的撤销入口。')}
      </>
    )
  else if (scene.id === 'unsaved') {
    const auto = state === '自动保存中' || state === '已自动保存'
    content = (
      <>
        <div className="mini-description">
          <h3>{state === '已自动保存' ? '改动已自动保存' : '有改动还没保存'}</h3>
          <p>
            {auto
              ? state === '已自动保存'
                ? '这次改动已经写入笔记，可以离开。'
                : '笔记正在自动保存。保存完成后才能离开。'
              : '离开前保存改动，或丢弃改动。'}
          </p>
          {state === '保存失败' && hint('保存失败，请检查连接后重试。', true)}
          <div className="stack-actions">
            <Button disabled={pending} onClick={() => setResult('继续编辑，草稿保留')}>
              继续编辑
            </Button>
            {!auto && (
              <Button danger disabled={pending} onClick={() => setResult('已丢弃（演示）')}>
                丢弃改动
              </Button>
            )}
            <Button
              type="primary"
              loading={pending}
              onClick={() =>
                finish(
                  state === '已自动保存' ? '已离开（演示）' : '保存后离开（演示）',
                  state === '保存失败' && attempts === 0,
                  () => setOpen(false),
                )
              }
            >
              {state === '已自动保存' ? '离开' : '保存并离开'}
            </Button>
          </div>
        </div>
        <Button ref={trigger} onClick={() => setOpen(true)}>
          体验离开确认
        </Button>
        <Modal
          {...modalCommon}
          open={open}
          title={state === '已自动保存' ? '改动已自动保存' : '有改动还没保存'}
          closable={false}
          keyboard={false}
          mask={{ closable: false }}
          footer={
            <div className="stack-actions">
              <Button disabled={pending} onClick={() => setOpen(false)}>
                继续编辑
              </Button>
              {!auto && (
                <Button
                  danger
                  disabled={pending}
                  onClick={() => {
                    setOpen(false)
                    setResult('已丢弃（演示）')
                  }}
                >
                  丢弃改动
                </Button>
              )}
              <Button
                type="primary"
                loading={pending}
                onClick={() =>
                  finish(
                    state === '已自动保存' ? '已离开（演示）' : '保存后离开（演示）',
                    state === '保存失败' && attempts === 0,
                    () => setOpen(false),
                  )
                }
              >
                {state === '已自动保存' ? '离开' : '保存并离开'}
              </Button>
            </div>
          }
        >
          <p>离开前请确认当前改动的保存状态。</p>
          {(error || result) &&
            hint(result || '保存失败，内容仍保留在编辑器中。', Boolean(showError) || error)}
        </Modal>
      </>
    )
  } else if (scene.id === 'feedback')
    content =
      state === '读取中' ? (
        <Skeleton active title={false} paragraph={{ rows: 5 }} />
      ) : state === '空内容' || (state === '读取失败' && recovered) ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="这里还没有资料">
          <Button type="primary" onClick={() => setResult('新建入口已打开（演示）')}>
            新建笔记
          </Button>
        </Empty>
      ) : state === '读取失败' && !recovered ? (
        <div className="error-surface">
          <h3>读取失败</h3>
          <p className="muted">暂时无法读取资料，请稍后重试。</p>
          <Button loading={busy} onClick={() => finish('已重新读取（演示）')}>
            重试
          </Button>
        </div>
      ) : (
        <div className="field-stack">
          <label>显示名称</label>
          <div className="inline-save">
            <Input
              aria-label="显示名称草稿"
              value={text}
              disabled={pending}
              onChange={(e) => {
                setText(e.target.value)
                setResult('')
                setDirty(true)
              }}
              onPressEnter={() => {
                if (dirty || (!recovered && state !== '已保存'))
                  finish('已保存（演示）', shouldFail)
              }}
            />
            <Button
              type={dirty || state === '未保存' ? 'primary' : 'default'}
              disabled={!dirty && (state === '已保存' || recovered)}
              loading={pending}
              onClick={() => finish('已保存（演示）', shouldFail)}
            >
              {pending && after
                ? '保存中'
                : !dirty && (state === '已保存' || recovered)
                  ? '已保存'
                  : '保存'}
            </Button>
          </div>
          {after && (
            <div className={`save-status ${error ? 'error' : ''}`} role="status">
              {result ||
                (error
                  ? '保存失败，输入已保留。'
                  : dirty || (state === '未保存' && !recovered)
                    ? '有改动尚未保存。'
                    : state === '保存中'
                      ? '正在保存…'
                      : '已保存')}{' '}
              {error && (
                <button className="text-link" disabled={busy} onClick={() => finish('已保存')}>
                  重试
                </button>
              )}
            </div>
          )}
          <div className="feedback-actions">
            <Button size="small" onClick={() => message.success('操作成功')}>
              成功提示
            </Button>
            <Button size="small" onClick={() => message.warning('部分文件未能上传')}>
              警告提示
            </Button>
            <Button size="small" onClick={() => message.error('保存失败，请重试')}>
              错误提示
            </Button>
          </div>
          {after && hint('短消息只报结果，仍需处理的失败留在原位置。')}
        </div>
      )
  else
    content = (
      <>
        <div
          className={`upload-zone ${uploadStage === '上传中' || busy ? 'busy' : ''}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            setUploadStage('已选择')
            setResult('已接收拖入动作；仅加入2个示例文件，不读取拖入的文件。')
          }}
        >
          {icon('upload', 26)}
          <h3>点击或拖入文件</h3>
          <p className="muted">设计演示使用本地示例，不读取你的文件。</p>
          <Button
            disabled={uploadStage === '上传中' || busy}
            onClick={() => {
              setUploadStage('已选择')
              setResult('已选择2个示例文件，可以开始演示上传')
            }}
          >
            选择示例文件
          </Button>
        </div>
        {uploadStage === '已选择' && (
          <div className="upload-summary">
            <p>2 个示例文件已准备好</p>
            <Button
              type="primary"
              onClick={() => {
                setUploadStage('上传中')
                finish('示例上传结束：完成1个，失败1个', false, () => setUploadStage('部分失败'))
              }}
            >
              开始演示上传
            </Button>
          </div>
        )}
        {!['待选择', '已选择'].includes(uploadStage) && (
          <>
            <div className="upload-summary">
              {uploadStage === '上传中'
                ? '正在上传 1 / 2'
                : uploadStage === '部分失败'
                  ? '已完成 1 个 · 失败 1 个'
                  : uploadStage === '超出限制'
                    ? '1 个文件超出大小限制'
                    : '2 个文件已完成'}
            </div>
            {['研究笔记与资料整理.pdf', '产品资料.xlsx'].map((f, i) => (
              <div className="upload-result" key={f}>
                <span className="filename" title={f}>
                  {f}
                </span>
                <span
                  className={
                    i === 1 && ['部分失败', '超出限制'].includes(uploadStage) ? 'error' : 'muted'
                  }
                >
                  {uploadStage === '上传中'
                    ? i === 0
                      ? '上传中…'
                      : '等待上传'
                    : uploadStage === '超出限制'
                      ? i === 1
                        ? '超过上限'
                        : '已收进'
                      : i === 1 && uploadStage === '部分失败'
                        ? '未能上传'
                        : '已收进'}
                </span>
              </div>
            ))}
            {after &&
              uploadStage === '部分失败' &&
              hint('产品资料.xlsx 未能上传。检查连接后，重新选择这份文件即可。', true)}
            {after &&
              uploadStage === '超出限制' &&
              hint('产品资料.xlsx 超过当前上限，请压缩后重新选择。', true)}
            {uploadStage !== '上传中' && (
              <Space wrap>
                <Button type="primary" onClick={() => setResult('已打开研究笔记（演示）')}>
                  打开已完成文件
                </Button>
                <Button
                  onClick={() => {
                    setUploadStage('待选择')
                    setResult('已重置示例选择')
                  }}
                >
                  继续上传
                </Button>
              </Space>
            )}
          </>
        )}
        {after && hint('按实际上传阶段显示状态，不展示虚构的进度百分比。')}
      </>
    )

  return (
    <div className={`specimen ${after ? 'proposed' : 'current'}`} ref={container}>
      <div className="scene-surface">{content}</div>
      {note}
    </div>
  )
}

function Review() {
  const appearance = useAppearance()
  const [id, setId] = useState('fields'),
    [state, setState] = useState('默认'),
    [view, setView] = useState('split'),
    [narrow, setNarrow] = useState(false),
    [reset, setReset] = useState(0),
    [coverage, setCoverage] = useState(false)
  const scene = scenes.find((s) => s.id === id)!
  const choose = (nextId: string) => {
    setId(nextId)
    setState(scenes.find((s) => s.id === nextId)!.states[0]!)
    setReset((v) => v + 1)
  }
  return (
    <div className={`review ${appearance}`}>
      <header className="review-header">
        <div className="brand">
          <BrandMark size={23} title={null} />
          <span>
            mimir <span className="header-divider">/</span> 交互评审
          </span>
        </div>
        <div className="header-actions">
          <span className="version">基础组件 · v1 · 待认可</span>
          <Button
            size="small"
            onClick={() => setThemeMode(appearance === 'dark' ? 'light' : 'dark')}
          >
            {appearance === 'dark' ? '切换浅色' : '切换深色'}
          </Button>
          <Button size="small" onClick={() => setCoverage((v) => !v)}>
            {coverage ? '返回对比' : '覆盖清单'}
          </Button>
        </div>
      </header>
      <div className="review-layout">
        <aside className="sidebar">
          <h2>基础组件</h2>
          <p>先看效果，再决定实施</p>
          {['填写', '操作', '保护与反馈'].map((g) => (
            <div className="nav-group" key={g}>
              <h3>{g}</h3>
              {scenes
                .filter((s) => s.group === g)
                .map((s) => (
                  <button
                    aria-current={s.id === id ? 'page' : undefined}
                    className={s.id === id ? 'active' : ''}
                    key={s.id}
                    onClick={() => {
                      choose(s.id)
                      setCoverage(false)
                    }}
                  >
                    {s.name}
                    {icon('arrow', 13)}
                  </button>
                ))}
            </div>
          ))}
          <div className="sidebar-foot">
            本稿未修改产品代码。
            <br />
            当前列使用现有主题真实渲染，业务片段按源码复现。
          </div>
        </aside>
        <main className="review-main">
          <div className="mobile-scenes">
            <Select
              aria-label="选择评审场景"
              value={id}
              options={scenes.map((s) => ({ value: s.id, label: s.name }))}
              onChange={choose}
            />
          </div>
          <div className="intro">
            <div>
              <h1>{coverage ? '基础组件覆盖清单' : scene.name}</h1>
              <p>
                {coverage ? '12 个场景分别审阅；具体业务整页在后续模块中独立覆盖。' : scene.change}
              </p>
            </div>
            <button className="text-link" onClick={() => setReset((v) => v + 1)}>
              重置演示
            </button>
          </div>
          {coverage ? (
            <div className="coverage-list">
              {scenes.map((s) => (
                <section key={s.id}>
                  <div>
                    <h2>{s.name}</h2>
                    <button
                      className="text-link"
                      onClick={() => {
                        choose(s.id)
                        setCoverage(false)
                      }}
                    >
                      查看对比
                    </button>
                  </div>
                  <p>{s.checks.join(' · ')}</p>
                  <div className="state-chips">
                    {s.states.map((v) => (
                      <span key={v}>{v}</span>
                    ))}
                  </div>
                  <small>{s.source}</small>
                </section>
              ))}
              <p className="review-disclaimer">
                本稿为共用机制评审。知识库/设置/对话的完整业务页及六种编辑器将在各自HTML逐页呈现；此处未将它们标为已覆盖。创建弹窗复用产品现有13项知识库图标与标签，支持选择与取消。
              </p>
            </div>
          ) : (
            <>
              <div className="review-controls">
                <div className="state-control">
                  <label>体验状态</label>
                  <Select
                    aria-label="选择体验状态"
                    value={state}
                    options={scene.states.map((s) => ({ value: s, label: s }))}
                    onChange={(v) => {
                      setState(v)
                      setReset((r) => r + 1)
                    }}
                  />
                </div>
                <Space wrap>
                  <Segmented
                    aria-label="对比方式"
                    value={view}
                    onChange={(v) => setView(String(v))}
                    options={[
                      { value: 'split', label: '前后对比' },
                      { value: 'before', label: '当前' },
                      { value: 'after', label: '打磨后' },
                    ]}
                  />
                  <Checkbox checked={narrow} onChange={(e) => setNarrow(e.target.checked)}>
                    390px 视窗
                  </Checkbox>
                </Space>
              </div>
              <div
                className={`comparison ${view} ${narrow ? 'narrow' : ''}`}
                key={`${id}-${state}-${reset}`}
              >
                {view !== 'after' && (
                  <section className="comparison-column" data-side="before" aria-label="当前效果">
                    <div className="column-header">
                      <h2>当前</h2>
                      <span>现有主题与行为</span>
                    </div>
                    <Specimen scene={scene} state={state} after={false} />
                  </section>
                )}
                {view !== 'before' && (
                  <section className="comparison-column" data-side="after" aria-label="打磨后效果">
                    <div className="column-header">
                      <h2>打磨后</h2>
                      <span>待你认可的提案</span>
                    </div>
                    <Specimen scene={scene} state={state} after />
                  </section>
                )}
              </div>
              <div className="review-notes">
                <div>
                  <h3>当前依据</h3>
                  <p>{scene.current}</p>
                </div>
                <div>
                  <h3>保留项</h3>
                  <p>{scene.keep}</p>
                </div>
                <details>
                  <summary>本场景的细节清单与来源</summary>
                  <ul>
                    {scene.checks.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p className="source">packages/renderer/src/{scene.source}</p>
                  <p>
                    hover / pressed 使用真实控件反馈；loading /
                    结果均为本地模拟。状态选择器用于快速查看，不能代替真实业务验收。
                  </p>
                </details>
              </div>
            </>
          )}
          <footer className="review-footer">
            <span>模块审批范围：共用控件与反馈机制</span>
            <span>版本 v1 · 2026-10-18 · 等待你的反馈</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(
  <MimirProvider>
    <Review />
  </MimirProvider>,
)
