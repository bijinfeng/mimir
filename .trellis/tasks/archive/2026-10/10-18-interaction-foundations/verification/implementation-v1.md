# 基础组件 v1 实际验收（2026-10-18）

审批仅基础组件 v1。冻结 HTML SHA256：`a4ca817e948b1e24a39daf85d2ed7ab7e04f54548f4b1ea9e075a367f2014789`。12 场景的修改/保留映射见 ../change-boundary.md，独立复核见 ../check-evidence.md。

## 实际浏览器

- 运行共享 Renderer 的 Web 宿主 localhost:5174，隔离 SQLite 数据库 `/tmp/mimir-foundations-runtime/mimir.db` 与数据目录；使用 AGENTS.md 指定的 admin 测试账号。未连接用户实际资料。
- 创建知识库：非法 `/` 名称就地报错、焦点回名称且 aria-describedby 关联错误；修改后清除错误。阻断 folders 请求后，名称/描述保留、显示“重试创建”；恢复网络后原草稿创建成功并回焦触发器。
- 设置：阻断 config/settings 请求，视觉输入开关回到持久值并显示失败说明/重试；解除后重试成功。文本模型失败保留草稿，再次保存成功；测试值随后恢复。秘密清除失败、IME 与同轮防重由行为测试验证，未在真实界面输入秘密。
- 删除：新建测试知识库的确认默认焦点在取消；明确阻断 folders 请求后触发失败，原对象/影响说明保留，显示重试；取消回到原操作按钮。复核修正后只显示确认框 inline 错误。没有执行成功的永久删除，成功分支由行为测试覆盖。
- 菜单：实际文档头部“更多操作”以 Enter 展开，菜单项获焦；Escape 关闭并回到原触发器。
- 上传：真实上传生成的 Markdown 与 0 字节长文件名 txt，显示“1 个成功，1 个失败”、完整“文件是空的”、可见 .txt 后缀及继续上传。再次只选空文件，显示“0 个成功，1 个失败”，仍可继续上传回初始态。
- 外观：浅色1280×720校验状态、深色1280×720弹窗、深色390×844弹窗和上传混合结果已截图检查。创建弹窗在720高桌面页脚bottom=651.31；390宽页脚right=358、bottom=713.31，document.scrollWidth=390，无横向溢出。正文限高滚动，操作位置可达。
- 已恢复网络阻断/节流和主题/视口临时设置；自己的运行服务与测试标签按收尾记录处理。没有通过DOM写入伪造状态。

## 证据

`actual-create-validation-light.png`、`actual-create-desktop-dark.png`、`actual-create-mobile-dark.png`、`actual-create-error.png`、`actual-setting-rollback.png`、`actual-delete-error.png`、`actual-upload-mixed-mobile-dark.png`。

源码片段原型与这些实际页面分开：原型不是完整业务页验收；15个后续模块、Office原生/专用编辑与Desktop宿主没有在本轮验收。实际测试途中旧代码热更新及CaptureDialog的既有maskClosable弃用警告不计为新功能通过证据；任务内失败分支未出现未处理promise拒绝。

## 质量门

- 独立复核：13文件lint/format、Renderer typecheck、5文件21项行为测试通过。
- 首次默认并行 `pnpm check`：lint/样式/格式/全包类型检查通过，Office 228文件2706项通过，1项DocxEditor加密保存等待断言失败，导致递归提前结束，后续Renderer未跑。失败文件单独13项通过，不能以此声称首次全仓通过。
- 为验证并行负载影响，使用 `pnpm_config_workspace_concurrency=1 pnpm check` 重跑相同检查与断言；只调整包执行顺序，不修改测试配置或产品范围。最终 exit 0：lint、样式守卫、format、全包 typecheck 与全部测试完成。Office 229文件2707项、Renderer 51文件427项、Server 114文件1286项通过；Server本地10项/fnOS4项/备份2项、Desktop50项、根脚本6项及其余包全部通过。Storage保留既有2项跳过，未改跳过条件。完整日志见 global-check-serial.txt；首次失败见 global-check-default.txt。

## 范围与收尾

起始tracked文件SHA256核对：本轮仅13个组件/测试（含3个新文件）及forms.md改变；其他已有脏文件字节均未变。冻结原型哈希仍一致。临时完整基线清单移至/tmp，不纳入提交。自己的Web/Server服务和测试标签已关闭；用户审阅HTML另行保留。
