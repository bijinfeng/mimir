/**
 * 驱动 antd 下拉的测试辅助（**只给测试用**，不从 `index.ts` 导出）。
 *
 * ## 为什么需要它
 *
 * 换成 antd 的 `Select` 之后，原来那套「读 `select.querySelectorAll('option')`」
 * 与「给 select 赋 value 再派发 change」都不成立了：
 *
 *  1. **选项要打开弹层才渲染**——收起时 DOM 里一个选项都没有
 *  2. **弹层 portal 到 body**（这一轮明确接受的例外，见 `EditorShell` 的
 *     `ToolbarSelect` 说明），所以要从 `document` 上找，而不是从 host 里
 *  3. **选中一项是点它**，不是改 value 再 `change`
 *
 * 四个文件都要这套动作（外壳自己的契约、docx 的整条工具条、pptx 的整条工具条、
 * 宿主的 markdown 工具条），抄四份必然漂移——这正是这个仓库反复在防的那件事。
 *
 * ## 怎么认出「这个下拉的弹层」
 *
 * 弹层是 rc-select **按需创建、之后复用**的：第二次打开同一个下拉时，弹层还在
 * 原处、不出现新节点（实测：打开 → 选中 → 再打开，`.ant-select-dropdown` 始终
 * 只有一个）。所以「打开前后 diff」只能认出**第一次**打开的子。这里在第一次
 * 认出来之后把它记在 `WeakMap` 里（键是那个下拉的根元素），之后按记录取。
 *
 * 另外两条路都走不通：弹层根元素上没有能指回触发器的属性，而内层 input 的 id
 * 在测试环境里**是同一个常量**（antd 的 `useId` 在 happy-dom 下退化成
 * `test-id`，同一页面上几个下拉全都叫这个），所以 `aria-owns` / `id` 都没法
 * 用来区分。
 */

import { act } from 'react'

/** 下拉开/关是 React 状态更新，事件要包在 `act` 里 */
function inAct(run: () => void): void {
  act(run)
}

/** 某个下拉的根元素 → 它的弹层。第一次打开时记下来（弹层会被复用） */
const dropdownOf = new WeakMap<Element, Element>()

/** 按下（`mousedown` 才是 antd Select 的展开触发点，`click` 也行但不够） */
export function pressMouseDown(element: Element): void {
  inAct(() => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  })
}

/**
 * 找到某个 `ToolbarSelect` 的**根元素**。
 *
 * antd 把 `aria-label` 放在内层那个只读 input 上，所以判据是「含一个带这个
 * 名字的后代」——这也顺带证明无障碍名称确实落在了控件上。
 */
export function selectRoot(host: HTMLElement, label: string): HTMLElement {
  const found = [...host.querySelectorAll<HTMLElement>('.ant-select')].find(
    (item) => item.querySelector(`[aria-label="${label}"]`) !== null,
  )
  if (found === undefined) throw new Error(`没有名为「${label}」的下拉`)
  return found
}

/** 打开下拉，返回它的弹层根元素 */
function dropdownOfSelect(host: HTMLElement, label: string): Element {
  const root = selectRoot(host, label)
  const cached = dropdownOf.get(root)
  if (cached !== undefined && cached.isConnected) {
    // 已经认过它了：再按一次（让它是打开状态）后直接复用记录
    pressMouseDown(root.querySelector('.ant-select-content') ?? root)
    return cached
  }
  const before = new Set(document.querySelectorAll('.ant-select-dropdown'))
  pressMouseDown(root.querySelector('.ant-select-content') ?? root)
  const fresh = [...document.querySelectorAll('.ant-select-dropdown')].find(
    (item) => !before.has(item),
  )
  if (fresh === undefined) throw new Error(`「${label}」的下拉没有打开`)
  dropdownOf.set(root, fresh)
  return fresh
}

/** 打开下拉并返回它渲染出来的选项（`.ant-select-item-option`） */
export function openSelect(host: HTMLElement, label: string): HTMLElement[] {
  return [...dropdownOfSelect(host, label).querySelectorAll<HTMLElement>('.ant-select-item-option')]
}

/** 打开下拉、按显示的文案选中一项 */
export function pickSelectOption(host: HTMLElement, label: string, optionText: string): void {
  const option = openSelect(host, label).find(
    (item) => (item.textContent ?? '').trim() === optionText,
  )
  if (option === undefined) throw new Error(`「${label}」里没有「${optionText}」这一项`)
  inAct(() => {
    option.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  })
}

/** 下拉收起时显示的文案（`.ant-select-content`） */
export function selectValueText(host: HTMLElement, label: string): string {
  const root = selectRoot(host, label)
  return (root.querySelector('.ant-select-content')?.textContent ?? '').trim()
}
