import { Image } from '@tarojs/components'
import icon from '../assets/brand/icon.png'

/** 本地 PNG 由统一矢量源生成；相邻已有 mimir 文字，标记仅作装饰。 */
export function MiniappBrandMark() {
  return <Image className="brand-mark" src={icon} mode="aspectFit" aria-hidden="true" />
}
