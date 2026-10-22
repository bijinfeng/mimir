# 多阶段构建：builder 用同一个 runtime 构建脚本产出可移植产物，runner 只复制它。
# 最终镜像里只有一个 Node 进程，同时提供 API 和前端静态资源。
#
# 基础镜像从 Alpine 改为 Debian slim（glibc）：与 fnOS 的原生模块 ABI 一致，
# 是将来共用 Linux 产物的前提；当前只统一脚本/布局/libc，不承诺逐字节相同。
# 静态资源由 runtime 提供（manifest.web 自动成为 static.dir），不需要 nginx。

# ---------- builder ----------
FROM node:22-bookworm-slim AS builder

RUN corepack enable
WORKDIR /repo

# 全量复制：pnpm deploy 需要所有 workspace 包的 manifest，按包挑着拷会让
# 依赖解析在「本地有、CI 没有」时静默退化。依赖层缓存让位于正确性。
COPY . .

RUN pnpm install --frozen-lockfile

# shared 以源码形式发布（exports 直接指向 src/*.ts），编译责任在使用方：
# 前端是 Vite，服务端也是 Vite SSR（把 shared/插件源码一起编译进 dist）。
# build-runtime 内部会再跑一次 server build，并把 web 产物放进 <out>/web/dist。
RUN pnpm --filter @mimir/web build \
 && node scripts/build-runtime.mjs --out /out/runtime --web apps/web/dist

# ---------- runner ----------
FROM node:22-bookworm-slim AS runner

RUN groupadd --system mimir \
 && useradd --system --gid mimir --home-dir /app --shell /usr/sbin/nologin mimir

WORKDIR /app

# 产物根 = runtime 根：dist / drizzle* / node_modules / web / manifest.json。
# Dockerfile 不再知道这些子目录各自该拷到哪——宿主只认 manifest。
COPY --from=builder /out/runtime /app

# 数据目录挂载点。三类文件（vault / raw / avatars）都是它的前缀，
# 全部落在卷上——**按目录逐个传环境变量会漏，而漏了不报错**
# （头像就这么丢过一次，见 .trellis/spec/project/research.md §10.10）。
RUN mkdir -p /data/vault /data/raw /data/avatars \
 && chown -R mimir:mimir /app /data

VOLUME ["/data"]
USER mimir

# 只有 DATA_DIR 一个数据根：vault/ · raw/ · avatars/ 由它派生。
# 不要再加 VAULT_DIR / RAW_DIR / AVATARS_DIR——见上面的注释与 D-038。
# 不再设 WEB_DIST：runtime 从产物 manifest 读 web 目录。
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

EXPOSE 3000

# 健康检查走 /healthz，它不需要鉴权
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/runtime/cli.js"]
