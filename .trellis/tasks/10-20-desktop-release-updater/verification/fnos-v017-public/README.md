# v0.1.7 fnOS 公开资产独立验证

2026-10-20。使用 Python urllib 标准 HTTP 请求，无 Authorization、PAT 或 GitHub CLI 下载；官方 API metadata 和官方 browser_download_url 均匿名访问。

- 正式稳定发布：v0.1.7，2026-10-20T13:43:15Z 公开，15 个资产；draft=false、prerelease=false。匿名 API 检查精确文件名集合、上传状态、非空大小、摘要格式及官方资产 URL；见 release-metadata.json 和 anonymous-request.json。
- 匿名读取标签 ref，精确解析为提交 `3f35e8a9201a1abd0eb882a4f91e8f75cbb85abb`（本次 ref 直接指向 commit）；见 tag-metadata.json 和 tag-resolved.json。正式 tag push 构建 [run 39428273594](https://github.com/bijinfeng/mimir/actions/runs/39428273594) 的匿名快照为 completed/success，head_sha 与该提交一致，见 run-metadata.json。
- 完整读取官方 `mimir-0.1.7-fnos-x64.fpk` 全部响应字节，HTTP 200，无 Range 请求；170581061 字节与公开资产大小一致。首次下载成功，2026-10-20T13:44:48Z 开始，2026-10-20T13:54:12.650078+00:00 校验完成，用时 564.0 秒。
- 实际 SHA-256：`47e1e0cff50d204e2dc61d153718e927ce45c616a1a75d06fe39cc575c8899b1`，与匿名 API 的 GitHub 资产 digest 完全一致。另独立计算 SHA-512，完整值见 result.json；SHA-512 没有额外公开摘要可供比对。
- verify-metadata.py 与 verify-download.py 为实际脚本；metadata-attempts.jsonl 保留公开前的匿名 404 和最终成功请求，download.log 保存进度及最终摘要。下载字节直接流入摘要计算，不保留 FPK 二进制。

本验证证明公开匿名下载完整性及资产身份。fnOS 设备实际安装、覆盖升级、Electron 自动安装 FPK 和系统通知投递不属于此证据的结论。
