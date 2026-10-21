import { defineConfig } from '@tarojs/cli'
import { resolveServerOrigin } from './server.mjs'
import { ModuleAuditPlugin } from './module-audit'

export default defineConfig({
  projectName: 'mimir-miniapp',
  date: '2026-10-18',
  designWidth: 375,
  deviceRatio: { 375: 2, 640: 1.17, 750: 1, 828: 0.905 },
  sourceRoot: 'src',
  // H5 只用于本地视觉打磨，不覆盖微信小程序产物。
  outputRoot: process.env.TARO_ENV === 'h5' ? 'dist-h5' : 'dist',
  framework: 'react',
  compiler: { type: 'webpack5', prebundle: { enable: false } },
  plugins: ['@tarojs/plugin-platform-weapp', '@tarojs/plugin-platform-h5'],
  cache: { enable: false },
  sass: { resource: ['node_modules/@nutui/nutui-react-taro/dist/styles/variables.scss'] },
  defineConstants: {
    MIMIR_SERVER_ORIGIN: JSON.stringify(resolveServerOrigin(process.env.MIMIR_MINIAPP_SERVER_URL)),
  },
  h5: {
    publicPath: '/',
    staticDirectory: 'static',
    router: { mode: 'hash' },
    // 设计宽度与页面断点都按真实 px 写；H5 预览保持 1:1，不做 rem 缩放。
    postcss: {
      pxtransform: { enable: false },
      autoprefixer: { enable: true },
      cssModules: { enable: false },
    },
  },
  mini: {
    postcss: { pxtransform: { enable: true }, cssModules: { enable: false } },
    webpackChain(chain) {
      chain.plugin('mimir-module-audit').use(ModuleAuditPlugin)
    },
  },
})
