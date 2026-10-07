import { Square } from 'lucide-react'
import { useChatPanelStyles } from '../ChatPanel.style.js'

/**
 * 「已停止生成」那一行。
 *
 * ## 判据从自维护的 state 变成消息状态
 *
 * 旧实现里「这一轮被用户停过」是 `use-mimir-chat.ts` 自己记的一个布尔
 * （`stopped`），因为当时的 SDK 把「停止」与「正常结束」在状态机上都落到
 * `ready`，界面上要区分就得自己记。
 *
 * 现在引擎把停止表达成**消息状态**：`applyUpdate({ status: { type:
 * 'incomplete', reason: 'cancelled' } })`（AgUiThreadRuntimeCore 的 `cancelRun`）。
 * 所以这一行挂在「这条助手消息的状态是 incomplete + cancelled」上——
 * 它跟着消息走，不需要任何旁路状态。
 *
 * ## 不抄 Continue / Discard
 *
 * 上游的 `StoppedRun` 给两个按钮：「继续生成」与「放弃」。**服务端没有
 * 可续跑的 run 记录**（流式回答不落 run 状态，只有一条最终消息），
 * 「从半截继续」没有后端支撑，那对按钮会变成空壳。
 *
 * 出路本仓已经有了，而且更具体：失败卡上的「重试 / 只检索」、以及
 * 输入框里那两条（把问题放回输入框、直接再问）。这里只交代
 * 「为什么停在这里」。
 *
 * 文案与用色都不变：写成正文色而不是警示色——停止是用户主动做的，
 * 不是错误（DESIGN §3.4 的语义色只给偏离常态的状态）。
 */
export function StoppedNotice() {
  const { styles } = useChatPanelStyles()

  return (
    <div className={styles.stopped}>
      {/* 官方 StoppedRun 的 reason pill：mono 药丸装「为什么停在这里」 */}
      <span className={styles.stoppedPill}>
        <Square size={10} fill="currentColor" aria-hidden />
        已停止生成
      </span>
      <span className={styles.stoppedNote}>以上是已生成的部分</span>
    </div>
  )
}
