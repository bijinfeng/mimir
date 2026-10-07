import type { ReasoningMessagePartProps } from '@assistant-ui/react'
import { useState } from 'react'
import {
  LiveSeconds,
  ReasoningContent,
  ReasoningRoot,
  ReasoningTrigger,
  useReasoningKeyframes,
} from './reasoning-shell.js'
import { MarkdownPart } from './MarkdownPart.js'

/**
 * **模型思考**（`reasoning` part）——官方 Reasoning 形态，与检索过程共用
 * `reasoning-shell.tsx` 的皮（用户点名「AG-UI 的消息体类型每一种都按
 * assistant-ui 还原」，这是此前静默丢弃的一类）。
 *
 * ## 它什么时候出现
 *
 * 深思考（`deepReasoning`）时模型流里带 `REASONING_*` 帧；运行时默认
 * `showThinking: false` 会把它们**藏掉**，只有打开后才聚成 reasoning part
 * （`runtime/use-mimir-runtime.ts` 的 `showThinking: true`）。开着而不渲染
 * 等于白开——所以这一件与那个开关必须同批。
 *
 * ## 与检索过程的分工
 *
 * 「思考 N 轮 · 调用 M 次工具」那条是**知识库这一侧**的过程（检索、切词、
 * 命中），label 与 `mimir.trace` 绑定；这一件是**模型那一侧**的思考原文。
 * 两者同一个皮、两个标签，先后由消息里的 part 顺序决定（服务端的帧序是
 * 先 trace 后模型输出）。官方也把它们画成同一种「Reasoning」盒——
 * 用户在视觉上读到的都是「一段可折叠的思考」。
 *
 * ## 与 trace 的差异
 *
 * 模型思考**没有**服务端的轮数 / 工具数 / 总耗时，只有 part 自己的状态
 * （`status.type` 为 running 表示还在流）。所以：
 *  - 标签用「模型思考 (Ns)」，秒数在 live 时走客户端的钟
 *  - 结束后不编耗时——拿不到就只留标签（编的数字比没有更糟）
 */
export function ReasoningPart({ text, status }: ReasoningMessagePartProps) {
  const { styles: kf } = useReasoningKeyframes()

  const live = status?.type === 'running'
  const [open, setOpen] = useState(live)
  const [followedLive, setFollowedLive] = useState(live)
  if (followedLive !== live) {
    setFollowedLive(live)
    setOpen(live)
  }

  if (text.trim().length === 0 && !live) return null

  return (
    <div className={kf.hold}>
      <ReasoningRoot>
        <ReasoningTrigger live={live} open={open} onClick={() => setOpen((value) => !value)}>
          <span>
            模型思考
            {live ? (
              <>
                {' ('}
                <LiveSeconds />
                {')'}
              </>
            ) : null}
          </span>
        </ReasoningTrigger>
        {open && (
          <ReasoningContent>
            {/* 思考原文可能含 markdown（模型的 reasoning 常带列表/代码） */}
            <MarkdownPart text={text} />
          </ReasoningContent>
        )}
      </ReasoningRoot>
    </div>
  )
}
