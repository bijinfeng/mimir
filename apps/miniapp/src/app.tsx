import type { PropsWithChildren } from 'react'
import { useDidShow, useLaunch } from '@tarojs/taro'
import { getSession, setSession } from './lib/session'
import { initializeNetwork } from './lib/network'
import { api } from './lib/api'
import './app.scss'
export default function App({ children }: PropsWithChildren) {
  useLaunch(initializeNetwork)
  useDidShow(() => {
    const previous = getSession()
    if (previous)
      void api
        .session()
        .then((current) => {
          const active = getSession()
          if (active?.token === previous.token) setSession({ ...active, ...current })
        })
        .catch(() => undefined)
  })
  return children
}
