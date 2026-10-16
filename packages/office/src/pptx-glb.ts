/** Bounded self-contained glTF 2.0 binary; external URLs and decoder downloads are excluded. */
function recordOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('GLB 对象结构无效')
  return value as Record<string, unknown>
}
function boundedList(value: unknown, max: number): unknown[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > max) throw new Error('GLB 数据列表无效或过大')
  return value
}
function visitGlb(value: unknown, depth: number): void {
  if (depth > 40) throw new Error('GLB 结构过深')
  if (!value || typeof value !== 'object') return
  for (const [key, item] of Object.entries(value)) {
    if (
      key === 'uri' &&
      (typeof item !== 'string' ||
        !/^data:(image\/(png|jpeg|webp)|application\/(octet-stream|gltf-buffer));base64,[A-Za-z0-9+/=]+$/.test(
          item,
        ))
    )
      throw new Error('GLB 必须自包含，不能引用外部文件或网址')
    visitGlb(item, depth + 1)
  }
}
export function validatePptxGlb(bytes: Uint8Array): void {
  if (bytes.length < 28 || bytes.length > 32 * 1024 * 1024)
    throw new Error('GLB 文件须在 28 字节至 32 MiB 内')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== bytes.length
  )
    throw new Error('请选择有效的 glTF 2.0 二进制 GLB 文件')
  let at = 12,
    json: unknown,
    binary = 0,
    binarySeen = false
  while (at < bytes.length) {
    if (at + 8 > bytes.length) throw new Error('GLB 数据块不完整')
    const length = view.getUint32(at, true),
      type = view.getUint32(at + 4, true)
    at += 8
    if (length % 4 || at + length > bytes.length) throw new Error('GLB 数据块大小无效')
    if (type === 0x4e4f534a) {
      if (at !== 20 || length > 4 * 1024 * 1024) throw new Error('GLB JSON 数据无效或过大')
      try {
        json = JSON.parse(new TextDecoder().decode(bytes.subarray(at, at + length)).trim())
      } catch {
        throw new Error('GLB JSON 解析失败')
      }
    } else if (type === 0x004e4942 && !binarySeen && json !== undefined) {
      binarySeen = true
      binary = length
    } else throw new Error('GLB 包含不支持或重复的数据块')
    at += length
  }
  const model = recordOf(json)
  if (recordOf(model.asset).version !== '2.0' || !boundedList(model.meshes, 5000).length)
    throw new Error('GLB 没有可预览的 glTF 2.0 模型')
  const extensions = [
    ...boundedList(model.extensionsUsed, 100),
    ...boundedList(model.extensionsRequired, 100),
  ]
  if (extensions.some((name) => typeof name !== 'string')) throw new Error('GLB 扩展列表无效')
  if (
    extensions.some((name) =>
      ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'].includes(
        String(name),
      ),
    )
  )
    throw new Error('此模型需要外部解码器，请先导出为未压缩的 GLB')
  for (const buffer of boundedList(model.buffers, 64)) {
    const item = recordOf(buffer)
    if (
      !Number.isSafeInteger(item.byteLength) ||
      Number(item.byteLength) < 0 ||
      (!item.uri && Number(item.byteLength) > binary)
    )
      throw new Error('GLB 缺少模型二进制数据')
  }
  let components = 0
  for (const accessor of boundedList(model.accessors, 20000)) {
    const item = recordOf(accessor),
      count = Number(item.count)
    if (!Number.isSafeInteger(count) || count < 0 || count > 4_000_000)
      throw new Error('GLB 顶点或索引数量超出上限')
    components += count * 16
  }
  if (components > 32_000_000) throw new Error('GLB 解码数据超出处理上限')
  boundedList(model.nodes, 20000)
  boundedList(model.images, 256)
  boundedList(model.textures, 256)
  visitGlb(model, 0)
}
