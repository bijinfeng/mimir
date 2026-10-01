import { describe, expect, it } from 'vitest'
import { isDescendantOf, joinPath, nameOf, parentOf } from './folder-ops'

/**
 * 目录路径运算的契约（D-068）。
 *
 * 这些函数决定「改名 / 移动之后，路径怎么改写」，而算错**不会报错**——
 * 只是目录被搬去错误的位置、或 activePath 指向一个不存在的路径。
 * 曾经还有拖拽落点（`dropTargetPath`），随 D-079 的平铺列表一起退场。
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
})
