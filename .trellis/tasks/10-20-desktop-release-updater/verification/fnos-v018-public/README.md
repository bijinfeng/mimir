# v0.1.8 fnOS 公开资产独立验证

2026-10-20。使用 Python urllib 标准 HTTP 请求，无 Authorization、PAT 或 GitHub CLI 下载；官方 API metadata 和官方 browser_download_url 均匿名访问。

- 正式稳定发布：v0.1.8，2026-10-20T14:15:45Z 公开，15 个资产；draft=false、prerelease=false。匿名 API 检查精确文件名集合、上传状态、非空大小、摘要格式及官方资产 URL；见 release-metadata.json 和 anonymous-request.json。
- 匿名读取标签 ref，精确解析为提交 `e3a950fdd5a42bf02e83ab1fb40a6832c35f38c9`；见 tag-metadata.json 和 tag-resolved.json。正式 tag push 构建 [run 39433040010](https://github.com/bijinfeng/mimir/actions/runs/39433040010) 的匿名快照为 completed/success，head_sha 与该提交一致，见 run-metadata.json。
- 完整读取官方 `mimir-0.1.8-fnos-x64.fpk` 全部响应字节，HTTP 200，无 Range 请求；170575967 字节与公开资产大小一致。第二次下载成功，2026-10-20T14:17:55Z 开始，2026-10-20T14:40:48.723758+00:00 校验完成，本次用时 1373.29 秒。
- 实际 SHA-256：`8edfcb853f3894b8b7afc9baeb61c2b47cee1c14b1015ff95cf14d9529462231`，与匿名 API 的 GitHub 资产 digest 完全一致。另独立计算 SHA-512，完整值见 result.json；SHA-512 没有额外公开摘要可供比对。
- verify-metadata.py 与 verify-download.py 为实际脚本。metadata-attempts.jsonl / metadata.log 保留公开前匿名 404、403 限流及正式公开后成功请求，rate-limit.json 保留匿名剩余额度为 0 的响应和恢复时间。未使用认证冒充匿名检查；停止提前轮询，正式公开且限流恢复后才重新检查。
- download.log 保留首次连接超时（URLError，0 字节），以及第二次完整下载的连续进度和最终摘要；未削弱完整大小或 SHA-256 断言。下载字节直接流入摘要计算，不保留 FPK 二进制。

本验证证明公开匿名下载完整性及资产身份。fnOS 设备实际安装、覆盖升级、Electron 自动安装 FPK 和系统通知投递不属于此证据的结论。
