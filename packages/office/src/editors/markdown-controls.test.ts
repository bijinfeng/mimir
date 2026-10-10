/**
 * markdown 编辑器的**控件契约**（静态守护）。
 *
 * ## 为什么这一组是读源码文本、而不是挂组件
 *
 * 因为**方言在宿主那边**（`packages/renderer/src/editor/extensions.ts`）。挂一棵真树要
 * 一套真扩展，而这个包不依赖 `@tiptap/starter-kit`；拿一组临时凑的扩展挂出来
 * 测的就是**另一个编辑器**。所以渲染层的契约在宿主
 * （`packages/renderer/src/editor/MarkdownEditor.test.tsx` 的「控件契约」一节：按 antd 的
 * 类名数控件、量 small 档、禁用给原因、状态行的可点文字），这里只守**这个文件
 * 里有没有人手写原生控件**——那一条不需要方言，而且正是会静默退回去的那一条。
 *
 * ## 守的是什么
 *
 * 另外五种格式各有一组同名的契约（`pdf-toolbar-render.test.tsx` 的「静态守护」、
 * `PptxEditor.test.tsx` / `XlsxEditor.test.tsx` / `HtmlEditor.test.tsx` 的「控件
 * 契约」），markdown 原先是唯一没有的——而它恰好是 D-064 里最后两个绕过点的
 * 所在（状态行那两个裸 `<button className="me-status-action">`，现在走
 * `ToolbarTextButton`）。没有断言的「已经换好了」会在下一次改动里静默退回去：
 * 多一个裸 `<button>` 不报错、类型也过，只是那一排从此有两种高度、两种焦点环，
 * 而深浅主题管不到它（D-042 记的就是这个）。
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = import.meta.dirname

/**
 * 属于 markdown 这条路的界面文件。
 *
 * `InlineToolbar.tsx` 一起扫：它是同一棵子树里的第二个工具条（选区浮出的那个），
 * 而「工具条」这个词在这个格式下指两处。
 */
const SOURCES = ['MarkdownEditor.tsx', 'InlineToolbar.tsx'] as const

/** 剥掉注释再扫：文档里的一句示例（比如这一段）不该把守护弄红 */
function sourceOf(file: string): string {
  return readFileSync(join(HERE, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('markdown 的控件契约（静态守护）', () => {
  it('没有手写的 button / input / select / textarea', () => {
    for (const file of SOURCES) {
      const hits = sourceOf(file).match(/<(button|input|select|textarea)[\s>/]/g) ?? []
      expect(hits, `${file} 里还有原生控件：${hits.join(' ')}`).toEqual([])
    }
  })

  it('不直接 import antd：控件只经过外壳的原语', () => {
    /*
     * 直接 import 会把三条约定各绕开一处——尺寸档（那层 `ConfigProvider` 只盖
     * 到经过原语的控件）、按下时 `preventDefault`、禁用给原因——而绕开之后
     * 界面看着没问题。
     */
    for (const file of SOURCES) {
      expect(sourceOf(file), `${file} 直接 import 了 antd`).not.toMatch(/from\s+'antd'/)
    }
  })

  it('不把 `.me-btn` 挂到控件上（它会把 small 档的高度与实心底色压掉）', () => {
    /*
     * `.me-btn` 的 `height` 与 antd 的 `:where(...).ant-btn-sm` 特异性相同（都是
     * (0,1,0)）而 `shell.css` 在 head 里更靠后，挂上就把 24px 拉成
     * `--me-control-height` 之外的值（实测 28px）；它的 `background: transparent`
     * 还会压过实心的「立即保存」。它现在只服务两个未迁移的弹层触发器
     * （`ToolbarMenu` / `ToolbarColorPicker`，都在 `EditorShell.tsx` 里）。
     */
    for (const file of SOURCES) {
      expect(sourceOf(file), `${file} 把 .me-btn 挂到了控件上`).not.toMatch(
        /className="[^"]*\bme-btn\b/,
      )
    }
  })

  it('状态行里那两处可点文字走 `ToolbarTextButton`，且旧样式类已经不在了', () => {
    /*
     * 两处是「保存失败：… · 点此重试」与「… · 点此关闭」。它们原来是裸
     * `<button className="me-status-action">`：一句**带动作**的话，而外壳原先
     * 只有「只说明不带动作」（`ToolbarNotice`）与「24px 的方框」
     * （`ToolbarButton`）两档——状态行里放方框会把那一行看成第二条工具条。
     *
     * 后半条是跨文件的：`.me-status-action` 的规则整块删掉了。留一个没有消费者
     * 的类名是个陷阱——下一个人会以为状态行的可点文字还归 `editors.css` 管，
     * 然后在那里改样式、改不动。
     */
    const editor = sourceOf('MarkdownEditor.tsx')
    expect(editor).toMatch(/<ToolbarTextButton/)
    expect(editor).toMatch(/点此重试/)
    expect(editor).toMatch(/点此关闭/)

    const css = readFileSync(join(HERE, 'editors.css'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(css, 'editors.css 里又出现了 .me-status-action 的规则').not.toMatch(/\.me-status-action/)
  })

  /**
   * 工具条上**要有分组分隔线**。
   *
   * 八到十个组的间隔与组内按钮的间隔在 CSS 里是同一个值（`.mimir-editor__bar`
   * 与 `.me-group` 的 `gap` 都是 2px），所以不画线时整条读成一个没有结构的
   * 图标带——「插入表格」与「加粗」的扫描成本一样。实测笔记这条栏的 7 个组间
   * 间隔全是 2px、栏内一条竖线都没有，而同壳的另外五种格式都有（docx 5 条、
   * xlsx 3、pptx 2、html 3、pdf 3）。
   *
   * 判据只能读源码文本：这条工具条要真挂起来得有宿主的方言扩展（见文件头），
   * 而「组边界上有没有 `ToolbarDivider`」不需要方言就能问。同时钉住**数量**：
   * 一条都不许少（回到图标带）、也不许每两个按钮插一条（`ToolbarDivider` 的
   * 说明：工具条是 flex-wrap 的，分隔线的位置是兄弟 flex 项，插密了会在换行
   * 时落到行末/行首）。
   */
  it('组与组之间有 `ToolbarDivider`（八到十个组读得出边界）', () => {
    const editor = sourceOf('MarkdownEditor.tsx')
    const dividers = editor.match(/<ToolbarDivider\s*\/>/g) ?? []
    const groups = editor.match(/<ToolbarGroup\b/g) ?? []
    expect(groups.length, '这条工具条的组数掉下来了（断言会失去意义）').toBeGreaterThanOrEqual(8)
    expect(
      dividers.length,
      '组边界的分隔线一条都不许少——没有它整条就是一个没有结构的图标带',
    ).toBeGreaterThanOrEqual(4)
    expect(dividers.length, '分隔线比组还多：别每两个按钮插一条').toBeLessThan(groups.length)
    expect(editor).toContain('ToolbarDivider,')
  })
})
