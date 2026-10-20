import { defineConfig } from 'vitest/config'
import { FNOS_TEST_ENV } from './src/test/config.js'

export default defineConfig({
  test: {
    include: ['src/test/fnos-mode.test.ts'],
    env: FNOS_TEST_ENV,
    globalSetup: ['./src/test/global-setup.ts'],
  },
})
