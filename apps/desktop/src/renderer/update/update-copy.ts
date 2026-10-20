import type { DesktopUpdateState } from '@mimir/shared/desktop'

export function updateCopy(state: DesktopUpdateState): { title: string; description: string } {
  const version = state.version ? `mimir ${state.version}` : '新版本'
  switch (state.status) {
    case 'disabled':
      return { title: '开发版本不执行自动更新', description: '可以查看正式版本的发布记录。' }
    case 'idle':
      return { title: '检查是否有新版本', description: '更新会在后台检查，重启安装由你决定。' }
    case 'checking':
      return {
        title: '正在检查更新…',
        description: '正在获取最新版本信息，你可以关闭此窗口继续工作。',
      }
    case 'current':
      return { title: '已是最新版本', description: `你正在使用 mimir ${state.currentVersion}。` }
    case 'unpublished':
      return {
        title: '目前还没有可用的发布版本',
        description: '稍后可以再次检查，或查看发布记录。',
      }
    case 'available':
      return {
        title: `${version} 可用`,
        description:
          state.capability === 'manual'
            ? state.platform === 'darwin'
              ? '此测试版需要手动更新。下载后退出 mimir，再替换应用；系统可能阻止打开。'
              : '当前安装方式需要手动更新。下载新版后退出 mimir，再替换应用。'
            : '下载会在后台进行，不会打断当前工作。',
      }
    case 'downloading':
      return {
        title: `正在下载 ${version}`,
        description: '关闭此窗口不会取消下载，准备好后会轻提示你。',
      }
    case 'preparing':
      return {
        title: '正在准备更新…',
        description: '下载已完成，正在检查更新文件，暂时还不能安装。',
      }
    case 'downloaded':
      return {
        title: '新版本已准备好',
        description: `重启后将使用 ${version}。重启会中断正在进行的回答和传输。普通退出不会安装更新。`,
      }
    case 'restarting':
      return { title: '正在准备重启…', description: '正在处理当前内容的保存与关闭，请稍候。' }
    case 'blocked':
      return {
        title: '暂未重启，更新尚未安装',
        description: state.recoveryRequired
          ? '请从应用菜单退出 mimir，再重新启动以恢复使用。已下载的更新尚未安装。'
          : state.requiresSaveConfirmation
            ? '请先返回文档保存当前内容。保存完成后，再回来确认重启。'
            : '请返回文档处理未保存内容，已下载的更新会保留。',
      }
    case 'error':
      return {
        title:
          state.retry === 'download'
            ? '下载未完成'
            : state.retry === 'install'
              ? '暂时无法完成重启'
              : '暂时无法检查更新',
        description:
          state.retry === 'install' ? '更新尚未安装。' : '请检查网络连接后重试，或前往官方下载页。',
      }
  }
}

export function formatBytes(bytes: number) {
  const safe = Number.isFinite(bytes) ? Math.max(0, bytes) : 0
  return `${(safe / 1024 / 1024).toFixed(1)} MB`
}
