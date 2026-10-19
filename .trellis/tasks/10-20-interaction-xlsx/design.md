# 设计与最小变更

## 证据

当前对象Inspector六模式中，shape/pivot/edit已有独立body与固定footer；chart/image/table仍共用整块滚动。真实before390×400下chart主动作top577.75/bottom601.75而panel bottom373.36，需大量滚动；图片选择按钮有aria-label但无可见文字。690栏原结构截图与短高三模式已保存。

已有busy状态的旧Select未显式disabled，只依赖原生fieldset；Antd div触发器不受fieldset限制。高级查找state无来源/版本或请求身份，旧结果能留在当前工作簿上下文中，条件变化/Enter重复和延迟返回缺少守卫；无需变更协议或引擎。

## 方案

- 对象chart/image/table局部使用独立滚动body及同级固定footer，保留六模式导航、全部字段/验证、原图片本地与URL两个入口和反馈。主动作单一，补齐选择图片可见文字。不改已有shape/pivot/edit结构，不用全局CSS覆盖成熟面板。
- 高级查找保留既有ToolbarMenu和所有条件，不迁移工具组织。收紧结果为清晰地址/值的可访问行，结果局部有界滚动，搜索动作/状态容易发现；搜索中条件/结果与重复提交有准确禁用；结果与请求绑定当前源/工作表/已发布版本，变化及关闭后迟到结果不得复活；保留合理查询草稿。
- 现有Xlsx Format/Manual/Property/Range/Object/VisualProperties缺失的Select传入对应现有busy/locked标志，复用已有ToolbarSelect disabled，不改shared shell。字段禁用和导航可切换保持现行合同。

## 文件与不变边界

XlsxObjectControls.tsx/xlsx-tools.css负责旧面板布局；XlsxFindControls.tsx与XlsxEditor.tsx少量上下文接线负责查找；上述旧控制组件只补busy。必要局部测试文件覆盖实际路径。不改变shared shell、server、vendor、原件保存/XML、Agent写入与保护/加密语义。

## 验证

冻结dcb9a40真实组件、同原件/尺寸配对；宽690/1100、390窄与400短高、浅深；旧三模式、查找空/成功/截断/错误与切源、成熟形状/透视/数据/剪贴板/填充/验证/公式/布局代表状态实测。Node本地fixture helper只执行已有宿主函数且内存保存，明确区别产品端持久化；静态Demo缺helper须真实报错。定向回归+独立审查+全仓pnpm check。
