/**
 * markdown 方言的类型入口。
 *
 * ## 为什么要单独一个文件
 *
 * `MarkdownEditor` 用到的两样东西——`contentType: 'markdown'` 与
 * `editor.getMarkdown()`——**不是 `@tiptap/core` 的**，而是 `@tiptap/markdown`
 * 通过模块增强（`declare module '@tiptap/core'`）加进来的。
 *
 * 而这个包的 `MarkdownEditor` **不注册任何扩展**：方言由宿主注入
 * （`createExtensions`），因为「笔记的正文格式是什么」是 mimir 的产品决定，
 * 不是这个包的。于是类型必须从那个包引一次，否则上面两处会报
 * 「不存在这个属性」——而**照抄一份声明**又是在说谎：上游改了字段名，
 * 手抄的那份不会跟着改。
 *
 * 导入一个**真的用到的**类型（而不是 `import type {} from …`）：空 import
 * 块在 lint 里是错的，而且它不表达任何意图。这里用 `MarkdownManager` 做一次
 * 结构断言，既触发了模块增强，又把「宿主必须注册它」这条要求写进了类型里。
 *
 * ## 运行时要求（不是可选的）
 *
 * 宿主**必须**在扩展列表里注册 `@tiptap/markdown` 的 `Markdown`。不注册时：
 *
 *   - `contentType: 'markdown'` 被忽略 → ProseMirror 按 HTML 解析 markdown
 *     文本，**整篇笔记渲染成一行纯文本**（含源码里的 `#` 与 `*`）
 *   - `getMarkdown()` 不存在 → 保存时抛错
 *
 * 两条都不报编译错，所以这句写在这里而不是靠人记得。
 * `apps/web/src/editor/extensions.ts` 是唯一的注册点。
 */

import type { MarkdownManager } from '@tiptap/markdown'

/**
 * 编译期断言：`Editor.markdown` 这个属性来自 `@tiptap/markdown` 的增强。
 *
 * 它不是运行时检查（那个交给上面那两条注释与宿主的扩展列表），作用是**让这个
 * 导入不可被摇掉**——去掉它，打包器可能不引那个模块，增强也就没了。
 */
export type MarkdownAwareEditor = { markdown?: MarkdownManager }
