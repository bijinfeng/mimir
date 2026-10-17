import { useSyncExternalStore } from 'react'
import { ShieldCheck } from 'lucide-react'
import { ToolbarButton, ToolbarMenuFields, ToolbarMenuNote } from '../shell/EditorShell.js'
import type { DocxAdvancedContext } from './DocxAdvancedControls.js'
import './docx-protection.css'
const LABELS: Record<string, string> = {
  readOnly: '只读',
  comments: '仅批注',
  forms: '仅填写表单',
  trackedChanges: '强制修订',
}
export function DocxProtectionControls({ context }: { context: DocxAdvancedContext }) {
  const controller = context.session.protection
  const access = useSyncExternalStore(controller.subscribe, controller.getAccess)
  const native = controller.native
  return (
    <div className="mimir-docx-protection">
      <div className="mimir-docx-protection__body">
        <ToolbarMenuFields label="原件保护">
          <dl className="mimir-docx-protection__values">
            <dt>当前状态</dt>
            <dd>
              {access.writable
                ? '可以编辑'
                : access.commentsOnly
                  ? '仅批注 · 正文只读'
                  : '只读保留'}
            </dd>
            <dt>编辑限制</dt>
            <dd>
              {native.uncertain
                ? '无法可靠读取'
                : native.enforced
                  ? (LABELS[native.mode ?? ''] ?? '未知限制')
                  : '未启用'}
            </dd>
            <dt>修改密码</dt>
            <dd>
              {native.uncertain || native.credentials === 'unsupported'
                ? '凭据无法可靠读取'
                : native.modificationPassword
                  ? '已设置，尚不支持核验'
                  : '未设置'}
            </dd>
            <dt>只读建议</dt>
            <dd>
              {native.uncertain ? '无法可靠读取' : native.recommended ? '原件建议只读' : '无'}
            </dd>
          </dl>
          {access.reason && <p role="status">{access.reason}</p>}
        </ToolbarMenuFields>
        <ToolbarMenuFields label="可用操作">
          <ToolbarMenuNote>
            {access.writable
              ? '使用工具栏编辑当前文档，修改后手动保存。'
              : access.commentsOnly
                ? '在“管理批注”中修改已有讨论文字、回复、解决或重新打开。正文与锚点保持只读，新增和删除批注尚未支持。'
                : '可以阅读、选取复制、查找、对比文档，并导出未修改的原件。'}
          </ToolbarMenuNote>
          <ToolbarMenuNote>
            原件保护设置完整保留。本版本暂不提供保护密码核验、设置或移除。
          </ToolbarMenuNote>
        </ToolbarMenuFields>
      </div>
      <div className="mimir-docx-protection__actions">
        {access.recommendedChoice ? (
          <ToolbarButton
            label="仍然编辑此文档"
            primary
            onClick={() => controller.continueRecommendedEditing()}
          >
            <ShieldCheck size={14} />
          </ToolbarButton>
        ) : (
          <ToolbarMenuNote>
            {access.writable || access.commentsOnly ? '保护设置随原件保留' : '当前保护不允许写入'}
          </ToolbarMenuNote>
        )}
      </div>
    </div>
  )
}
