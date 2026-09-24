import { parseTargetFor, type ParseTarget } from '@mimir/shared'
import { decodeUploadedText } from '../lib/text.js'
import { assemble } from '../plugins/host.js'

/**
 * 「给一份文件的字节，尽力取出可读正文」——上传与重建索引共用这一步。
 *
 * ## 为什么单独一个文件
 *
 * 两处需要它，而且它们的要求不同：
 *  - **上传**：失败要变成 `parse_error` 存进库里（用户之后看得见）
 *  - **重建索引**：失败只打日志，因为原件已经在了、正文可以再试
 *
 * 但「用哪个 parser、怎么把字节喂给它」这件事**必须只有一份实现**。
 * 抄成两份的那天起，就会出现「上传时提取成功、重建后提取失败」这类
 * 取决于走哪条路径的行为差异——而它不报错。
 */

export interface ExtractResult {
  markdown: string
  /** 失败原因；`null` 表示成功或「这个格式还没有实现」 */
  error: string | null
}

/**
 * 提取正文。
 *
 * 三种结局，每一种都要能被区分（这是 `parse_error` 与 `parseSupport()`
 * 在界面上分开表达的前提）：
 *
 * | 情形 | markdown | error |
 * |---|---|---|
 * | 没有对应实现（PDF / 图片 / 压缩包…） | `''` | `null` |
 * | 试了但失败（非 UTF-8、损坏的容器…） | `''` | 原因 |
 * | 成功 | 正文 | `null` |
 */
export async function extractText(
  filename: string,
  mime: string,
  data: Uint8Array,
): Promise<ExtractResult> {
  const target = parseTargetFor(mime, filename)
  if (target === null) return { markdown: '', error: null }

  try {
    return { markdown: await runParser(target, filename, mime, data), error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // 留日志：界面只显示一句话，排查时需要完整错误与堆栈
    console.warn(`正文提取失败（${filename}）：`, error)
    return { markdown: '', error: message }
  }
}

/**
 * 按 target 调 parser 接缝。
 *
 * 文本类在这里**先解码**——这正是 `ParseInput` 判别联合的设计意图：
 * 解码会失败（GBK 编码的 txt），而那个失败必须变成一句人话，
 * 所以它发生在编排层，由 `extractText` 统一变成 `parse_error`。
 *
 * 字节类（docx / xlsx / pptx）不需要解码：它们是 ZIP 容器，
 * 由各自的实现自己去读。
 */
async function runParser(
  target: ParseTarget,
  filename: string,
  mime: string,
  data: Uint8Array,
): Promise<string> {
  const { seams } = assemble()
  const found = seams.parser.implementations().find(({ impl }) => impl.accepts.includes(target))

  if (!found) {
    // 有 target 声明却没有实现 = 装配与契约不一致。这是**代码缺陷**，
    // 必须抛出来（而不是静默当作「没有提取」），否则会一直不被发现
    throw new Error(`没有注册能处理 ${target} 的解析器（${mime}）。检查 plugins/parser/ 的注册`)
  }

  const input =
    target === 'docx' || target === 'xlsx' || target === 'pptx'
      ? ({ type: target, data, filename } as const)
      : ({ type: target, content: decodeUploadedText(data) } as const)

  const parsed = await found.impl.parse(input)
  return parsed.markdown
}
