import { createStyles } from 'antd-style'

/**
 * 任务弹窗的统一落点：桌面 56px，窄屏 36px，手机 24px。
 *
 * 只负责 `.ant-modal` 的顶部位置与最大宽度；业务弹窗仍各自决定容器、
 * 正文滚动与页脚。这样不同的表单不会因为谁先写而漂到两套高度。
 */
export const useDialogRootGeometry = createStyles(({ css, prefixCls }) => ({
  root: css`
    && .${prefixCls}-modal {
      top: 56px;
      max-width: calc(100vw - 32px);
    }
    @media (max-width: 700px) {
      && .${prefixCls}-modal {
        top: 36px;
      }
    }
    @media (max-width: 480px) {
      && .${prefixCls}-modal {
        top: 24px;
        max-width: calc(100vw - 20px);
      }
    }
  `,
}))
