import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://mimir:mimir@127.0.0.1:5544/mimir',
  },
  // 列名一律在 schema 里显式声明，不依赖自动命名转换
})
