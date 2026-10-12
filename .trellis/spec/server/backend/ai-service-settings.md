# 通用 AI 服务设置

## 1. Scope / Trigger

当功能需要网络搜索、图片生成、视觉输入或音频转录时，读取应用级设置；不要为某个编辑器再建一组服务密钥。当前 DOCX Agent 是这些能力的一个消费者。设置分别在“网络搜索”和“模型”页面展示。

## 2. Signatures

- `GET /api/config` 返回 `RuntimeConfig.settings`；先调用 `migrateAiServiceSettings()`。
- `PATCH /api/config/settings` 使用现有 `updateSettingsInputSchema` 和整批校验。
- `POST /api/config/network-search/test` 无请求体；需要 `/api` 鉴权。
- `SettingsApi.migrateKeys(pairs: readonly { from: string; to: string }[]): Promise<{ issues: { key: string; message: string }[] }>` 只迁移已注册、隐藏且类型相同的旧键。

## 3. Contracts

| 能力 | 通用键 | 旧键 |
| --- | --- | --- |
| Brave 网页与图片搜索 | `search.web.brave.apiKey` | `docx.brave.apiKey` |
| 图片生成 | `model.image.apiKey`, `model.image.baseUrl`, `model.image.model` | `docx.image.*` |
| 视觉输入 | `model.vision.enabled` | `docx.media.visionEnabled` |
| 音频转录 | `model.transcription.apiKey`, `model.transcription.baseUrl`, `model.transcription.model` | `docx.media.apiKey`, `docx.media.baseUrl`, `docx.media.transcriptionModel` |

旧键继续注册为 `hidden: true, writable: false`，只供迁移。首次配置读取及首次使用相关 Agent 能力前均触发迁移；新键已有覆盖值时保留新值并删除旧值。密钥迁移直接复制密文，不把明文送到浏览器、日志或迁移中间状态。`GET /api/config` 对密钥只下发 `configured` 和 `problem`，`value` 恒为 `null`。

连接测试显式发起一次 `braveWebSearch({ query: 'Mimir', maxResults: 1 })`，成功响应为 `{ ok: true, results: number }`。配置页加载本身不触发真实搜索。

## 4. Validation & Error Matrix

| 条件 | 行为 |
| --- | --- |
| 未鉴权调用连接测试 | HTTP 401 |
| Brave 密钥缺失、失效或网络请求失败 | HTTP 400，`NETWORK_SEARCH_TEST_FAILED`，显示服务端错误消息 |
| 旧密钥无法解密 | 保留旧行；新键的 `problem` 提示重新填写 |
| 新键写入失败 | 迁移抛错，旧行保留，后续读取可重试 |
| 迁移源不是隐藏键或源目标类型不一致 | 抛出配置迁移错误，阻止错误映射 |
| `PATCH /api/config/settings` 中任一键无效 | 整批拒绝，HTTP 400 `INVALID_SETTING` |

## 5. Good / Base / Bad Cases

- Good：旧 Brave 密钥能解密，首次读配置后新键保存相同密文，DOCX 搜索使用新键。
- Base：无旧值时不写数据库；用户未点“测试连接”时不请求 Brave。
- Bad：旧密钥损坏时，设置页显示修复提示，旧密文仍在数据库，用户可以填写新密钥。

## 6. Tests Required

- Core：断言密文逐字节迁移、新值优先、旧键隐藏、损坏密文与写入失败保留旧行。
- Server：断言 `GET /api/config` 迁移所有旧服务键，响应不含密钥；连接测试鉴权、请求最多 1 条结果以及供应商失败映射。
- Renderer：断言通用设置入口与缺失能力的设置链接；真实凭据的供应商调用需在配置后单独验收。

## 7. Wrong vs Correct

```ts
// Wrong: 功能专属配置会让同一服务在不同功能中重复维护。
await settings.getSecret('docx.brave.apiKey')

// Correct: 功能消费应用级能力；旧键只留给迁移。
await settings.getSecret('search.web.brave.apiKey')
```
