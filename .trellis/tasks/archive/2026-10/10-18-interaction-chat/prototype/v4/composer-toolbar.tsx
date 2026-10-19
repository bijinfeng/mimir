import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { CheckIcon, ChevronDownIcon, LibraryIcon, ZapIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

export type ComposerToolbarState = {
  scope: string
  deep: boolean
  sidebar: boolean
  searchOnly: boolean
  documents: string[]
  documentsStatus: 'loaded' | 'loading' | 'error' | 'empty'
  modelRoles: { chat?: string; reasoning?: string }
  initialMenu?: string
}
type ToolbarContext = {
  state?: ComposerToolbarState
  onAction: (action: string, value?: string) => void
}
const Context = createContext<ToolbarContext>({ onAction() {} })
export function ComposerToolbarProvider({
  value,
  children,
}: {
  value: ToolbarContext
  children: ReactNode
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>
}

/** The sole local UI composition: business selectors, original upstream UI defaults. */
export function ComposerBusinessToolbar() {
  const { state, onAction } = useContext(Context)
  const [selection, setSelection] = useState<{ source?: string; name: string }>({ name: 'none' })
  const menu =
    selection.source === state?.initialMenu ? selection.name : state?.initialMenu || 'none'
  if (!state) return null
  const deep = !state.sidebar && state.deep
  const model = (deep ? state.modelRoles.reasoning : state.modelRoles.chat) || '未配置模型'
  const scope = state.scope || '全部文档'
  const open = (name: string) => (value: boolean) =>
    setSelection({ source: state.initialMenu, name: value ? name : 'none' })
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" aria-label="本轮对话设置">
      <DropdownMenu open={menu === 'model'} onOpenChange={open('model')}>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" />}
          aria-label={`当前全局模型：${model}`}
        >
          <span className="max-w-24 truncate" title={model}>
            {model}
          </span>
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" aria-label="全局模型绑定">
          {(['chat', 'reasoning'] as const).map((role) => (
            <DropdownMenuItem
              key={role}
              disabled
              aria-label={`${role === 'chat' ? '对话模型' : '深度思考模型'}：${state.modelRoles[role] || '未配置'}${(role === 'reasoning') === deep ? '，当前使用' : ''}`}
            >
              <span className="flex min-w-0 flex-col">
                <span>{role === 'chat' ? '对话模型' : '深度思考模型'}</span>
                <span className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 truncate" title={state.modelRoles[role] || '未配置'}>
                    {state.modelRoles[role] || '未配置'}
                  </span>
                  {(role === 'reasoning') === deep && <CheckIcon />}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onAction('toolbar-manage-models')}>
            管理模型
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {state.sidebar ? (
        <Button
          variant="ghost"
          size="sm"
          disabled
          title="文档助手始终使用标准思考强度"
          aria-label="思考强度：标准，文档助手不支持深入"
        >
          <ZapIcon />
          标准
        </Button>
      ) : (
        <DropdownMenu open={menu === 'strength'} onOpenChange={open('strength')}>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="sm" />}
            aria-label={`思考强度：${deep ? '深入' : '标准'}`}
          >
            <ZapIcon />
            {deep ? '深入' : '标准'}
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" aria-label="思考强度">
            <DropdownMenuRadioGroup
              value={deep ? 'deep' : 'standard'}
              onValueChange={(value) => onAction('toolbar-strength', value)}
            >
              <DropdownMenuRadioItem value="standard">标准（对话模型）</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="deep">深入（推理模型）</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <DropdownMenu open={menu === 'scope'} onOpenChange={open('scope')}>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" />}
          aria-label={`本轮检索范围：${scope}`}
        >
          <LibraryIcon />
          <span className="max-w-24 truncate" title={scope}>
            {state.scope ? scope : '全部文档'}
          </span>
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" aria-label="本轮检索范围">
          {state.scope && (
            <>
              <DropdownMenuItem onClick={() => onAction('toolbar-scope', '')}>
                清除本轮检索范围
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {state.documentsStatus === 'loading' ? (
            <DropdownMenuItem disabled>加载中…</DropdownMenuItem>
          ) : state.documentsStatus === 'error' ? (
            <DropdownMenuItem onClick={() => onAction('toolbar-refetch-documents')}>
              读取失败，点此重试
            </DropdownMenuItem>
          ) : state.documentsStatus === 'empty' ? (
            <DropdownMenuItem disabled>知识库还没有文档</DropdownMenuItem>
          ) : (
            state.documents.slice(0, 20).map((doc) => (
              <DropdownMenuItem key={doc} onClick={() => onAction('toolbar-scope', doc)}>
                <span className="min-w-0 truncate" title={doc}>
                  {doc}
                </span>
                {state.scope === doc && <CheckIcon />}
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
