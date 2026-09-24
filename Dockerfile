# 多阶段构建：builder 装全量依赖并构建，runner 只带运行需要的东西。
# 最终镜像里只有一个 Node 进程，同时提供 API 和前端静态资源。
#
# 这里刻意不打前端到 nginx：单用户自托管，两个容器做一件事是浪费。
# 静态资源由 Hono 直接提供（见 apps/server/src/lib/static.ts）。

# ---------- builder ----------
FROM node:22-alpine AS builder

# 原生模块（@node-rs/jieba）需要预编译包，alpine 走 musl
RUN apk add --no-cache libc6-compat
RUN corepack enable

WORKDIR /repo

# 先只拷贝清单文件，让依赖层能被缓存
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

COPY . .

# 两个包互相独立，都各自编译 @mimir/shared 的源码。
#
# shared 以源码形式发布（exports 直接指向 src/*.ts），编译责任在使用方：
# 前端是 Vite，服务端也是 Vite（SSR 构建，把 shared 的源码一起编译进 dist）。
# 所以镜像里没有「先构建 shared」这一步。
RUN pnpm --filter @mimir/web build \
 && pnpm --filter @mimir/server build

# 只保留生产依赖，显著减小最终镜像
RUN pnpm --filter @mimir/server --prod deploy /out/server

# ---------- runner ----------
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat
RUN addgroup -S mimir && adduser -S mimir -G mimir

WORKDIR /app

# 服务端编译产物与生产依赖
COPY --from=builder /out/server/node_modules ./node_modules
COPY --from=builder /repo/apps/server/dist ./dist
COPY --from=builder /repo/apps/server/package.json ./

# 迁移文件：启动时执行 migrate 需要它
COPY --from=builder /repo/apps/server/drizzle ./drizzle

# 前端静态资源。路径必须是 dist/../web/dist，
# 与 static.ts 里 resolveWebDist() 的推导保持一致。
COPY --from=builder /repo/apps/web/dist ./web/dist

# 数据目录挂载点。三类文件（vault / raw / avatars）都是它的前缀，
# 全部落在卷上——**按目录逐个传环境变量会漏，而漏了不报错**
# （头像就这么丢过一次，见 docs/RESEARCH.md §10.10）。
RUN mkdir -p /data/vault /data/raw /data/avatars && chown -R mimir:mimir /data /app
VOLUME ["/data"]

USER mimir

# 只有 DATA_DIR 一个数据根：vault/ · raw/ · avatars/ 由它派生。
# 不要再加 VAULT_DIR / RAW_DIR / AVATARS_DIR——见上面的注释与 D-038。
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIST=/app/web/dist

EXPOSE 3000

# 健康检查走 /healthz，它不需要鉴权
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
