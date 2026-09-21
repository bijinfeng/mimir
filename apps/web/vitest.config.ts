import { defineConfig } from 'vitest/config'
import { alias } from './alias.ts'

export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'happy-dom',
  },
})
