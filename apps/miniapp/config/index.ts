import { defineConfig } from '@tarojs/cli'
import { resolveServerOrigin } from './server.mjs'
import { ModuleAuditPlugin } from './module-audit'

export default defineConfig({
  projectName: 'mimir-miniapp',
  date: '2026-10-18',
  designWidth: 375,
  deviceRatio: { 375: 2, 640: 1.17, 750: 1, 828: 0.905 },
  sourceRoot: 'src',
  outputRoot: 'dist',
  framework: 'react',
  compiler: { type: 'webpack5', prebundle: { enable: false } },
  plugins: ['@tarojs/plugin-platform-weapp'],
  cache: { enable: false },
  sass: { resource: ['node_modules/@nutui/nutui-react-taro/dist/styles/variables.scss'] },
  defineConstants: {
    MIMIR_SERVER_ORIGIN: JSON.stringify(resolveServerOrigin(process.env.MIMIR_MINIAPP_SERVER_URL)),
  },
  mini: {
    postcss: { pxtransform: { enable: true }, cssModules: { enable: false } },
    webpackChain(chain) {
      chain.plugin('mimir-module-audit').use(ModuleAuditPlugin)
    },
  },
})
