import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  /*
   * 指向 **schema.pg.ts 本体**，不是 `schema.ts`。
   *
   * `schema.ts` 是按 DATABASE_URL 分发方言的动态层（`pick()` 读运行时变量），
   * drizzle-kit 静态分析不了它——读到的是空 schema，于是 generate 会生成
   * 「把全部表 DROP 掉」的假迁移（实测：`0008_fuzzy_luminals.sql` 是 13 条
   * DROP TABLE），或干脆报「无变化」。这份 config 过去就是错的，PG 侧从
   * 0007 之后没能再生成过迁移。
   */
  schema: './src/db/schema.pg.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://mimir:mimir@127.0.0.1:5544/mimir',
  },
  // 列名一律在 schema 里显式声明，不依赖自动命名转换
})
