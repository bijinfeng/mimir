import { useState } from 'react'
import { ArrowLeft, ArrowUpRight, LayoutGrid, List, Moon, Sun } from 'lucide-react'
import { FormatIcon, formatTypes, schemeNames } from './file-icons'
import type { IconScheme } from './file-icons'
import type { Doc } from './fixtures'
import phosphorLicense from './assets/phosphor/LICENSE.txt?raw'
import materialLicense from './assets/material/LICENSE.txt?raw'

const schemes: IconScheme[] = ['original', 'A', 'B']
const sizes = [20, 24, 32]
const sourceRoot = {
  phosphor: 'https://github.com/phosphor-icons/core/tree/2b75f3ad12b420c9504ef05df8d2564a28f8500e',
  material:
    'https://github.com/material-extensions/vscode-material-icon-theme/tree/13025adc5ad10a5cc649528a2c1edec93069f1b9',
}

export function IconGallery({
  scheme,
  onScheme,
  theme,
  onTheme,
  onBack,
  onPreview,
}: {
  scheme: IconScheme
  onScheme: (scheme: IconScheme) => void
  theme: 'light' | 'dark'
  onTheme: (theme: 'light' | 'dark') => void
  onBack: () => void
  onPreview: (layout: 'list' | 'card') => void
}) {
  const [narrowSize, setNarrowSize] = useState(24)
  return (
    <main className={`review icon-review ${theme}`}>
      <header className="icon-review-top">
        <button type="button" className="btn text" onClick={onBack}>
          <ArrowLeft size={16} />
          返回交互稿
        </button>
        <span>文件图标 · 第五模块修订稿</span>
        <button
          type="button"
          className="btn text"
          onClick={() => onTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          {theme === 'light' ? '查看深色' : '查看浅色'}
        </button>
      </header>
      <div className="icon-review-body">
        <section className="icon-review-intro">
          <div>
            <h1>文件与资料，一眼辨认</h1>
            <p>A 更统一克制，B 更强调格式。先选喜欢的表达，再放回列表和卡片看看。</p>
          </div>
          <div className="icon-preview-actions">
            <span>当前预览：{schemeNames[scheme]}</span>
            <button type="button" className="btn" onClick={() => onPreview('list')}>
              <List size={16} />
              看列表
            </button>
            <button type="button" className="btn" onClick={() => onPreview('card')}>
              <LayoutGrid size={16} />
              看卡片
            </button>
          </div>
        </section>
        <div className="icon-table-meta">
          <span>同一格式，横向比较 · 每组为 20 / 24 / 32 px</span>
          <a
            href="#icon-sources"
            onClick={(event) => {
              event.preventDefault()
              document.getElementById('icon-sources')?.scrollIntoView({ behavior: 'smooth' })
            }}
          >
            真实 SVG · 来源与许可
            <ArrowUpRight size={12} />
          </a>
          <label className="narrow-size-picker">
            对照尺寸
            <select
              aria-label="窄屏图标对照尺寸"
              value={narrowSize}
              onChange={(event) => setNarrowSize(Number(event.target.value))}
            >
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size} px
                </option>
              ))}
            </select>
          </label>
        </div>
        <table className="icon-comparison" aria-label="16种文件与来源图标方案对比">
          <thead>
            <tr>
              <th scope="col">文件 / 来源</th>
              {schemes.map((value) => (
                <th scope="col" key={value} className={scheme === value ? 'selected-scheme' : ''}>
                  <button
                    type="button"
                    aria-pressed={scheme === value}
                    onClick={() => onScheme(value)}
                  >
                    <span>
                      {schemeNames[value]}
                      {value === 'A' && <small className="icon-recommend">推荐候选</small>}
                    </span>
                    <small>
                      {value === 'A'
                        ? 'Phosphor · 双色轮廓'
                        : value === 'B'
                          ? 'Material Icon Theme · 原色'
                          : '现有 Material Symbols'}
                    </small>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {formatTypes.map((format) => {
              const doc: Doc = {
                id: format.id,
                title: format.sample,
                kind: format.id === 'unknown' ? '未登记的文件类型' : format.kind,
                ext: format.ext,
                detail: '',
                location: '',
                status: '就绪',
                date: '',
              }
              return (
                <tr key={format.id} data-format-row={format.id}>
                  <th scope="row">
                    <span>{format.label}</span>
                    <small>
                      {format.ext || (format.id === 'note' ? '应用内笔记' : '内容来源')}
                    </small>
                  </th>
                  {schemes.map((value) => (
                    <td key={value} className={scheme === value ? 'selected-scheme' : ''}>
                      <div className="icon-samples">
                        {sizes.map((size) => (
                          <span
                            key={size}
                            className={`icon-sample ${size !== narrowSize ? 'sample-hidden-mobile' : ''}`}
                          >
                            <span
                              className={`optical-box file-icon scheme-${value} tone-${format.kind}`}
                              style={{ width: size, height: size }}
                            >
                              <FormatIcon doc={doc} scheme={value} size={size} />
                            </span>
                            <small>{size}</small>
                          </span>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="icon-comparison-note">
          20 px 的格式字母会更细小；名称、后缀与来源标签继续保留。未知类型使用通用文件图标。
        </p>
        <section className="icon-bottom-preview">
          <div>
            <h2>放进真实密度里，再看一眼</h2>
            <p>使用 {schemeNames[scheme]}，查看全部 16 种类型的列表或卡片。</p>
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={() => onPreview('list')}>
              <List size={16} />
              看列表
            </button>
            <button type="button" className="btn" onClick={() => onPreview('card')}>
              <LayoutGrid size={16} />
              看卡片
            </button>
          </div>
        </section>
        <section id="icon-sources" className="icon-sources">
          <h2>图标来源</h2>
          <p>
            A 使用 Phosphor 官方双色 SVG；B 的文件及网页图标使用 Material Icon Theme，公众号与
            GitHub 来源徽标复用 Phosphor。B 保留原色，仅在深色主题提亮
            Word。两套候选均本地内嵌，无需联网加载图标。
          </p>
          <div className="icon-source-links">
            <a href={sourceRoot.phosphor} target="_blank" rel="noreferrer">
              Phosphor 固定版本
              <ArrowUpRight size={13} />
            </a>
            <a href={sourceRoot.material} target="_blank" rel="noreferrer">
              Material Icon Theme 固定版本
              <ArrowUpRight size={13} />
            </a>
            <a
              href={sourceRoot.phosphor.replace('/tree/', '/blob/') + '/LICENSE'}
              target="_blank"
              rel="noreferrer"
            >
              Phosphor MIT 许可
              <ArrowUpRight size={13} />
            </a>
            <a
              href={sourceRoot.material.replace('/tree/', '/blob/') + '/LICENSE'}
              target="_blank"
              rel="noreferrer"
            >
              Material MIT 许可
              <ArrowUpRight size={13} />
            </a>
          </div>
          <details>
            <summary>许可全文与使用说明</summary>
            <p>
              保留官方原件与双色透明度，A 通过 currentColor 适配格式颜色和浅深主题；B 的深色 Word
              前景由 #01579b 调整至 #64b5f6，其余原始配色保留。B 使用 table.svg 表示 Excel、xml.svg
              表示代码、document.svg 表示文本和未知类型。原稿沿用项目中的 Material Symbols 与
              Lucide。这里只评审视觉，选择不代表实施批准。
            </p>
            <h3>Phosphor · MIT</h3>
            <pre>{phosphorLicense}</pre>
            <h3>Material Icon Theme · MIT</h3>
            <pre>{materialLicense}</pre>
          </details>
        </section>
      </div>
    </main>
  )
}
