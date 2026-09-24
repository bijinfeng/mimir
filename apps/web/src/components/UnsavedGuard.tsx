import { Button, Modal } from 'antd'
import { createStyles } from 'antd-style'
import { useUnsaved } from '@/lib/unsaved'
import { FONT_SIZE } from '@/theme/tokens'

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

/**
 * 说明文字。
 *
 * 副标题那一行原先写在 JSX 的内联 style 里：颜色是字面量 `#68707c`，
 * 字号写成一个裸数字。两处都绕开了守卫——字号阶梯的扫描器只认
 * CSS 里的像素写法，而 JSX 里的颜色也躲过了「页面里不写字面量颜色」。
 * 深色下这处漏网就露出来了：`#68707c` 压在深底上几乎看不见。
 *
 * 顺带把 `className="ant-btn"` 换成 antd 的 `Button`：手写前缀在
 * antd 换 prefixCls 时会整组失效（`apps/web/AGENTS.md` 样式第 7 条），
 * 而这里是在 JSX 里，`${prefixCls}` 根本拿不到。
 */
const useStyles = createStyles(({ css, token }) => ({
  body: css`
    margin: 0;
    line-height: 1.75;
    color: ${token.colorText};
  `,
  hint: css`
    margin: 8px 0 0;
    font-size: ${FONT_SIZE.badge}px;
    line-height: 1.75;
    color: ${token.colorTextTertiary};
  `,
}))

export function UnsavedGuard() {
  const { pending, resolve } = useUnsaved()
  const { styles } = useStyles()

  return (
    <Modal
      open={Boolean(pending)}
      title="有改动还没保存"
      closable={false}
      maskClosable={false}
      keyboard={false}
      onCancel={() => resolve('cancel')}
      footer={[
        <Button key="cancel" onClick={() => resolve('cancel')}>
          继续编辑
        </Button>,
        <Button key="discard" onClick={() => resolve('discard')}>
          丢弃改动
        </Button>,
        <Button key="save" type="primary" onClick={() => resolve('save')}>
          保存并离开
        </Button>,
      ]}
    >
      <p className={styles.body}>离开会丢失这次的修改。可以先把内容存下来再走。</p>
      <p className={styles.hint}>保存失败时不会放行——否则你以为存上了，实际丢了。</p>
    </Modal>
  )
}
