import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Avatar, Button, Input, Popconfirm, Typography, Upload } from 'antd'
import { useEffect, useState } from 'react'
import { api, type AuthSession } from '../../lib/api'
import { cropAvatar } from '../../lib/avatar'
import { Block, BlockDesc, Panel } from './parts'
import { useStyles } from './settings.style'
import { useAccountStyles } from './AccountSection.style'

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

  const sessionQuery = useQuery({ queryKey: ['session'], queryFn: api.auth.session })
  const session = sessionQuery.data
  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const localMode = configQuery.data?.localMode ?? false

  return (
    <>
      <Panel title="资料">
        <Block>
          <div className={accountStyles.profile}>
            <AvatarColumn session={session ?? null} />

            <div className={accountStyles.profileBody}>
              <NameField session={session ?? null} localMode={localMode} />
              {localMode ? (
                <BlockDesc>本地使用，数据只在这台电脑上。名称与头像只影响这里的显示。</BlockDesc>
              ) : (
                <>
                  <div className={accountStyles.emailRow}>
                    <span className={accountStyles.emailLabel}>邮箱</span>
                    <span className={accountStyles.emailValue}>{session?.user.email ?? '—'}</span>
                  </div>
                  <BlockDesc>
                    要换邮箱，改服务端的 <Typography.Text code>OWNER_EMAIL</Typography.Text>{' '}
                    再重启。
                  </BlockDesc>
                </>
              )}
            </div>
          </div>
        </Block>
      </Panel>

      {/* 登出只在云端模式出现：本地模式下没有「登出去哪」——下一次打开
          还是同一台机器、同一个本机用户。留一颗点了没反应的按钮比没有更糟 */}
      {localMode ? null : (
        <div className={styles.actions} style={{ marginTop: 14 }}>
          <Button danger onClick={() => void api.auth.signOutAndLeave()}>
            登出
          </Button>
        </div>
      )}
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
        {/*
          用 antd 的 `Upload` 而不是 `<label>` + 隐藏的原生 `<input type="file">`。

          原来的写法是无脚本也能工作的经典做法，但它有一个这里很致命的
          缺点：**原生控件不服从 token 体系**——各浏览器给它的默认样式不同，
          深浅两套主题也管不到它。而这个项目已经因为「原生控件看起来
          不属于这套设计」改过一次（统计页的范围选择器）。

          `beforeUpload` 返回 `false` 是**刻意的**：它阻止 antd 自己发请求，
          因为我们要先本地裁剪再上传（`cropAvatar`）。返回 `false` 之后
          `onChange` 不会带出可用的文件列表，所以直接在这里 `mutate`。
        */}
        <Upload
          accept="image/png,image/jpeg,image/webp"
          showUploadList={false}
          maxCount={1}
          disabled={upload.isPending}
          beforeUpload={(file) => {
            upload.mutate(file)
            return false
          }}
        >
          <Button size="small" loading={upload.isPending}>
            {image ? '更换' : '上传头像'}
          </Button>
        </Upload>

        {/*
          「移除」要确认。

          头像是一次点击就没了，而它没有撤销——`type="link"` 时它与
          「更换」长得一样显眼，误触的代价却不对称。这里两处都改：
          按钮形态回到 `default`（它们是动作，不是链接文字），
          删除加一层 `Popconfirm`（与供应商删除同一个做法）。
        */}
        {image ? (
          <Popconfirm
            title="移除头像？"
            description="会回到名称首字的字母头像"
            onConfirm={() => remove.mutate()}
          >
            <Button size="small" loading={remove.isPending}>
              移除
            </Button>
          </Popconfirm>
        ) : null}
      </div>

      {/* 上传会自动裁剪，所以这不是「你必须先裁好」的要求，而是告知 */}
      <div className={accountStyles.avatarHint}>自动裁成方形</div>
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
function NameField({ session, localMode }: { session: AuthSession | null; localMode: boolean }) {
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
    // 两个端点返回的形状不同（`{status}` 与 `{name}`），而这里不关心返回值——
    // 保存成功后统一靠 `['session']` 的重取刷新界面。吞掉返回值也让返回类型
    // 归一，否则 useMutation 会按第一个分支推出一个联合类型（TS 会拒绝）
    mutationFn: async (name: string) => {
      if (localMode) await api.local.updateProfile({ name })
      else await api.auth.updateUser({ name })
    },
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
