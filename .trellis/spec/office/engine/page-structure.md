# PDF/PPTX 页结构与缩略图契约

## 1. Scope / Trigger

改 `packages/office/src/pptx.ts`、`pptx-structure.ts`、`pptx-save.ts` 的页操作或 `editors/pdf-render.ts` 的多画布渲染时使用本契约。PPTX 保存是 OOXML 包部件补丁；未触及的主题、母版、媒体和其他幻灯片必须保留原条目。PDF 的主画布与缩略图共用 pdf.js 文档，但各自的画布渲染不能互相取消。

## 2. Signatures

```ts
openPptxForEdit(bytes: Uint8Array): Promise<PptxEditSession>
interface PptxEditSession {
  slides(): readonly Slide[]
  view(): PptxRenderable
  insertBlank(afterIndex: number): number
  duplicate(index: number): number
  remove(index: number): number
  move(fromIndex: number, toIndex: number): number
  hasChanges(): boolean
  save(): Promise<Uint8Array>
  commit(): void
}
cancelPdfRender(canvas: HTMLCanvasElement | null): void
renderPdfPages(options: RenderPdfOptions): Promise<PdfRenderHandle | null>
```

PPTX 四个页操作以零起始索引接收位置，返回操作后应选中的索引；`move` 的目标是最终数组索引。缩略图从同一会话的 `view()` 与 `slides()` 取内容和顺序，不另存一份顺序。PDF 的 `PdfPageRef[]` 是页序与来源的唯一状态，原件、导入件、空白页、旋转均由该模型驱动。

## 3. Contracts

- 新增插在指定页之后，使用同一演示文稿尺寸和现有可用版式；复制插在来源页之后，继承来源页当前未保存的文字编辑与幻灯片关系。新页的 XML/关系条目独立，媒体等只读资源可共享。
- `remove` 至少保留一页；`move` 只改变顺序。页操作使 `view()` 快照失效并进入 `hasChanges()`；已有文字/格式编辑也照旧计入。
- `save()` 仅生成字节，不清空 dirty；宿主成功写回后才调用 `commit()`。`commit()` 将结构补丁、已保存 XML 和元素锚点同步为新基线，后续保存不得回滚前一次结果。
- 结构补丁只修改必要的 `ppt/presentation.xml`、演示文稿关系、`[Content_Types].xml` 及新增或删除的 slide XML/rels；调序只改幻灯片列表。保留未修改条目字节。
- PDF `renderPdfPages` 对每个 canvas 独立管理渲染代次；同一 canvas 的旧渲染可取消，另一缩略图或主画布不可因此取消。渲染 worker 使用输入字节副本，不能 transfer 掉保存所需原字节。

## 4. Validation & Error Matrix

| 条件 | 行为 |
| --- | --- |
| 索引不是当前有效页 | `PptxEditSession` 抛出“幻灯片序号无效” |
| 删除唯一一页 | 抛出“至少保留一张幻灯片”；界面禁用删除 |
| 无可用版式的新增 | 抛出明确错误，当前文档不变 |
| 自定义放映、分节引用页序 | 拒绝结构调整，避免悬空引用 |
| 含备注、批注的页被复制或删除 | 拒绝，避免复用独占反向引用 |
| 其他部件引用待删除页 | 拒绝删除，不遗留断链 |
| 幻灯片列表、关系或内容类型不完整 | 拒绝保存，不输出部分包 |
| 分配新 slide 路径时有孤立的同名 `.rels` 条目 | 跳过该编号，不覆盖孤立条目 |
| `commit()` 未先成功 `save()` | 抛出明确错误 |

## 5. Good / Base / Bad Cases

- Good：含图片页先改文字再复制、调序、保存、重新打开；两页内容与图片均可渲染，第二次保存不回滚。
- Base：仅移动两页；原 slide XML、主题、母版和媒体条目保持原字节。
- Bad：带备注或自定义放映的页尝试不安全结构操作；明确拒绝且 `slides()` 顺序不变。

## 6. Tests Required

- `src/pptx-structure.test.ts`：读回页数、顺序、图片关系、连续保存，并比较无关 zip 条目；覆盖 `r:id` 与 `id` 属性顺序、非自闭合关系标签、孤立同名 `.rels` 不被覆盖。
- `src/editors/pdf-render.test.ts`：主画布与多个缩略图并发渲染可同时完成；只取消同一 canvas 的旧代次。
- `src/editors/pdf-pages.test.ts`：复制同一来源页、导入页及空白页后读回独立页，旋转和顺序一致。
- `src/editors/PptxEditor.test.tsx` 与 PDF 编辑器测试：操作后页码、缩略图和保存状态一致；右键菜单与键盘菜单入口可用。

## 7. Wrong vs Correct

```ts
// Wrong: save() 生成字节时就清除 dirty，写回失败或下次保存会丢失状态。
const bytes = await session.save()
session.commit()
await io.save(bytes)

// Correct: 写回成功以后才提交新基线。
const bytes = await session.save()
await io.save(bytes)
session.commit()
```

PDF 画布也一样：不要用模块级单一代次控制所有画布；以 canvas 为键管理代次，主画布和多个缩略图才能并发完成。

解析 OOXML 属性时按完整属性名匹配，例如 `id` 不得误读前面的 `r:id`；关系安全检查同时识别自闭合与带结束标签的 `<Relationship>`。这两种合法输入都出现在现有文件中。
