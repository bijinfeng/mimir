import { Segmented } from 'antd'
import { Note, Panel, Row } from './parts'
import { useStyles } from './settings.style'
import {
  THEME_MODE_LABELS,
  THEME_MODES,
  useThemeMode,
  type ThemeMode,
} from '../../theme/appearance'

/**
 * 外观分区：浅色 / 深色 / 跟随系统。
 *
 * ## 为什么这一项**不在**设置键表里
 *
 * 设置页的每一行通常对应 `CORE_SETTING_SPECS` 里的一个键（`docs/TECH.md` §7.5），
 * 那一层管的是「服务端读取的配置」。外观不是：它是**纯客户端的渲染偏好**，
 * 服务端一个字节都不需要知道，也没有任何服务端逻辑会读它。
 *
 * 放进键表会撑开那条闭集，并带来三件坏事：多一条没有任何代码读的假键、
 * 首帧要等一次请求才知道该用哪套色（闪一下）、同一台机器上两个浏览器的
 * 偏好互相覆盖。
 *
 * 代价如实写在界面上：**它只存在这台设备的这个浏览器里**，
 * 换设备要重选。这与左栏折叠是同一个判断（`routes/_app.tsx`）。
 *
 * ## 为什么用 `Segmented` 而不是开关
 *
 * 三个选项（跟随 / 浅 / 深）是**并列互斥**的，不是「开与关」。
 * 用 Switch 表达不了「跟随系统」这个第三态——而它恰恰是默认值，
 * 也是最省心的那个选项。
 *
 * ## 没有「来源」徽标
 *
 * 设置页其它行都标来源（界面 / 环境变量 / 默认），因为那些值可能被部署配置
 * 压住。这里没有第二处真相：**界面显示的就是实际生效的**。
 * 所以这一行不挂 `SourceBadge`——挂了反而会让人以为有个环境变量能覆盖它。
 */
export function AppearanceSection() {
  const { styles } = useStyles()
  const { mode, setMode } = useThemeMode()

  return (
    <>
      <Panel title="外观">
        <Row label="颜色模式">
          <div className={styles.actions}>
            <Segmented<ThemeMode>
              value={mode}
              onChange={(next) => setMode(next)}
              options={THEME_MODES.map((value) => ({
                value,
                label: THEME_MODE_LABELS[value],
              }))}
              aria-label="界面外观"
            />
          </div>
        </Row>
      </Panel>

      <Note>
        存在<span className={styles.strong}>当前浏览器</span>里，换设备要重选。
      </Note>
    </>
  )
}
