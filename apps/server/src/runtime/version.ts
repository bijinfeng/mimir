/**
 * 两个独立契约版本：
 *
 * - `PROTOCOL_VERSION`：HTTP/API 契约。客户端与宿主共用的请求/响应形状变了才递增。
 * - `SHELL_ABI`：shell ↔ sidecar 的 IPC 与生命周期消息契约。侧车启动方式、
 *   ready/error/shutdown 消息形状变了才递增。
 *
 * 不要用产品版本代替它们：产品版本每次发布都变，而这两个只在破坏兼容时变。
 */
export const PROTOCOL_VERSION = 1
export const SHELL_ABI = 1

/** 产物 manifest 里没有构建期注入版本时的开发占位。 */
export const DEV_PRODUCT_VERSION = '0.0.0-dev'
