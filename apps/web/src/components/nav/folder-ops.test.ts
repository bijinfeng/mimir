import { describe, expect, it } from 'vitest'
import { dropTargetPath, isDescendantOf, joinPath, nameOf, parentOf } from './folder-ops'

/**
 * 目录路径运算的**落点契约**（D-068）。
 *
 * 这些函数决定「拖拽会把目录搬到哪」，而算错**不会报错**——只是目录被
 * 搬去错误的位置。下面的每一条都是一次会静默出错的场景：
 * 拖进自己的子树会让前缀重写套娃（服务端也会拒，但前端先拦掉必败请求），
 * 原地放手则什么都不该发生。
 */
describe('目录路径运算', () => {
  it('nameOf / parentOf / joinPath 互为逆运算', () => {
    expect(nameOf('技术/前端/React')).toBe('React')
    expect(nameOf('技术')).toBe('技术')
    expect(parentOf('技术/前端/React')).toBe('技术/前端')
    expect(parentOf('技术')).toBe('')
    expect(joinPath('技术', '前端')).toBe('技术/前端')
    expect(joinPath('', '技术')).toBe('技术')
  })

  it('isDescendantOf 认子树，不认同名前缀', () => {
    expect(isDescendantOf('技术/前端', '技术')).toBe(true)
    expect(isDescendantOf('技术', '技术')).toBe(false)
    // 「技术支持」不是「技术」的子目录——路径边界必须按段切
    expect(isDescendantOf('技术支持', '技术')).toBe(false)
  })

  it('拖拽落点：拖到哪个节点就搬进哪个节点', () => {
    expect(dropTargetPath('技术/前端', '归档')).toBe('归档')
  })

  it('拖进自己的子树无效', () => {
    expect(dropTargetPath('技术', '技术/前端')).toBeNull()
    expect(dropTargetPath('技术', '技术')).toBeNull()
  })

  it('原地放手（父级没变）无效', () => {
    expect(dropTargetPath('技术/前端', '技术')).toBeNull()
  })
})
