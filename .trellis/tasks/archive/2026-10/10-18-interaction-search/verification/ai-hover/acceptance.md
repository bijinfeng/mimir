# AI 区图文与 hover 验收

产品变更仅限 command-palette/styles.ts。根因、处理与独立检查见 implement.md / check.md。

| 实测场景 | default → hover → leave | 图标/文字中心差 |
|---|---|---|
| 桌面浅色 | 所有矩形不变 | 约0.008px |
| 桌面深色 | 所有矩形不变 | 约0.008px |
| 390×844浅色 | 所有矩形不变，按钮高44px | 0px |
| 390×844深色 | 所有矩形不变，按钮高44px | 0px |

另实测桌面active无尺寸变化，键盘focus-visible有2px描边且无尺寸变化。disabled仅完成组件既有回归与级联审查，未实际GUI采样；OS输入法、触屏未验。

状态数据见同名JSON；修复前按钮hover增宽增高各2px，修复后为0。narrow-dark.json在视口切换和弹窗动画稳定后重新采样，未采用动画中的提前采样。截图均来自实际QA产品页面。测试外观已还原浅色，视口覆盖已reset。

定向lint/format、样式守卫、AntD lint、Renderer类型检查、15项Palette测试均通过，独立检查无问题。全仓pnpm check退出1：其他小程序任务7项lint错误，流水线后续阶段未执行，详见global-check.txt。不扩展修改其他会话工作，不推送，不归档。
