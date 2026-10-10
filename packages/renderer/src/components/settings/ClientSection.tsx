import { Button } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useDesktopBridge } from '../../platform'
import { Block, BlockDesc, Panel, Row, TechnicalDetails } from './parts'

/**
 * 客户端（桌面壳专属，D-100 / D-103）。
 *
 * 两种使用方式——**本地离线**（数据全在本机、免登录）与**云端**（数据在
 * 自部署的服务器上）——在这里查看与切换。
 *
 * ## 为什么只是一个「更换使用方式」按钮
 *
 * 选择与切换的界面**只有一处**：首次启动那个选择页（桌面端渲染进程的第二个
 * 入口，随包分发）。这里点按钮就是把窗口带回那一页，由它负责填地址、
 * 校验、探活与切换。
 *
 * 在设置页里再画一套「地址输入框 + 保存 + 校验」看着更像「设置」，但它是
 * 第二份实现：两处的地址归一化规则、失败措辞、探活时机必然漂移，而漂移的
 * 表现是「同一件事在两处结果不同」。那一页也已经会读当前模式，从设置页进去
 * 时它显示的是「切换使用方式」而不是「首次选择」——用户看不出区别。
 *
 * ## 浏览器里这个分区不存在
 *
 * `getDesktopBridge()` 返回 undefined 时**整个分区不渲染**（连 tab 也不出现）：
 * 浏览器的使用方式由「访问哪个地址」决定，没有一个可以切换的对象。
 * 渲染一个灰掉的按钮只是噪音。
 */
export function ClientSection() {
  const bridge = useDesktopBridge()

  const configQuery = useQuery({ queryKey: ['config'], queryFn: api.config })
  const bootQuery = useQuery({
    queryKey: ['desktop-boot'],
    queryFn: async () => (await bridge?.boot()) ?? null,
  })

  const mode = bootQuery.data?.mode
  const dataDir = bootQuery.data?.dataDir ?? null
  const origin = bootQuery.data?.origin ?? null

  return (
    <>
      <Panel title="使用方式">
        <Row label="当前">
          {mode === undefined
            ? '读取中…'
            : mode === 'local'
              ? '本地使用（数据在这台电脑上）'
              : '连接服务器'}
        </Row>
        {mode === 'cloud' && origin ? <Row label="服务器">{origin}</Row> : null}
        <Block>
          <Button onClick={() => bridge?.mode.openSetup()}>更换使用方式</Button>
          <BlockDesc>切换不会迁移数据，本地与服务器上的数据分别保留。</BlockDesc>
        </Block>
        <TechnicalDetails>
          {mode === 'local' && dataDir ? <Row label="数据目录">{dataDir}</Row> : null}
          {configQuery.data?.database ? (
            <Row label="数据库">
              {configQuery.data.database.driver === 'sqlite' ? 'SQLite' : 'PostgreSQL'}
            </Row>
          ) : null}
          {configQuery.data?.database.file ? (
            <Row label="数据库文件">{configQuery.data.database.file}</Row>
          ) : null}
        </TechnicalDetails>
      </Panel>
    </>
  )
}
