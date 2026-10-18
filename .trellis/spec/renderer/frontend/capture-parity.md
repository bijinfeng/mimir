# 收集与导入的批准稿及状态合同

适用 `CaptureDialog`、`UploadPanel`、知识库整页拖放与 AppShell 的收集结果交接。

## 冻结视觉来源

用户于2026-10-18认可 `10-18-interaction-capture/prototype/` 的capture-review-v1 revision2；`review.html` SHA256为 `fa66bdc5e0ed6a4c7d1383342b7e554754b9f88ce69db162a56fc947b93061e1`。`main.tsx`、`review.css`与`coverage.json`是具体视觉/路径依据，禁止修改原型来掩盖产品偏差。9组91项是覆盖项，不是91个真实页面。

批准稿明确的局部字号与浅深角色在 `components/capture/capture-tokens.ts` 集中命名，由createStyles消费；这是此模块的窄范围例外，不改变全局FONT_SIZE、主题或其他模块。允许局部compact11、meta11.5、hint12、button13及批准稿muted/hover/selected/语义色对。全局相同角色继续取主题，外观选择集中处理。

- 弹窗540px/6px圆角，桌面padding20px 24px，标题16/26；独立目标路径12/20，可折行。
- 双页签等宽，3px内距、28px最小动作高、字号13/20，下距22px；主体gap14，可内部滚动；尾部padding-top18px并保持可达。
- URL字段34px、14/22、1px边框，无外扩阴影；来源12px。动作32px/13px，稳定边框，图文flex居中。
- 上传有结果时54px紧凑新选择入口；行以17px图标列和内容列排列，padding8px 2px（末尾CSS覆盖；窄屏左右0）、gap10、细分隔；名称13.5/21，格式11.5/18、结果12/20。长名称/后缀/路径/完整错误可读，不挤压成单行。
- 窄屏动作/关闭/页签/清除触点至少44px，窄屏padding18px 16px；低高度正文滚动、footer固定可达。

## 请求与结果状态

`api.capture.run(url, folder)`仍为单次JSON请求。只接受完整http(s)结构且trim后不超过2000字符；校验后继续用shared的detectSource，不私改来源识别规则。Enter排除IME组合/229/重复，提交同步锁先于React状态生效。

等待说明一次请求，不画假实时百分比/阶段；错误details未返回的前序阶段不补成功勾。按响应stage/status展示实际结果。有documentId才允许交接；260ms自动交接窗口锁定动作并清理旧timer，取消守卫后保留成功结果、可再打开，不重新抓取。

上传选择即开始，串行逐文件请求，50MiB/任意格式及目录根/相对路径合同不变。已保存原件无正文仍算成功；Markdown笔记空正文不能说成保存原件。响应丢失不能证明未保存，先提示核对目标知识库再决定重传；不承诺幂等、撤销、后台取消或自动重试。完成刷新documents/counts/folders。

busy锁页签/关闭/新批次，同步宿主锁覆盖二次入口和整页drop，防止nonce重挂载丢结果。整页drop只在已有目录范围接收Files；空列表/非Files/非目录范围不上传。它在库内复用逐文件结果（inline形态），不另加打开首个按钮，不承诺拖目录递归。文件夹结构保留走现有目录选择器。

## 宿主、关闭与恢复

成功打开之前复用既有未保存守卫。收集专用文案说明导入结果保留；手动模式三选、自动模式不承诺丢弃、Office不能代存时不放行。确认期间保留原内容挂载并避免两个Modal焦点陷阱同时活动；继续编辑/Esc或保存失败保留结果，取消后回到原打开动作，不重发导入。

`useUnsaved().canSave`表示已注册句柄且允许守卫代存。`setSave(save, mode, canSaveFromGuard = true)`第三参数向后兼容，不能仅按回调存在推断保存能力；OfficeSourceEditor的提示型回调显式传false。收集变体仅提供继续编辑，默认其它守卫行为保持。守卫取消/收集关闭必须清除收集交接上下文，不能污染之后的普通导航。

普通关闭回实际入口；成功导航不抢回旧入口。busy/settling不能关闭；清理timer不能让迟到回调误打开文档。可关闭后的重开按当次参数初始化。

## 回归与还原验收

可控promise/timer回归覆盖URL/IME/单飞、阶段真实性、busy页签、迟到结果/卸载、串行/超限/原件成功/空Markdown、查询刷新、drop批次和未保存取消/失败保留。不得用固定睡眠断言完成。

实际浏览器保存批准稿与产品同状态截图及计算样式，至少浅深桌面、390px、低高度、长错误、等待/失败、输入清除、结果和guard。真实鼠标default→hover→leave及键盘focus验证1px边框与盒尺寸稳定；功能测试不替代视觉还原。原生选择器/OS输入法/触屏/读屏/Electron/真实业务成功分别记录，未验不能称通过。

错误：上传结果尚未结束便允许切页签卸载面板；网络响应失败后直接提示安全重传。
正确：同步单批锁守住面板与宿主入口，完整保留结果；不确定结果先核对知识库。
