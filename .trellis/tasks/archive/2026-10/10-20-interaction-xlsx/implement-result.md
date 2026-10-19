# XLSX 实施结果

## 产品文件与边界

- `XlsxObjectControls.tsx`：只重排 chart/image/table 旧模式。原字段 fieldset 独立滚动，原主动作与反馈移至同级固定 footer；移出 disabled fieldset 的动作显式保留 busy 禁用。六模式导航、已有 shape/pivot/edit 结构及所有调用参数、有效性条件均保留。设备图片按钮增加可见文字，保留本地/URL 两条入口与 PNG/JPEG、8MiB 限制。
- `XlsxFindControls.tsx`：沿原 ToolbarMenu 保留查询、范围、内容、regex、公式错误条件草稿；打开的实际子 Panel 拥有结果、请求身份与同步提交锁。关闭/卸载，或 documentId/sourceKey/sheetId/已发布 version/条件变化永久使旧结果与请求失效；A→B→A 也不复活旧结果。旧 finally/catch 不能覆盖后继请求。busy 时原生字段、两个 Select、条件按钮及结果导航禁用，连续同 tick Enter 只提交一次。
- `XlsxEditor.tsx`：仅向 Find 接入 documentId、源字节身份及已发布 version，既有 inspect/onSelect 协议不变。
- `xlsx-tools.css`：三旧模式局部 flex/min-height/scroll/footer。Find 查询整行、scope/lookIn 两列；结果地址和值分层、满宽左对齐、最大 220px 局部滚动，完整值保留在内容和 title。只调整项目布局槽，无 Antd 内层观感覆盖。
- `XlsxFormatControls.tsx`、`XlsxManualControls.tsx`、`XlsxPropertyControls.tsx`、`XlsxRangeControls.tsx`、`XlsxVisualProperties.tsx`：仅向既有 Select 显式传既有 busy/locked。Property 的共享 `fieldsDisabled` 保留 `busy || (group !== 'names' && protected)`；names 仍为工作簿级。Range 保留 busy 或 protected；Visual 沿用原 busy 参数。

共补齐研究清单 24 处 Select（Format 3、Manual 2、Property 8、Range 1、Object 3、Visual 5、Find 2）。不修改共享 Shell、vendor、引擎、保存/XML、Agent/IO/服务端、保护/密码或依赖。

产品已冻结；父会话首轮 QA 后仅调整 Find 的局部布局与项目按钮真实类名；随后按 React 规则将上下文失效的状态重置放入条件渲染，layout effect 仅维护身份与 cleanup。该机械修正不改变视觉、查询草稿或菜单合同。

## 新增/调整回归

- `XlsxFindControls.test.tsx`：真实 readXlsx/findXlsxCells 的选项、地址/值导航、0项、正则错误、200项截断与长中文表名/长缓存值。同步双 Enter、busy Select 真实触发不能展开、结果不导航；文档/源/工作表/版本 A→B→A；close/reopen 迟到成功与旧失败均不能覆盖后继结果或解除其 busy。
- `XlsxObjectControls.polish.test.tsx`：三个旧模式首击 footer 取得完整图表/表格/URL 原生参数且只执行一次；本地文件入口按原 anchor 回调、六模式保留、关闭回触发器；其余旧组件 22 处 Select 的 busy 触发不能展开，保护表的 Property/Range 保持禁用而工作簿 names 可用。此处对象 callback 为组件边界记录，不宣称宿主原件写入；原件行为由真实 Editor 既有回归覆盖。
- `XlsxEditor.test.tsx`：真实 Editor/Agent 高级查找结果导航保持 bytes、版本、dirty、历史；实际原生写入推进已发布版本后结果清空、查询草稿保留、重新搜索取当前值。
- `XlsxEditor.management-cancel.test.tsx`：原有取消回归中，移动到 footer 的插入动作改为验证自身 disabled，继续守住忙态不写入；不再依赖原来的 DOM 祖先结构。

## 已通过的检查

1. 六组定向 Vitest：Find、Object polish、XlsxEditor、management-cancel、Manual、sort，**106/106 通过**；最终测试类型收尾后又单独运行新增真实 Editor 查找回归。
2. `pnpm --filter @mimir/office typecheck`。
3. 12 个 TS/TSX 作用域 `oxlint`，零输出。
4. 13 个产品/测试文件 `oxfmt --check`。
5. `pnpm lint:styles`、`git diff --check`。

## 后续交接

父会话拥有真实浏览器验收、同尺寸/主题 before-after HTML 与图像存档、独立 checker、最终全仓 `pnpm check`、限定提交及任务归档。未暂存或提交；未修改 gallery/docs/父任务。没有将组件测试、源码入口清单或几何推断表述为所有状态逐项 GUI 验收。
