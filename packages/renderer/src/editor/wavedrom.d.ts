declare module 'wavedrom' {
  export type Onml = [string, Record<string, unknown>, ...unknown[]]
  export const waveSkin: Record<string, Onml>
  export function renderAny(index: number, source: object, skin: Record<string, Onml>): Onml
  export const onml: { stringify(tree: Onml): string }
}
