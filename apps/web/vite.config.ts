import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { alias } from './alias.ts'

export default defineConfig({
  plugins: [
    // 必须排在 react() 之前：路由插件要先生成 routeTree.gen.ts
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react({
      /**
       * React Compiler：构建期自动插入记忆化，替代手写 useMemo / useCallback / memo。
       *
       * 为什么开：这个项目的编辑器组件持有大量状态（Tiptap 实例、保存防抖、
       * 查询缓存），手写记忆化的依赖数组很容易写错——写错的代价是难查的
       * 过度重渲染，而不是报错。交给编译器比靠人记得更可靠。
       *
       * 依赖两个包（由 @vitejs/plugin-react 声明为 peer）：
       *   - oxc-transform-react：JSX 转换（OXC 原生，比 Babel 快）
       *   - babel-plugin-react-compiler：编译器本身
       *
       * 目标 React 19，自带 runtime，不需要 react-compiler-runtime。
       */
      compiler: { logDiagnostics: true },
    }),
  ],
  resolve: { alias },
  server: {
    port: 5173,
    // 开发时前端在 5173、后端在 3000，代理掉跨源与 cookie 的麻烦
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
