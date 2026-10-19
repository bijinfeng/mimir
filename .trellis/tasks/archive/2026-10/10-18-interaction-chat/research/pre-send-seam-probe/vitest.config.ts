import { defineConfig } from '/Users/admin/Desktop/mimir/packages/chat/node_modules/vitest/dist/config.js'
export default defineConfig({
  resolve: { alias: {
    '@assistant-ui/react': '/Users/admin/Desktop/mimir/packages/chat/node_modules/@assistant-ui/react/dist/index.js',
    '@assistant-ui/react-ag-ui': '/Users/admin/Desktop/mimir/packages/chat/node_modules/@assistant-ui/react-ag-ui/dist/index.js',
    '@ag-ui/client': '/Users/admin/Desktop/mimir/packages/chat/node_modules/@ag-ui/client/dist/index.js',
    'react-dom/client': '/Users/admin/Desktop/mimir/packages/chat/node_modules/react-dom/client.js',
    'react': '/Users/admin/Desktop/mimir/packages/chat/node_modules/react/index.js',
  } },
  test: {
    environment: 'happy-dom', include: ['probe.test.ts'],
    environmentOptions: { happyDOM: { settings: { fetch: { disableSameOriginPolicy: true } } } },
  },
})
