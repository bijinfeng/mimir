# S3 真实测试 fixture

## 1. 范围与触发

`.github/workflows/ci.yml` 的 S3 compatibility smoke 在全仓检查、构建和 PG 重跑后独立执行。官方 community 镜像已不能匿名拉取；镜像下载失败不代表 SDK 测试失败，也不能记录为测试通过。

## 2. 命令

原断言入口保持 `pnpm --filter @mimir/plugin-storage exec vitest run src/s3.integration.test.ts`。CI 原生 Linux x64 直接运行官方历史 MinIO 静态二进制，不要求 Docker 镜像，不替换为假 S3 服务。

## 3. 来源与环境契约

- 官方 `minio/minio` 的 `RELEASE.2025-09-07T16-13-09Z`，源码 commit `07c3a429bfed433e49018cb0f78a52145d4bedeb`；Linux amd64 asset `404655976`，110989496 bytes。
- 匿名下载 `https://api.github.com/repos/minio/minio/releases/assets/404655976`，`Accept: application/octet-stream`；运行前固定 SHA256 `7c5bd8512c6e966455b1d198209358b2d191c77a83ab377c4073281065fb855f` 必须匹配，再输出实际 `--version`。
- `MIMIR_S3_TEST_ENDPOINT=http://127.0.0.1:19000`，access/secret 使用 CI 独立 fixture 凭据；API/console 分别仅绑定 loopback 19000/19001。
- 数据、可执行文件放 `RUNNER_TEMP` 下 mkdtemp 专用目录，EXIT 只终止并回收本步骤拥有的 PID，再删除该目录；不按进程名清理其他服务。

## 4. 校验和失败

下载、摘要、启动或健康检查失败 → 步骤失败，测试未运行；断言失败 → 保留失败状态。清理失败不能伪造测试成功。禁止为通过 CI 改成 skip、假端点或放宽分页/复制断言。

## 5. Good / Base / Bad

- Good：固定官方字节，原生 runner 健康检查后执行全部真实断言，退出清理自己创建的 fixture。
- Base：本机不同架构可用同一 Linux amd64 字节做仿真测试，单独注明；不能据此宣称原生 CI 已通过。
- Bad：改用未知维护者镜像、只探测 HTTP 200、不校验摘要或把拉取失败当兼容性通过。

## 6. 必需验证

两项原 integration tests 必须实际执行，覆盖真实字节读写、中文 CopySource、重复删除/探测及 1002 对象 LIST 分页；工作流变更通过 actionlint 和格式检查。更新来源时须核对官方 tag→commit、asset digest/独立官方 checksum/下载文件摘要，并运行真实服务。证据归任务 verification。

## 7. 错误与正确

错误：`docker pull` denied 后跳过 S3 并报告全 CI 成功。

正确：固定已核对的官方 release asset，`sha256sum --check` 成功后运行真实 MinIO，保持 `vitest run src/s3.integration.test.ts` 的原断言；在新的原生 GitHub run 完成后登记结果。
