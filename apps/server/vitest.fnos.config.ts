import { defineConfig } from 'vitest/config'
import { TEST_ENV } from './src/test/config.js'

export default defineConfig({
  test: {
    include: ['src/test/fnos-mode.test.ts'],
    env: {
      ...TEST_ENV,
      OWNER_EMAIL: 'fnos-owner@example.com',
      OWNER_PASSWORD: 'fnos-test-password-123',
      MIMIR_FNOS_SOCKET: '/tmp/mimir-fnos-vitest.sock',
      MIMIR_BASE_PATH: '/app/mimir',
    },
    globalSetup: ['./src/test/global-setup.ts'],
  },
})
