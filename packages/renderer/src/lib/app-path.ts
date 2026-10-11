/** electron-vite 的 `./` 用于打包资源；运行中的 HTTP 宿主仍挂在根路径。 */
const viteBaseUrl = import.meta.env.BASE_URL
export const appBasePath = viteBaseUrl.startsWith('/') ? viteBaseUrl.replace(/\/+$/, '') : ''

/** 将应用自己的绝对路径放到当前部署前缀下。 */
export function appPath(path: `/${string}`): string {
  return `${appBasePath}${path}`
}

/** 服务端保存的是根路径 URL；在子路径部署时只改写本站 API 地址。 */
export function serverAssetPath(url: string | null | undefined): string | null | undefined {
  return url?.startsWith('/api/') ? appPath(url as `/${string}`) : url
}
