# PPTX 段落范围与列表详细参数（2026-10-17）

## 范围与参考

- 主参考固定 GenOffice `480548fd55f1be3593ee0d8e316a734751d58309`（本片 `git rev-parse HEAD` 再核）。`apps/slides/src/renderer/bullet-presets.ts` 给出七组字体+字符精确配对、九种编号及悬挂预设；`RibbonHomeTab.tsx:925–1150` 提供列表类型、图片符号、编号起始、悬挂、比例与颜色。Mimir 沿其语义，界面使用既有紧凑 Ribbon / 右侧 Inspector。
- 上游 `packages/pptx-engine/src/index.ts:3188–3440` 的 `ParagraphFormatPatch` / `setElementParagraphFormat(..., paraIndices?)` 已有真实局部段落写入；`generate.ts:139–240` 用 pPr 外科补丁保留 run、未知属性与非目标段落。
- **重要接缝差异**：`packages/pptx-ops/src/ops/text-ops.ts:299–385` 的普通 `setParagraphFormat` 不读取/不传 `paraIndices`，额外添加这个字段仍会作用整框。此次新增严格 `manual_paragraph`，不修改通用模型操作白名单或 vendor。
- WeKnora 核对 v0.8.3 `3e22822c1d2397be730c458c7539d0eb8c113a24`：本片成功取得固定源码 `internal/agent/tools/definitions.go`（301行，临时证据 `/tmp/mimir-paragraph-weknora-definitions.go`），`search_knowledge/read_document/list_documents`、受控工具发现及 workspace 类工具适用于 Agent 与知识服务分层，无 Office 段落/列表/Ribbon 合同，不作本片界面原型。站点 `curl -I -L --max-time 8 https://weknora.weixin.qq.com/` 0字节超时，不记访问成功。

## 实现合同

1. `pptx-paragraph-range` 按同一 textarea 的 UTF16 文本计算 hard paragraph 分隔符；软换行仍属于原段，field 使用实际显示缓存文字长度。null 整框；caret 当前段；范围 end-exclusive，到下段起点不误含下一段；空段可准确命中。
2. `PptxParagraphControls` 三分区：段落 / 列表 / 文本框。段落与列表只提交用户改过的字段；混合值显示混合，不把首段值刷给全范围。段落属性与列表为草稿+固定底部应用；文本框属性标明整框即时应用。主按钮单一文案，所有下拉显式 pending disabled。
3. 草稿源身份绑定目标、单调版本及 start/end，变化重建内部草稿并 abort；A→B→A 不复活旧草稿。外层保留分区状态。取消/错误不改画布，未提交输入保留供重试；选择文件也有卸载取消。
4. 严格共享 schema：只允许格式白名单，唯一非负有界段号；拒绝原始 XML、mediaRef / relationship ID。九编号、起始1–32767，字号比25–400%，悬挂0–51206400 EMU，行距/段距沿上游范围。字体及字符须为合法 XML 文本。
5. 本地 service 先校验所有段号，再调用原生 engine 的真实范围能力；图片符号沿同一个 `addImageMediaAndRel` 落包原语，仅PNG/JPEG、512KiB、400万像素，复用现有有界 PNG CRC/chunk/JPEG 解码器做真解码，客户端不能指定裸关系。重复同图复用原媒体，不新增孤立部件。
6. 单独改符号字体时，对每个已有字符符号保留自己的 glyph 再改字体；避免上游重建列表时默认圆点覆盖不同 glyph。编号、大小/颜色/悬挂/层级沿固定原语。
7. 用生成后的 pPr XML 比对原件判断 no-op（包括 startAt=1 与同图重复应用），原字节/版本/历史稳定。原生段落 span 不匹配时明确拒绝，禁止走上游整体 txBody 重建回退；未选段和未知结构不能因一次段落操作被重写。
8. root 维护 Editor、shared exports/action、host dispatch 与选区重绑。文字目标身份须用持久 ID；host 重新解析后的 volatile element.id 不能用于选区连续应用身份。accepted 写入后即使内部版本重挂已经 abort，也须沿既有 accepted fact 保留正确范围（root专项覆盖）。

## 验证与交接

- helper：caret段首/段尾/空段、soft break、field、代理对、反向范围、范围末端恰在下段起点、混合值。
- 控件：可见范围/混合值、一次只提交编辑字段、二次点击门控、范围/目标/版本及A→B→A清草稿、分区保留、待执行下拉禁用、signal取消、非法数字不请求、文本框整框属性独立。
- 原生服务：非目标段XML精确不变，未知pPr属性/tabLst/ext、rPr、endParaRPr、field GUID与软换行保留；所有其他ZIP部件字节不变；两次保存；编号/起始/颜色/比例/悬挂/级别、各段不同glyph字体修改、图片落包/复用与no-op；无效范围/XML/关系注入/非法图片/取消整体拒绝。
- 最终工具日志：`/tmp/mimir-paragraph-ui-final-tests.log`、`/tmp/mimir-paragraph-native-final-tests.log`、`/tmp/mimir-paragraph-office-final-tsc.log`、`/tmp/mimir-paragraph-server-final-tsc.log`、`/tmp/mimir-paragraph-lint.log`、`/tmp/mimir-paragraph-antd-lint.log`、`/tmp/mimir-paragraph-styles.log`。本片不把组件测试算浏览器验收。
- 代码已冻结交 root / 独立 checker。root 统一真实浏览器宽区/420、选择/连续应用、原生下载及undo/save/redo/save；Desktop与系统打印由用户自验。无模型配置不宣称真实模型验收，整体任务不完成、不归档、不暂存/提交。

## 明确边界

- 现有其他编号样式可显示为原件编号格式并保留；图库新增选择以固定九种为准，不将未知类型换成默认值。
- 文字框层方向、自适应、边距仍作用整框；图片符号只接本地用户所选PNG/JPEG，不支持客户端XML/rId或任意远程URL。
- 对原生段落无法安全定位的复杂结构明确拒绝；本片没有引入整个XML解析重序列化或放宽普通Agent合同。跨组内文字范围与复杂数学编辑不由本片推断为已支持。
