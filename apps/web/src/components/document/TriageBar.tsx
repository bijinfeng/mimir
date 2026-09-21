import { CheckOutlined, InboxOutlined } from '@ant-design/icons'
import type { DocumentDetail, NoteUpdate } from '@mimir/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { App, Button, Dropdown, Tag } from 'antd'
import { useStyles } from '@/components/document/DocumentPanel.style'
import { flattenFolders } from '@/components/document/folders'
import { api } from '@/lib/api'

/**
 * 整理条。
 *
 * 收件箱原来是**死胡同**：有「待整理」徽标，但没有任何整理动作
 * （`docs/PRD.md` §2.2 的「整理」那一环断了）。
 *
 * 这里把整理变成一组显式操作，并把已有的高频词直接摆成建议标签——
 * 后端早就在算它，界面上没地方显示等于白算（§5.10）。
 */

export interface TriageBarProps {
  doc: DocumentDetail
}

export function TriageBar({ doc }: TriageBarProps) {
  const { styles } = useStyles()
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()

  const patch = useMutation({
    mutationFn: (input: NoteUpdate) => api.documents.update(doc.id, input),
    onSuccess: (updated) => {
      void queryClient.setQueryData(['document', updated.id], updated)
      // 整理会影响列表、目录树计数、标签云与导航计数，四处都要刷新
      void queryClient.invalidateQueries({ queryKey: ['documents'] })
      void queryClient.invalidateQueries({ queryKey: ['folders'] })
      void queryClient.invalidateQueries({ queryKey: ['tags'] })
      void queryClient.invalidateQueries({ queryKey: ['counts'] })
    },
    onError: (error: unknown) => message.error(error instanceof Error ? error.message : '操作失败'),
  })

  /**
   * 建议标签。只对收件箱里的文档请求——已整理的内容不需要建议，
   * 为它们也算一遍是白花的服务端开销。
   */
  const suggestQuery = useQuery({
    queryKey: ['suggested-tags', doc.id, doc.tags.join(',')],
    queryFn: () => api.documents.suggestedTags(doc.id),
  })

  const folderQuery = useQuery({ queryKey: ['folders'], queryFn: api.folders.list })
  const folderItems = flattenFolders(folderQuery.data?.items ?? [])
  const suggestions = suggestQuery.data?.items ?? []

  return (
    <div className={styles.triage}>
      <span className={styles.triageLabel}>
        <InboxOutlined /> 待整理
      </span>

      {suggestions.length > 0 && (
        <>
          <span className={styles.triageHint}>建议标签</span>
          {suggestions.map((tag) => (
            <Tag.CheckableTag
              key={tag}
              checked={false}
              onChange={() => patch.mutate({ tags: [...doc.tags, tag] })}
            >
              ＋ {tag}
            </Tag.CheckableTag>
          ))}
        </>
      )}

      <span className={styles.triageSep} />

      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            ...folderItems.map((item) => ({
              key: item.path,
              label: item.path,
              onClick: () => {
                patch.mutate({ folder: item.path })
                message.success(`已归入 ${item.path}`)
              },
            })),
            // 已经在某个目录里时才给「移出」——没归过目录的文档不需要这个选项
            ...(doc.folder
              ? [
                  { type: 'divider' as const },
                  { key: '__none', label: '移出目录', onClick: () => patch.mutate({ folder: '' }) },
                ]
              : []),
          ],
          // 一个目录都还没有时，给一条禁用项说明情况，而不是弹一个空菜单
          ...(folderItems.length === 0
            ? { items: [{ key: '__empty', label: '还没有其它目录', disabled: true }] }
            : {}),
        }}
      >
        <Button size="small">归入目录…</Button>
      </Dropdown>

      <Button
        size="small"
        type="primary"
        icon={<CheckOutlined />}
        onClick={() => {
          patch.mutate({ status: 'ready' })
          message.success('已整理，移出收件箱')
        }}
      >
        完成整理
      </Button>

      <Button
        size="small"
        onClick={() => {
          modal.confirm({
            // 归档是可逆的（状态位），所以用 confirm 而不是更重的确认流程，
            // 但要说清它「不再出现在默认列表里」这个后果
            title: '归档这篇？',
            content: '归档后它不再出现在收件箱与默认列表里，但检索仍能找到。',
            okText: '归档',
            cancelText: '取消',
            onOk: () => {
              patch.mutate({ status: 'archived' })
              message.success('已归档')
            },
          })
        }}
      >
        归档
      </Button>
    </div>
  )
}
