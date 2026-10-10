import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { documents, folders } from '../db/schema.js'
import { assemble } from '../plugins/host.js'
import { createNote } from './documents.js'
import { createFolder } from './folders.js'

/**
 * 首次建号时播种的默认内容（一个知识库 + 一份产品说明）。
 *
 * ## 为什么要有它
 *
 * 全新的库是空的：侧边栏没有知识库、主区只有一句「先创建一个知识库」。
 * 对第一次打开的人（包括部署完自己试用的那一刻），空屏不解释
 * 「这东西是干什么的、我第一步该做什么」——而这份说明正好也演示了
 * 「一条笔记长什么样」：它有标题、有分节、正文是 Markdown、
 * 能被搜索、能被 AI 引用、能随时改和删。
 *
 * 这比在界面上做一段引导浮层好：浮层是**要关掉才能继续的东西**，
 * 而一篇真文档本身就是可以留下、可以改、可以被搜到的资产。
 *
 * ## 触发点：一个持久标记，两个入口都查它
 *
 * 播种必须**只发生一次**，而「一次」这件事不能靠「库是空的」来判断——
 * 用户把默认知识库删掉是明确的意思表示，重启后它不该回来。
 *
 * 所以判据是设置表里的一行（`seed.defaultContent`，见 core 键表）：
 * 播过就记上，之后任何入口都不再播。两个入口都调 `seedDefaultLibrary()`：
 *
 * | 入口 | 覆盖的场景 |
 * |---|---|
 * | `auth.ts` 的 `user.create.after` | 新装环境（两条建号路径共用一个钩子） |
 * | `boot.ts` | **已有实例**——它们在这次改动之前就建过号，不会再经过钩子 |
 *
 * 两个入口都过了标记这一关，所以全新环境不会播两遍；而「用户删掉了
 * 默认内容」在两边都被标记挡住。
 *
 * **测试环境由两个入口各自跳过**（这里不跳）：集成测试有自己的账号与库
 * 准备流程，而它们到处是「库里有几篇文档」这类断言——自动多出两行会让
 * 它们以难以定位的方式失败。把「要不要跑」的判断留在触发点，这个函数
 * 本身就可以被测试直接调用（`seed.test.ts` 正是这么做的）。
 *
 * ## 幂等 + 半成品可修
 *
 * 内容与标记**分开判断**（按目标路径与标题查重，缺什么补什么）：
 * 播种到一半失败时标记还没写，下次会来补齐；而已经建好的那半不会被重复创建。
 * 顺序是「先内容、后标记」——反过来的话，一次中断就会留下
 * 「标记说播过了、内容却没有」的永久缺口。
 */

/** 默认知识库的名称（同时是 `folders.path`——目录没有 id，路径就是身份） */
const LIBRARY_PATH = '开始使用'

/** 默认知识库的描述。侧栏卡片与库页头部显示它 */
const LIBRARY_DESCRIPTION = '从这里熟悉笔记、收集与搜索。'

/** 图标键取自 shared 的 `FOLDER_ICONS`（服务端只存键，渲染在界面层） */
const LIBRARY_ICON = 'computer'

/** 产品说明的标题。查重与界面显示都用它 */
const PRODUCT_DOC_TITLE = 'mimir 产品说明'

/** 播种标记的版本。将来换一套默认内容时递增它，老实例就会收到新的一套 */
const SEED_VERSION = 1

export interface SeedResult {
  /** 新建了默认知识库 */
  libraryCreated: boolean
  /** 新建了产品说明 */
  documentCreated: boolean
  /** 之前已经播过（或测试环境），这次什么都没做 */
  skipped: boolean
}

/**
 * 播种默认内容。返回实际创建了什么（调用方据此决定要不要留日志）。
 *
 * 写入走**与用户操作完全相同的那条路**（`createFolder` / `createNote`）——
 * 于是它自动满足铁律 2（先文件后数据库：`createNote` 内部先 `writeNote`
 * 再插行）、自动分块与建索引、frontmatter 与目录指派一个不漏。
 * 直接往表里插一行会绕过这四件事，得到的是一份「看着在、搜不到」的说明。
 */
export async function seedDefaultLibrary(): Promise<SeedResult> {
  const { settings } = assemble()
  if ((await settings.getNumber('seed.defaultContent')) >= SEED_VERSION) {
    return { libraryCreated: false, documentCreated: false, skipped: true }
  }

  const [existingLibrary] = await db
    .select({ path: folders.path })
    .from(folders)
    .where(eq(folders.path, LIBRARY_PATH))

  let libraryCreated = false
  if (!existingLibrary) {
    await createFolder({
      path: LIBRARY_PATH,
      description: LIBRARY_DESCRIPTION,
      icon: LIBRARY_ICON,
    })
    libraryCreated = true
  }

  /**
   * 查重的判据是「这个知识库里有没有同名笔记」，不是「库里有没有笔记」——
   * 用户可能已经在里面写了自己的东西，那些不该影响播种。
   */
  const [existingDoc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.folder, LIBRARY_PATH),
        eq(documents.title, PRODUCT_DOC_TITLE),
        eq(documents.kind, 'note'),
      ),
    )
    .limit(1)

  let documentCreated = false
  if (!existingDoc) {
    await createNote({
      title: PRODUCT_DOC_TITLE,
      body: PRODUCT_DOC_BODY,
      tags: [],
      folder: LIBRARY_PATH,
    })
    documentCreated = true
  }

  /**
   * 内容写完了才记标记——见文件头的「先内容、后标记」。
   *
   * **必须检查写入结果**：`update()` 对未注册的键与校验失败都是
   * 「返回 issues、不写」。不检查的话，标记没落库而函数照常返回成功——
   * 症状是每次重启都重播一次（内容查重挡住了重复，所以更要命的是
   * **用户删掉默认内容之后它会再回来**，而那正是标记存在的理由）。
   *
   * 这条实测踩过：开发中的实例热重载时装配层还拿着旧的键表，
   * 写入被静默拒绝，`data/mimir.db` 里内容在、标记不在。
   */
  const written = await settings.update({ 'seed.defaultContent': SEED_VERSION })
  if (!written.ok) {
    const detail = written.issues.map((issue) => `${issue.key}: ${issue.message}`).join('；')
    throw new Error(`记录播种标记失败（下次启动会重播一次）：${detail}`)
  }

  return { libraryCreated, documentCreated, skipped: false }
}

/**
 * 新用户会直接读到这篇笔记，所以只介绍可执行的操作与真实限制。
 * 它仍是一篇普通 Markdown 笔记，可搜索、引用、编辑或删除。
 */
export const PRODUCT_DOC_BODY = `mimir 是你的知识工作区。写笔记、收集资料，再从自己的内容里搜索和提问。

## 从这里开始

1. **写一篇笔记**：在知识库中点“新建文件”，直接开始写。
2. **收集资料**：点“添加文档”上传文件或粘贴网页链接。PDF、Word、Excel、PowerPoint 等文件都可以保留原件。
3. **找回内容**：点左侧搜索，或按 Ctrl K，输入记得的词语。
4. **围绕资料提问**：打开对话，选择范围后提问。回答下方的引用可以跳回原文。

## 整理与编辑

用知识库和文件夹整理内容，也可以给文档加标签。笔记可直接编辑；上传的原件可以预览和下载。Word、Excel、PowerPoint 等格式会在上方显示工具区，编辑后记得查看保存状态。

打开一篇文档后，点“询问这篇文档”可以只围绕它提问。选中一段文字，再点“就这段提问”，问题会更具体。

## 搜索与模型

普通搜索无需配置模型。需要按意思查找相近内容时，可以到“设置 › 模型”配置语义搜索模型，再到“设置 › 检索”补全搜索内容。“测试搜索”可帮助你检查结果。

没有配置对话模型时，提问仍会列出找到的原文；配置后可获得带引用的回答。若没有相关内容，mimir 会直接说明。

## 数据与备份

上传文件会保留原件。在“设置 › 数据与备份”可以导出文档与附件，也可以导出完整记录。导出文件不能单独代替完整备份，请按页面提示保存所需数据。

这篇说明也是一篇普通笔记。熟悉之后，可以编辑、移动或删除它。
`
