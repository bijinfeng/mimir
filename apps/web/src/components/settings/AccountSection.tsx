import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Avatar, Button, Input, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { api, type AuthSession } from '@/lib/api'
import { cropAvatar } from '@/lib/avatar'
import { Block, BlockDesc, Note, Panel } from '@/components/settings/parts'
import { useStyles } from '@/components/settings/settings.style'
import { useAccountStyles } from './AccountSection.style'

/**
 * 账号。
 *
 * 单用户自托管，这里做三件事：**改名称、换头像、登出**。
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
 * - **头像**：选中文件即上传。它没有「输入到一半」的中间状态，
 *   再要一次确认只是多一步；而上传有明确的进行中状态（按钮 loading）
 *
 * ## 预览用本地 objectURL，不等服务端返回
 *
 * 上传是往返操作，没有本地预览用户会怀疑「点了没反应」——而那个怀疑
 * 在慢网络下是真实的：几秒内界面上什么都没有变化。
 */
export function AccountSection() {
  const { styles } = useStyles()
  const { styles: accountStyles } = useAccountStyles()
  const { message } = App.useApp()

  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.auth.session })
  const session = sessionQuery.data

  return (
    <>
      <Typography.Paragraph className={styles.sectionDesc}>
        单用户自托管。第一个注册的人是唯一用户，之后注册自动关闭。
      </Typography.Paragraph>

      <Panel title="资料">
        <Block>
          <div className={accountStyles.profile}>
            <AvatarColumn session={session ?? null} />

            <div className={accountStyles.profileBody}>
              <NameField session={session ?? null} />
              <div className={accountStyles.emailRow}>
                <span className={accountStyles.emailLabel}>邮箱</span>
                <span className={accountStyles.emailValue}>{session?.user.email ?? '—'}</span>
              </div>
              <BlockDesc>
                邮箱是账号的锚点，不在这里改——它是所有者账号的真相来源，
                改它等于换账号。需要换就改服务端的 <code>OWNER_EMAIL</code> 再重启。
              </BlockDesc>
            </div>
          </div>
        </Block>
      </Panel>

      <Note>
        头像存在服务端的 <code>data/avatars/</code>，
        <span className={styles.strong}>不在笔记目录里</span>
        ——它不是内容：不参与检索分词，也不进导出包。导出回答的是「我的知识」， 不是「我的账户」。
      </Note>

      <div className={styles.actions} style={{ marginTop: 14 }}>
        <Button
          danger
          onClick={() => {
            void api.auth.signOut().then(() => {
              message.success('已登出')
              window.location.href = '/login'
            })
          }}
        >
          登出
        </Button>
      </div>
    </>
  )
}

/** 头像列：预览 + 上传 / 移除。上传是**选中即传**，没有二次确认 */
function AvatarColumn({ session }: { session: AuthSession | null }) {
  const { styles: accountStyles } = useAccountStyles()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  /**
   * 本地预览 URL。上传成功后清掉，改用服务端返回的带版本 URL——
   * 留着本地 URL 会掩盖「服务端其实存的是另一张」这种问题。
   */
  const [preview, setPreview] = useState<string | null>(null)

  /**
   * 组件卸载时释放 objectURL。**不释放就会泄漏**：每个 URL 持有整个
   * Blob 的内存，而换十次头像就是十份 256×256 的位图。
   *
   * 用 effect 而不是在 onChange 里读到新值就释放旧的：onChange 里
   * 那个闭包可能已经被重渲染替换掉，而 effect 的清理函数拿到的一定是
   * 当前这一轮的 `preview`。
   */
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const cropped = await cropAvatar(file)
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

  const remove = useMutation({
    mutationFn: api.avatar.remove,
    onSuccess: () => {
      message.success('已移除头像')
      void queryClient.invalidateQueries({ queryKey: ['session'] })
    },
  })

  const image = preview ?? session?.user.image ?? undefined

  return (
    <div className={accountStyles.avatarColumn}>
      <Avatar
        size={72}
        src={image}
        className={accountStyles.avatar}
        /* 无头像时显示名称首字（antd 的默认回落行为） */
      >
        {session?.user.name?.slice(0, 1).toUpperCase() ?? '?'}
      </Avatar>

      <div className={accountStyles.avatarActions}>
        <label className={accountStyles.fileLabel}>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className={accountStyles.fileInput}
            disabled={upload.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0]
              // 先清空 value 再传：不清空的话「同一个文件选两次」不触发 onChange，
              // 而用户在失败后重试的正是同一个文件
              event.target.value = ''
              if (file) upload.mutate(file)
            }}
          />
          {upload.isPending ? '上传中…' : '更换'}
        </label>

        {image ? (
          <button
            type="button"
            className={accountStyles.linkButton}
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
          >
            移除
          </button>
        ) : null}
      </div>

      <div className={accountStyles.avatarHint}>裁成方形 · 256×256</div>
    </div>
  )
}

/** 名称。显式保存——与设置页其它键的行为一致 */
function NameField({ session }: { session: AuthSession | null }) {
  const { styles: accountStyles } = useAccountStyles()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const serverName = session?.user.name ?? ''
  const [draft, setDraft] = useState(serverName)
  const [lastServerName, setLastServerName] = useState(serverName)

  /**
   * 服务端值变了（保存成功后重新拉取、或另一个标签页改过）就同步过来。
   *
   * **渲染期调整 state，不用 `useEffect`**：effect 里同步 setState 会触发
   * 一轮级联渲染，React 的 lint 会拦下它，而且 React Compiler 会
   * **跳过整个组件**（静默不优化，见 `apps/web/AGENTS.md` 与
   * `SettingControl` 的同一条注释）。
   */
  if (serverName !== lastServerName) {
    setLastServerName(serverName)
    setDraft(serverName)
  }

  const dirty = draft.trim() !== serverName && draft.trim() !== ''

  const save = useMutation({
    mutationFn: (name: string) => api.auth.updateUser({ name }),
    onSuccess: () => {
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
        value={draft}
        maxLength={60}
        onChange={(event) => setDraft(event.target.value)}
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
