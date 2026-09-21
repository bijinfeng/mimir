import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { App, ConfigProvider } from 'antd'
import { describe, expect, it } from 'vitest'

describe('cssVar probe', () => {
  it('dumps injected css var names', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => {
      root.render(
        createElement(
          ConfigProvider,
          { theme: { cssVar: true, token: { colorPrimary: '#1677ff', colorTextBase: '#1f2329' } } },
          createElement(App, null, createElement('div', { className: 'note-body' }, '正文')),
        ),
      )
    })
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('\n')
    const vars = [...new Set(styles.match(/--ant-[a-z0-9-]+/g) ?? [])]
    console.log('VAR COUNT', vars.length)
    console.log('SAMPLE', vars.slice(0, 30).join(' '))
    console.log('has color-text?', vars.includes('--ant-color-text'))
    console.log('has color-bg-container?', vars.includes('--ant-color-bg-container'))
    console.log('has color-primary?', vars.includes('--ant-color-primary'))
    console.log('has fontSize?', vars.includes('--ant-font-size'))
    console.log('--- app html ---')
    console.log(host.innerHTML.slice(0, 300))
    const decl = styles.match(/\.css-var-[^{ ]*\{[^}]{0,400}/)
    console.log('--- decl ---')
    console.log(decl ? decl[0] : 'NONE')
    expect(vars.length).toBeGreaterThan(0)
  })
})
