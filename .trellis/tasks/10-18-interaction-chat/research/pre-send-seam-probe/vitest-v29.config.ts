import { defineConfig } from '/Users/admin/Desktop/mimir/packages/chat/node_modules/vitest/dist/config.js'
const base='/tmp/mimir-chat-official-v3/deps/node_modules/'
export default defineConfig({
 resolve:{alias:[
  {find:'@assistant-ui/react',replacement:base+'@assistant-ui/react/dist/index.js'},
  {find:'@assistant-ui/core/store/internal',replacement:base+'@assistant-ui/core/dist/store/internal.js'},
  {find:'@assistant-ui/core/store',replacement:base+'@assistant-ui/core/dist/store/index.js'},
  {find:'@assistant-ui/core/react',replacement:base+'@assistant-ui/core/dist/react/index.js'},
  {find:'@assistant-ui/core/internal',replacement:base+'@assistant-ui/core/dist/internal.js'},
  {find:'@assistant-ui/core',replacement:base+'@assistant-ui/core/dist/index.js'},
  {find:'@assistant-ui/store/internal',replacement:base+'@assistant-ui/store/dist/internal.js'},
  {find:'@assistant-ui/store/client',replacement:base+'@assistant-ui/store/dist/client.js'},
  {find:'@assistant-ui/store',replacement:base+'@assistant-ui/store/dist/index.js'},
  {find:'@assistant-ui/tap/react-shim/compiler-runtime',replacement:base+'@assistant-ui/tap/dist/react-shim/compiler-runtime.js'},
  {find:'@assistant-ui/tap/react-shim',replacement:base+'@assistant-ui/tap/dist/react-shim/index.js'},
  {find:'@assistant-ui/tap/internal',replacement:base+'@assistant-ui/tap/dist/internal.js'},
  {find:'@assistant-ui/tap',replacement:base+'@assistant-ui/tap/dist/index.js'},
  {find:'@assistant-ui/react-ag-ui',replacement:'/Users/admin/Desktop/mimir/packages/chat/node_modules/@assistant-ui/react-ag-ui/dist/index.js'},
  {find:'@ag-ui/client',replacement:'/Users/admin/Desktop/mimir/packages/chat/node_modules/@ag-ui/client/dist/index.js'},
  {find:'react/jsx-runtime',replacement:'/tmp/mimir-chat-official-v3/deps/node_modules/react/jsx-runtime.js'},
  {find:'react/compiler-runtime',replacement:'/tmp/mimir-chat-official-v3/deps/node_modules/react/compiler-runtime.js'},
  {find:'react-dom/client',replacement:'/tmp/mimir-chat-official-v3/deps/node_modules/react-dom/client.js'},
  {find:'react',replacement:'/tmp/mimir-chat-official-v3/deps/node_modules/react/index.js'},
 ]},ssr:{noExternal:true},
 test:{environment:'happy-dom',include:['probe.test.ts'],server:{deps:{inline:true}},environmentOptions:{happyDOM:{settings:{fetch:{disableSameOriginPolicy:true}}}}}
})
