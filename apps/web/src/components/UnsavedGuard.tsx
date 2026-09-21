import { Modal } from 'antd'
import { useUnsaved } from '@/lib/unsaved'

/**
 * 未保存内容的拦截框。
 *
 * `docs/PRD.md` §5.9：给**三个**选项，而不是两个。
 * 「继续编辑 / 丢弃改动 / 保存并离开」——两选项（留下 / 丢弃）把这个场景
 * 变成二选一的拷问，而用户真正想要的往往是第三种。
 *
 * 用 antd 的 Modal（声明式）而不是 Modal.confirm（命令式）：这里的状态由
 * UnsavedProvider 持有，声明式渲染才能让「保存中」这类中间态真实反映出来，
 * 也才能让「保存失败时不放行」这个分支自然表达出来。
 */
export function UnsavedGuard() {
  const { pending, resolve } = useUnsaved()

  return (
    <Modal
      open={Boolean(pending)}
      title="有改动还没保存"
      closable={false}
      maskClosable={false}
      keyboard={false}
      onCancel={() => resolve('cancel')}
      footer={[
        <button key="cancel" type="button" className="ant-btn" onClick={() => resolve('cancel')}>
          继续编辑
        </button>,
        <button key="discard" type="button" className="ant-btn" onClick={() => resolve('discard')}>
          丢弃改动
        </button>,
        <button
          key="save"
          type="button"
          className="ant-btn ant-btn-primary"
          onClick={() => resolve('save')}
        >
          保存并离开
        </button>,
      ]}
    >
      <p style={{ margin: 0, lineHeight: 1.75 }}>离开会丢失这次的修改。可以先把内容存下来再走。</p>
      <p style={{ margin: '8px 0 0', fontSize: 12, color: '#68707c', lineHeight: 1.75 }}>
        保存失败时不会放行——否则你以为存上了，实际丢了。
      </p>
    </Modal>
  )
}
