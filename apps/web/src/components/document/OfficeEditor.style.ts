import { createStyles } from 'antd-style'

/**
 * Office 编辑器的容器样式。
 *
 * ## 为什么需要这一层
 *
 * vendored 的编辑器样式（`@mimir/office/editor.css`）里，纸张底色与页间隙
 * 灰带读的是两个**由上游 App 壳在运行时注入**的自定义属性（`--canvas`、
 * `--docs-paper`）——我们没 vendored 那个壳，所以它们在浏览器里解析成空值。
 * 症状很隐蔽：**分页本身完全正常**（页数对、页间隙高度对），但灰带画成了
 * 透明——看上去就是「页面之间什么都没有」。
 *
 * 这里用 mimir 自己的 token 把它们补上。这比复刻上游的注入逻辑更对：
 * 纸与工作台的颜色本来就该跟界面主题一致，而不是各写一套。
 */
export const useStyles = createStyles(({ css, token }) => ({
  scroll: css`
    overflow-y: auto;
    max-height: 78vh;

    /* 页间隙的灰带：上游用它画「两张纸之间的工作台」 */
    --canvas: ${token.colorBgLayout};
    /* 纸张底色：跟着容器底走（深色主题下纸也是深的） */
    --docs-paper: ${token.colorBgContainer};
  `,
}))
