# 第七模块 v7 最新SDK规划交付

2026-10-19。用户要求TanStack AI有新版时一并升级。官方npm registry latest已核验ai0.69.0、ai-client0.39.3、ai-react0.30.4、ai-openai0.30.0；v7真实使用新依赖，v1–v6保持不变。

## 范围与验收

继承v6模型分组、模型能力等级及全部交互；403个稳定来源路由、126目录不变，目录继续引用冻结v6定义。仅SDK、相关依赖/版本/许可和必要兼容调整，不能悄然改交互。

真实隔离安装/build/strict类型/执行闭包及实际ChatClient探针应确认新版本运行，验证发送快照、排队与失败续轮、协议归约；最新OpenAI适配器构造与官方推理API做无密钥/无网络smoke。此类验证不等于真实供应商HTTP或产品全仓质量门。

## 产品实施接缝

产品当前仍ai0.68.0与ai-openai0.22.8；在最新HTML认可后，按升级研究联动server/provider/renderer、客户端依赖及锁文件，核对所有chat/embed/summarize/image/transcription路径。最新原生适配器推理API不能直接当作任意OpenAI兼容网关能力，模型能力来源与参数映射仍须验证。

任务保持planning，本轮只交付真实升级的HTML与迁移方案；不冒称产品依赖已升级。

## 最终检查与冻结

- 隔离构建、strict类型、干净目录npm ci复现通过。
- 5组运行时探针、58默认协议序列/89变体/8检查、官方推理API及5类provider factory探针通过。
- scoped lint零错误、40条继承警告；28个手写源文件格式通过。
- 代表浏览器发送/模型/等级/详情目录抽验通过，见[浏览器记录](verification/v7/browser-qa.md)。
- [独立复核](research/independent-v7-upgrade-review.md)无未解决阻断。
- 380个保护路径哈希一致，产品依赖和历史HTML保持原样。

冻结入口：[对比稿](http://127.0.0.1:5189/v7/review.html?mode=proposed#scene=CHAT-012.menu) · [全部交互](http://127.0.0.1:5189/v7/interactions.html#UI-014)。具体冻结值见prototype/v7/version.json；后续修改另存新版。

- `review.html` SHA-256 `1537bb796575dc47c8cc5b5661034b5bfa80e23d4a5995e9ff2a6ef39d67e3ff`
- `thread.review.html` SHA-256 `f5f7195aaf4639c52e327078a1e86224026da0f32d2455ec00806b427a1be827`
- `interactions.html` SHA-256 `acbcaf31377a0500ae9402ab07bbd9b495faed30b8c5ddaffe1ba0f804040de6`
