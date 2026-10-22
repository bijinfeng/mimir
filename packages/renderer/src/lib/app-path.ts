import { readRuntimeBasePath } from '@mimir/shared/runtime-base'

/**
 * 当前部署前缀（不带尾斜杠）。
 *
 * 运行时由宿主注入；开发/桌面回退 `import.meta.env.BASE_URL`。桌面 renderer 的
 * `BASE_URL='./'` 不是绝对路径，读出来是空串，仍按根路径处理。
 */
export const appBasePath = readRuntimeBasePath()

/** 将应用自己的绝对路径放到当前部署前缀下。 */
export function appPath(path: `/${string}`): string {
  return `${appBasePath}${path}`
}

/** 服务端保存的是根路径 URL；在子路径部署时只改写本站 API 地址。 */
export function serverAssetPath(url: string | null | undefined): string | null | undefined {
  return url?.startsWith('/api/') ? appPath(url as `/${string}`) : url
}
