# 实施计划

1. **版本握手**：`/healthz` 加字段；desktop manifest/ready 校验；fnOS `version.json` + manifest 校验；补不匹配测试。
2. **桌面发布**：每个 matrix job 直接 `build-runtime.mjs` → desktop build → package；删除 `server build` + `deploy-server`；不做 runtime artifact 上传/下载；`verify-package.mjs` 改读 manifest。
3. **fnOS 工作流**：改用 runtime 脚本并写 `app/version.json`；校验 manifest 版本；保留 fnpack/ELF/Socket 烟测。
4. **CI**：把 runtime-artifact/sidecar 测试纳入 `pnpm check` 或显式 node --test；加结构检查。
5. **文档**：D-114、architecture §3/§8/§14、README、fnOS README、server/desktop 规范。
6. **全量验收**：按设计 §5 矩阵执行；记录环境、命令、结果；未验证项单列。
7. **提交**：按子任务 1–5 分批提交；最后一条提交包含文档与验收证据；推送前确认 `git status` 干净。

验收命令：

```sh
pnpm check
pnpm build
node scripts/build-runtime.mjs --out /tmp/mimir-runtime --web apps/web/dist
pnpm desktop:build
docker build -t mimir:release-test .
# fnOS Linux x64:
pnpm fnos:build && node scripts/verify-fnos.mjs <version>
```

回滚点：CI 工作流单独提交；产物格式不变，旧工作流可恢复。
