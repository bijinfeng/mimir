import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Avatar, Button, Input, Upload } from 'antd'
import { Camera } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api, type AuthSession } from '../../lib/api'
import { type CroppedAvatar } from '../../lib/avatar'
import { LoadError } from '../LoadError'
import { AvatarCropper } from '../AvatarCropper'
import { Block, Panel } from './parts'
import { useAccountStyles } from './AccountSection.style'
import { clearSettingDraft, readSettingDraft, writeSettingDraft } from './draft-memory'

/**
 * 账号。
 *
 * 单用户自托管，这里做三件事：**改名称、换头像、登出**——但在本地模式
 * （D-100）下只剩前两件：没有登出、没有邮箱，因为**本机用户不是登录来的**，
 * 进入方式由桌面客户端自己持有（宿主注入的本机令牌）。
 *
 * 「现在是哪种模式」由服务端说了算（`RuntimeConfig.localMode`），界面不猜：
 * 猜错的表现是一个点了必然失败的「登出」按钮。
 *
 * ## 明确不做
 *
 * | 不做 | 为什么 |
 * |---|---|
 * | 改邮箱 | `OWNER_EMAIL` 是所有者账号的真相来源（D-020）。改邮箱等于换账号，而那个动作应该改 `.env` 再重启 |
 * | 用户列表 / 角色 / 权限 | PRD §1 非目标。界面上多一个「用户」分区会暗示这套东西存在 |
 * | 删除账号 | 没有对应语义——单用户实例里删除账号等于删除整个服务的入口，那是运维动作不是界面动作 |
 *
 * ## 名称与头像的保存方式**不同**，这是刻意的
 *
 * - **名称**：显式点保存。与设置页其它键一致（`SettingControl` 的注释解释了
 *   为什么不用 onBlur——真实浏览器里按 Tab 后焦点不离开，blur 不触发，
 *   于是「界面上显示新值、数据库里一行都没有」）
 * - **头像**：选中文件 → 可视化裁切（`AvatarCropper`）→ 确认后上传。
 *   自动中心裁切可能截掉用户想保留的部分（人脸偏左的照片），所以让用户
 *   自己决定取哪块。进行中状态由**本地预览**承担——裁切确认后立即显示新图，
 *   上传完成再换成服务端版本，用户不会怀疑「点了没反应」
 *
 * ## 预览用本地 objectURL，不等服务端返回
 *
 * 上传是往返操作，没有本地预览用户会怀疑「点了没反应」——而那个怀疑
 * 在慢网络下是真实的：几秒内界面上什么都没有变化。
 */
export function AccountSection() {
  const { styles: accountStyles } = useAccountStyles()

  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.auth.session })
  const session = sessionQuery.data
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const localMode = configQuery.data?.localMode ?? false

  if (sessionQuery.isError || configQuery.isError) {
    return (
      <LoadError
        message="账号资料读取失败"
        onRetry={() => {
          if (sessionQuery.isError) void sessionQuery.refetch()
          if (configQuery.isError) void configQuery.refetch()
        }}
      />
    )
  }

  return (
    <Panel title="个人资料" desc="修改头像、名称等基本信息">
      <Block>
        <div className={accountStyles.profile}>
          <AvatarColumn session={session ?? null} />

          <div className={accountStyles.profileBody}>
            {session ? (
              <NameField key={session.user.id} session={session} localMode={localMode} />
            ) : null}
            {localMode ? null : (
              <>
                <div className={accountStyles.emailRow}>
                  <span className={accountStyles.emailLabel}>邮箱</span>
                  <span className={accountStyles.emailValue}>{session?.user.email ?? '—'}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </Block>
      {localMode ? null : (
        <div className={accountStyles.accountFooter}>
          <Button danger onClick={() => void api.auth.signOutAndLeave()}>
            登出
          </Button>
        </div>
      )}
    </Panel>
  )
}

/**
 * 头像列：默认显示当前头像，悬停或聚焦时显示相机入口。
 *
 * ## 交互设计
 *
 * - **点击圆形入口**：选文件 → 弹出 `AvatarCropper` 可视化裁切 → 确认后上传
 * - **相机图标**：悬停或聚焦时显现
 *
 * 选中文件后不直接上传，而是先让用户裁切——自动中心裁切可能截掉用户想保留的
 * 部分（比如人脸偏左的照片），可视化裁切让用户自己决定取哪块。
 */
function AvatarColumn({ session }: { session: AuthSession | null }) {
  const { styles: accountStyles } = useAccountStyles()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  /**
   * 本地预览 URL。上传成功后清掉，改用服务端返回的带版本 URL——
   * 留着本地 URL 会掩盖「服务端其实存的是另一张」这种问题。
   */
  const [preview, setPreview] = useState<string | null>(null)
  /** 待裁切的文件；非 null 时渲染 `AvatarCropper` 弹窗 */
  const [cropFile, setCropFile] = useState<File | null>(null)

  /**
   * 组件卸载时释放 objectURL。**不释放就会泄漏**：每个 URL 持有整个
   * Blob 的内存，而换十次头像就是十份 256×256 的位图。
   */
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const upload = useMutation({
    mutationFn: async (cropped: CroppedAvatar) => {
      setPreview(cropped.previewUrl)
      return api.avatar.upload(cropped.blob)
    },
    onSuccess: () => {
      message.success('头像已更新')
      setPreview(null)
      void queryClient.invalidateQueries({ queryKey: ['session'] })
    },
    onError: (error) => {
      setPreview(null)
      message.error(error instanceof Error ? error.message : '上传失败')
    },
  })

  const image = preview ?? session?.user.image ?? undefined

  return (
    <div className={accountStyles.avatarColumn}>
      <div className={accountStyles.avatarWrapper}>
        {/*
          整个圆形入口都是可点击区域——点击即选文件。
          用 antd 的 `Upload` 而不是裸 `<input type="file">`：
          原生控件不服从 token 体系，深浅主题都管不到它。
          `beforeUpload` 返回 `false` 是刻意的：阻止 antd 自己发请求，
          改走我们自己的裁切 + 上传流程（`AvatarCropper`）。
        */}
        <Upload
          accept="image/png,image/jpeg,image/webp"
          showUploadList={false}
          maxCount={1}
          disabled={upload.isPending}
          beforeUpload={(file) => {
            setCropFile(file)
            return false
          }}
        >
          <div
            className={accountStyles.avatarClickable}
            aria-label="更换头像"
            role="button"
            tabIndex={upload.isPending ? -1 : 0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.currentTarget.click()
              }
            }}
          >
            <Avatar size={52} src={image} className={accountStyles.avatar}>
              {session?.user.name?.slice(0, 1).toUpperCase() ?? '?'}
            </Avatar>
            <span
              className={accountStyles.avatarCameraOverlay}
              data-role="avatar-camera-overlay"
              aria-hidden="true"
            >
              <Camera size={21} strokeWidth={2} />
            </span>
          </div>
        </Upload>
      </div>

      {/* 可视化裁切弹窗：选中文件后出现，确认裁切后上传 */}
      {cropFile ? (
        <AvatarCropper
          file={cropFile}
          onConfirm={(cropped) => {
            setCropFile(null)
            upload.mutate(cropped)
          }}
          onCancel={() => setCropFile(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * 名称。显式保存——与设置页其它键的行为一致。
 *
 * 两个模式下**写入端点不同**：云端走 Better Auth 的 `update-user`，
 * 本地模式走 `/api/local/profile`（前者的路径要求一个真实会话，本地模式
 * 靠本机令牌进入，那条路必然失败）。这不是两条业务规则——名称还是那个
 * 名称，差别只在「谁能写这个用户行」。
 */
function NameField({ session, localMode }: { session: AuthSession; localMode: boolean }) {
  const { styles: accountStyles } = useAccountStyles()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const serverName = session.user.name ?? ''
  const draftKey = `account:${session.user.id}:name`
  const [draft, setDraft] = useState(() => String(readSettingDraft(draftKey) ?? serverName))
  const [lastServerName, setLastServerName] = useState(serverName)

  /**
   * 服务端值变了（保存成功后重新拉取、或另一个标签页改过）就同步过来。
   *
   * **渲染期调整 state，不用 `useEffect`**：effect 里同步 setState 会触发
   * 一轮级联渲染，React 的 lint 会拦下它，而且 React Compiler 会
   * **跳过整个组件**（静默不优化，见 `.trellis/spec/renderer/frontend/conventions.md` 与
   * `SettingControl` 的同一条注释）。
   */
  if (serverName !== lastServerName) {
    setLastServerName(serverName)
    if (readSettingDraft(draftKey) === undefined) setDraft(serverName)
  }

  const dirty = draft.trim() !== serverName && draft.trim() !== ''

  const save = useMutation({
    // 两个端点返回的形状不同（`{status}` 与 `{name}`），而这里不关心返回值——
    // 保存成功后统一靠 `['session']` 的重取刷新界面。吞掉返回值也让返回类型
    // 归一，否则 useMutation 会按第一个分支推出一个联合类型（TS 会拒绝）
    mutationFn: async (name: string) => {
      if (localMode) await api.local.updateProfile({ name })
      else await api.auth.updateUser({ name })
    },
    onSuccess: () => {
      clearSettingDraft(draftKey)
      message.success('名称已保存')
      void queryClient.invalidateQueries({ queryKey: ['session'] })
    },
    onError: (error) => {
      message.error(error instanceof Error ? error.message : '保存失败')
    },
  })

  return (
    <div className={accountStyles.nameRow}>
      <span className={accountStyles.emailLabel}>名称</span>
      <Input
        aria-label="名称"
        value={draft}
        maxLength={60}
        disabled={save.isPending}
        onChange={(event) => {
          setDraft(event.target.value)
          if (event.target.value === serverName) clearSettingDraft(draftKey)
          else writeSettingDraft(draftKey, event.target.value)
        }}
        onPressEnter={() => {
          if (dirty) save.mutate(draft.trim())
        }}
        className={accountStyles.nameInput}
      />
      <Button
        type="primary"
        disabled={!dirty}
        loading={save.isPending}
        onClick={() => save.mutate(draft.trim())}
      >
        保存
      </Button>
    </div>
  )
}
