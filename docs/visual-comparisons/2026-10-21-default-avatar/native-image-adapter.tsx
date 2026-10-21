/** DOM adapter for inspecting real miniapp JSX/assets. This is not a WeChat renderer. */
import { createElement, forwardRef, type PropsWithChildren } from 'react'
type NativeProps = PropsWithChildren<Record<string, unknown>>
export const View = forwardRef<HTMLElement, NativeProps>(({ children, ...props }, ref) =>
  createElement('view', { ...props, ref }, children),
)
export const Text = ({ children, ...props }: NativeProps) => createElement('text', props, children)
export const Image = ({
  src,
  style,
  ariaHidden,
}: {
  src: string
  style: object
  ariaHidden?: boolean
}) => <img src={src} style={style} alt="" aria-hidden={ariaHidden} />
