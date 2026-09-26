/**
 * `@genoffice/i18n` 与渲染层 i18n 的等价替代（同步时的 REWRITES 指向这里）。
 *
 * ## 为什么替换而不是 vendor 上游实现
 *
 * 上游那套是「20 种语言 × 3 组字符串表」共 60 个文件、约 1.5 MB，外加一个
 * 198 行的 `createI18n`。mimir 是中文单用户应用，编辑器真正会**显示**的文案
 * 只有下面这些（工具栏提示、表格操作、修订提示）。把 60 个文件搬进来只为
 * 用其中 zh 的一份，不划算，而且每次同步都要重走一遍。
 *
 * ## 契约要保持一致
 *
 * vendored 代码只从 i18n 拿两样东西：
 *   - `t(key, params?)` —— 取文案
 *   - `getLang()` / `setModuleLang()` —— 当前语言（供日期、拼写等非 React 模块用）
 * 所以这里只需要把这两个口径对上。**缺的 key 直接回显 key 本身**，
 * 不编一个像样的中文——那会让「上游加了新文案而我们没补」变成静默的错译，
 * 而回显 key 在界面上是明显可见的（与项目里「不静默说谎」的规矩一致）。
 */

export type Lang = 'zh' | 'en'

/** 编辑器会用到的文案。键名沿用上游的语义分组，便于对照上游找补。 */
const STRINGS: Record<string, string> = {
  // 表格
  'table.insertRow': '插入行',
  'table.insertColumn': '插入列',
  'table.deleteRow': '删除行',
  'table.deleteColumn': '删除列',
  'table.deleteTable': '删除表格',
  'table.mergeCells': '合并单元格',
  'table.splitCell': '拆分单元格',
  // 修订与批注
  'revision.accept': '接受修订',
  'revision.reject': '拒绝修订',
  'revision.inserted': '插入',
  'revision.deleted': '删除',
  'comment.add': '添加批注',
  'comment.delete': '删除批注',
  // 编辑
  'editor.undo': '撤销',
  'editor.redo': '重做',
  'editor.cut': '剪切',
  'editor.copy': '复制',
  'editor.paste': '粘贴',
  'editor.selectAll': '全选',
  // 分页
  'pagination.page': '第 {n} 页',
  'pagination.loading': '正在排版…',
  // 图片
  'image.resize': '调整大小',
  'image.delete': '删除图片',
  'image.crop': '裁剪',
  // html 预览（D-055）：预览窗的按钮提示
  viewPreview: '预览',
}

/**
 * 当前语言。上游是模块级镜像（`setModuleLang` 在首次渲染与切换语言时写入），
 * 因为分页、编辑器扩展这些非 React 模块读不到 context。保持同样的形状。
 */
let moduleLang: Lang = 'zh'

export function getLang(): Lang {
  return moduleLang
}

export function setModuleLang(lang: Lang): void {
  moduleLang = lang
}

export function htmlLang(lang: Lang): string {
  return lang === 'zh' ? 'zh-CN' : 'en'
}

/** 参数插值：把 `{n}` 换成实际值。上游的占位符就是 `{name}` 形式 */
export function t(key: string, params?: Record<string, string | number>): string {
  const template = STRINGS[key]
  // 缺 key 时回显 key：界面上明显可见，不会被误当成「正确的翻译」
  if (template === undefined) return key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    params[name] === undefined ? whole : String(params[name]),
  )
}

/** 与上游 `createI18n` 同签名：给一个字符串表，返回取词函数 */
/**
 * React 侧的语言 hook（上游 `i18n/locale.tsx` 的 `useI18n`）。
 *
 * **不需要 Provider 也不需要 context**：mimir 只有一种语言（中文），
 * 上游的 `LocaleProvider` 是为了在 20 种语言之间切。这里直接返回当前模块语言
 * 与全局 `t`——签名与上游一致（`{ lang, t }`），所以 vendored 代码拿到的形状
 * 不变，而少一层 context 就少一处「Provider 忘了包」的静默失效
 * （那种失效的表现是文案永远显示英文默认值）。
 */
export function useI18n(): { lang: Lang; t: typeof t } {
  return { lang: moduleLang, t }
}

export function createI18n(strings: Record<string, Record<string, string>>) {
  return (key: string, params?: Record<string, string | number>): string => {
    const table = strings[moduleLang] ?? strings.zh ?? {}
    const template = table[key] ?? STRINGS[key]
    if (template === undefined) return key
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      params[name] === undefined ? whole : String(params[name]),
    )
  }
}

export type Params = Record<string, string | number>
