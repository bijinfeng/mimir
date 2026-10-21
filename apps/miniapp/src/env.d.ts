/// <reference types="@tarojs/taro" />

declare const MIMIR_SERVER_ORIGIN: string

declare module '*.png' {
  const source: string
  export default source
}

declare module '*.scss'
