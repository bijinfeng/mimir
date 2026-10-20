# v0.1.6 fnOS 公开资产独立验证

2026-10-20。使用 Python urllib 标准 HTTP 请求，无 Authorization、PAT 或 GitHub CLI 下载；官方 API metadata 和官方 browser_download_url 均匿名访问。

- 正式稳定发布：v0.1.6，2026-10-20T12:23:18Z 公开，15 个资产；draft=false、prerelease=false。原始匿名结果见 release-metadata.json，请求信息见 anonymous-request.json。
- 标签是 annotated tag；匿名读取 ref 并解析 tag object，最终精确提交为 `7a3c34d23f63e5313c8cb72f466ec096817df608`，见 tag-metadata.json 和 tag-resolved.json。
- 完整读取官方 `mimir-0.1.6-fnos-x64.fpk` 的全部响应字节，HTTP 200，无 Range 请求；170553985 字节与公开资产大小一致。首次下载成功，用时 158.93 秒。
- 实际 SHA-256：`1903d6391e684cf4177fa8cef60e74e1a572cb18ad8912046155c9fbef9ac30f`，与匿名 API 中 GitHub 的资产 digest 完全一致。另独立计算 SHA-512，完整值及结果见 result.json；SHA-512 没有额外公开摘要可供比对。
- verify-download.py 为本次实际执行脚本，download.log 保存时间、进度与最终摘要。下载字节直接流入摘要计算，不保留或提交 FPK 二进制。

本验证证明公开匿名下载完整性及资产身份。fnOS 设备实际安装、覆盖升级和桌面自动升级不属于此证据的结论。
