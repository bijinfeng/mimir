/** SVG geometry adapted from GenOffice insert-presets.ts at
 * 480548fd55f1be3593ee0d8e316a734751d58309 (Apache-2.0).
 * Keep the fixed upstream set explicit; do not replace it with arbitrary Lucide aliases.
 */
export interface PptxIconDefinition {
  id: string
  label: string
  group: string
  body: string
  keywords: string
}
export const PPTX_ICON_GROUPS = [
  { id: 'symbols', label: '符号与提示' },
  { id: 'work', label: '工作与时间' },
  { id: 'people', label: '人物与联系' },
  { id: 'media', label: '媒体与设备' },
  { id: 'business', label: '商务与成就' },
] as const
export const PPTX_ICONS: readonly PptxIconDefinition[] = [
  {
    id: 'star',
    label: '星标',
    group: 'symbols',
    body: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 16.8 6.6 19.6l1.1-6L3.2 9.4l6.1-.8z"/>',
    keywords: 'star 星形 收藏',
  },
  {
    id: 'heart',
    label: '心形',
    group: 'symbols',
    body: '<path d="M12 20.5C6 15.5 3 12.3 3 8.9 3 6.2 5.1 4 7.7 4c1.7 0 3.3.9 4.3 2.4C13 4.9 14.6 4 16.3 4 18.9 4 21 6.2 21 8.9c0 3.4-3 6.6-9 11.6z"/>',
    keywords: 'heart 爱心 喜欢',
  },
  {
    id: 'check',
    label: '对勾',
    group: 'symbols',
    body: '<path d="M4 12.5l5 5L20 6.5"/>',
    keywords: 'check ',
  },
  {
    id: 'cross',
    label: '叉号',
    group: 'symbols',
    body: '<path d="M6 6l12 12M18 6L6 18"/>',
    keywords: 'cross ',
  },
  {
    id: 'plus',
    label: '加号',
    group: 'symbols',
    body: '<path d="M12 5v14M5 12h14"/>',
    keywords: 'plus ',
  },
  {
    id: 'warning',
    label: '警告',
    group: 'symbols',
    body: '<path d="M12 3L2.5 20h19z"/><path d="M12 9.5v5"/><circle cx="12" cy="17.2" r="0.6"/>',
    keywords: 'warning ',
  },
  {
    id: 'info',
    label: '信息',
    group: 'symbols',
    body: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.6"/>',
    keywords: 'info ',
  },
  {
    id: 'question',
    label: '问号',
    group: 'symbols',
    body: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3A2.6 2.6 0 0 1 12 7.5c1.4 0 2.5 1 2.5 2.3 0 1.6-2.1 2-2.5 3.4v.6"/><circle cx="12" cy="16.6" r="0.6"/>',
    keywords: 'question 帮助',
  },
  {
    id: 'bulb',
    label: '灯泡',
    group: 'work',
    body: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 1 3.5 10.9c-.8.6-1 1.3-1 2.1h-5c0-.8-.2-1.5-1-2.1A6 6 0 0 1 12 3z"/>',
    keywords: 'bulb ',
  },
  {
    id: 'gear',
    label: '齿轮',
    group: 'work',
    body: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19"/>',
    keywords: 'gear 设置',
  },
  {
    id: 'clock',
    label: '时钟',
    group: 'work',
    body: '<circle cx="12" cy="12" r="9"/><path d="M12 6.5V12l3.8 2.4"/>',
    keywords: 'clock ',
  },
  {
    id: 'calendar',
    label: '日历',
    group: 'work',
    body: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
    keywords: 'calendar ',
  },
  {
    id: 'mail',
    label: '邮件',
    group: 'people',
    body: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    keywords: 'mail ',
  },
  {
    id: 'phone',
    label: '电话',
    group: 'people',
    body: '<path d="M5.5 4h3.6l1.4 4.2-2.1 1.6a12.5 12.5 0 0 0 5.8 5.8l1.6-2.1L20 14.9v3.6c0 .8-.7 1.5-1.5 1.5C10.5 20 4 13.5 4 5.5 4 4.7 4.7 4 5.5 4z"/>',
    keywords: 'phone ',
  },
  {
    id: 'location',
    label: '位置',
    group: 'people',
    body: '<path d="M12 21.5S5 14.7 5 9.8A7 7 0 0 1 19 9.8c0 4.9-7 11.7-7 11.7z"/><circle cx="12" cy="9.8" r="2.6"/>',
    keywords: 'location 地图 定位',
  },
  {
    id: 'user',
    label: '用户',
    group: 'people',
    body: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    keywords: 'user ',
  },
  {
    id: 'team',
    label: '团队',
    group: 'people',
    body: '<circle cx="8.5" cy="9" r="3.2"/><circle cx="16.5" cy="10" r="2.6"/><path d="M2.5 19.5a6 6 0 0 1 12 0M14.8 19.5a5 5 0 0 1 6.7-4.7"/>',
    keywords: 'team ',
  },
  {
    id: 'house',
    label: '房屋',
    group: 'people',
    body: '<path d="M4 11.5L12 4l8 7.5"/><path d="M6 10v10h12V10"/><path d="M10 20v-5.5h4V20"/>',
    keywords: 'house 主页 家',
  },
  {
    id: 'document',
    label: '文档',
    group: 'work',
    body: '<path d="M6.5 3h7L18.5 8v13h-12z"/><path d="M13 3.5V8.5h5"/><path d="M9 12.5h6M9 15.5h6"/>',
    keywords: 'document ',
  },
  {
    id: 'folder',
    label: '文件夹',
    group: 'work',
    body: '<path d="M3.5 6.5c0-1.1.9-2 2-2h4l2 2.5h7c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2h-13c-1.1 0-2-.9-2-2z"/>',
    keywords: 'folder ',
  },
  {
    id: 'camera',
    label: '相机',
    group: 'media',
    body: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7L10 4.5h4L15.5 7"/><circle cx="12" cy="13.3" r="3.4"/>',
    keywords: 'camera ',
  },
  {
    id: 'music',
    label: '音乐',
    group: 'media',
    body: '<path d="M9 18.5V6l10-2v12.5"/><circle cx="6.8" cy="18.5" r="2.3"/><circle cx="16.8" cy="16.5" r="2.3"/>',
    keywords: 'music ',
  },
  {
    id: 'cloud',
    label: '云',
    group: 'media',
    body: '<path d="M7 18.5a4.2 4.2 0 0 1-.6-8.4 5.6 5.6 0 0 1 10.9 1.2A3.7 3.7 0 0 1 17 18.5z"/>',
    keywords: 'cloud ',
  },
  {
    id: 'lock',
    label: '锁',
    group: 'media',
    body: '<rect x="5.5" y="10.5" width="13" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/><circle cx="12" cy="15.3" r="1.2"/>',
    keywords: 'lock 安全 密码',
  },
  {
    id: 'search',
    label: '搜索',
    group: 'media',
    body: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
    keywords: 'search ',
  },
  {
    id: 'cart',
    label: '购物车',
    group: 'business',
    body: '<circle cx="9.5" cy="19.5" r="1.4"/><circle cx="17.5" cy="19.5" r="1.4"/><path d="M3 4.5h2.5l2.4 10.5h10.2L20.5 8h-13"/>',
    keywords: 'cart 商店 购买',
  },
  {
    id: 'trophy',
    label: '奖杯',
    group: 'business',
    body: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0z"/><path d="M8 5.5H4.5a3.5 3.5 0 0 0 3.6 3.5M16 5.5h3.5a3.5 3.5 0 0 1-3.6 3.5"/><path d="M12 13.5v3M8.5 20.5h7M10 16.5h4l.8 4h-5.6z"/>',
    keywords: 'trophy ',
  },
  {
    id: 'rocket',
    label: '火箭',
    group: 'business',
    body: '<path d="M12 2.5c3.5 2 5 5.5 5 9l-2.5 5h-5L7 11.5c0-3.5 1.5-7 5-9z"/><circle cx="12" cy="9" r="1.8"/><path d="M9.5 16.5L7 21M14.5 16.5L17 21M12 17v4.5"/>',
    keywords: 'rocket 启动 发射',
  },
]
export const PPTX_ICON_COLORS = [
  '#404040',
  '#4472C4',
  '#ED7D31',
  '#70AD47',
  '#C00000',
  '#7030A0',
] as const

export function filterPptxIcons(query: string, category = 'all') {
  const normalized = query.trim().toLocaleLowerCase()
  return PPTX_ICONS.filter(
    (icon) =>
      (!normalized && category !== 'all' ? icon.group === category : true) &&
      (!normalized || `${icon.label} ${icon.keywords}`.toLocaleLowerCase().includes(normalized)),
  )
}

/** Only trusted gallery geometry and a validated hex color enter the rasterization input. */
export function pptxIconSvg(icon: PptxIconDefinition, color: string, size = 512): string {
  if (!PPTX_ICONS.includes(icon)) throw new Error('请选择图库中的图标')
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('请选择有效的图标颜色')
  if (!Number.isInteger(size) || size < 24 || size > 2048) throw new Error('图标图片尺寸无效')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icon.body}</svg>`
}
