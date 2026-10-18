export default defineAppConfig({
  pages: [
    'pages/chat/index',
    'pages/library/index',
    'pages/account/index',
    'pages/login/index',
    'pages/reader/index',
    'pages/editor/index',
    'pages/capture/index',
  ],
  window: {
    navigationBarTitleText: 'Mimir',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundColor: '#ffffff',
  },
  tabBar: {
    color: '#595959',
    selectedColor: '#262626',
    backgroundColor: '#f7f8f8',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/chat/index', text: '问答' },
      { pagePath: 'pages/library/index', text: '知识库' },
      { pagePath: 'pages/account/index', text: '我的' },
    ],
  },
  lazyCodeLoading: 'requiredComponents',
})
