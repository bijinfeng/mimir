import { activeStorage } from '../plugins/host.js'

/**
 * 头像的存储层（`docs/TECH.md` §12.6、D-036）。
 *
 * ## 固定文件名，覆盖写
 *
 * `<userId>.webp`（或 png / jpeg）。这样「换头像」永远不会攒孤儿文件，
 * 也就不需要「找到旧文件并删掉」这个会失败的动作。
 *
 * 代价是**浏览器会一直显示缓存里的旧图**——文件名没变。解法是把版本
 * 放进 URL（`/api/avatar?v=...`），由 `user.image` 那一行充当缓存键。
 * 这个坑在 §10 的坑表里记着，因为它的症状（「上传没反应」）
 * 与原因（HTTP 缓存）隔得很远。
 *
 * ## 存在 `avatars/` 前缀下，不在 vault 里
 *
 * 头像不是内容：不该被 jieba 分词进 `search_text`（铁律 4 的边界），
 * 也不该进导出包——导出回答的是「我的知识」，不是「我的账户」。
 *
 * 换到存储接缝之后这条边界由**前缀**继续保证：头像在 `avatars/`，
 * 内容在 `vault/`，而 `vault-index` 只遍历后者。原先靠两个独立目录，
 * 现在靠同一个根下的两个前缀，语义一样而少一处配置
 * （`docs/RESEARCH.md` §10.10 记了三个目录各自默认带来的那个缺陷）。
 */

/** 头像的 key 前缀。与 vault 分开的边界见文件头注释 */
const AVATAR_PREFIX = 'avatars'

/** 允许的扩展名。**从 MIME 映射，不从文件名取**——文件名是用户可控的 */
const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

/**
 * 允许的 id 形状。
 *
 * Better Auth 默认用 nanoid（字母数字与 `-`、`_`），但**不能假设**——
 * 这个字符串会进存储 key，所以拒绝任何可能穿越目录的字符。
 * 与本地后端的 `resolveKey` 是同一条防线，只是这里更简单：
 * 一个用户一个文件，形状可以先卡死。
 */
function safeId(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new Error(`用户 id 形状异常，拒绝用作文件名：${id}`)
  }
  return id
}

/** id + 扩展名 → 存储 key。扩展名由 MIME 决定，不由调用方给 */
function keyFor(id: string, extension: string): string {
  return `${AVATAR_PREFIX}/${safeId(id)}.${extension}`
}

export interface StoredAvatar {
  data: Uint8Array
  mime: string
}

/**
 * 写头像。
 *
 * **先写临时名再 rename** 的模式这里不做：单用户自托管，上传失败时
 * 最多留下一个半截文件，而下次上传会覆盖它（文件名固定）。
 * 加一层临时文件换来的是「并发上传同一用户」这个不存在的场景下的正确性。
 */
export async function writeAvatar(
  id: string,
  data: Uint8Array,
  mime: string,
): Promise<{ mime: string; path: string }> {
  const extension = EXTENSIONS[mime]
  if (!extension) throw new Error(`不支持的头像类型：${mime}`)

  /**
   * 换格式时要清掉旧扩展名的文件。
   *
   * 不清理的话「png → webp」会留下两个文件，而读取端按当前 `image` 里的
   * 版本去猜扩展名——猜错就是裂图。先删旧再写新，顺序与「删除」那条一致
   * （不要让指针指向不存在的东西：这里还没有指针，所以先删是安全的）。
   */
  await removeAvatar(id)

  const key = keyFor(id, extension)
  await activeStorage().write(key, data)
  return { mime, path: key }
}

/**
 * 读头像。**按已知的三种扩展名依次找**，而不是从 `user.image` 解析扩展名——
 * 那条 URL 里只有版本号，没有类型。
 *
 * 代价随后端而变，值得知道：本地后端下探测不存在的文件只是一次失败的
 * `open`（几乎免费）；而 S3 后端下每种扩展名就是一次真实的 GET 请求
 * （对象存储没有「只问在不在」的便宜操作，HEAD 也要一次往返）。
 * 最坏情况是 2 次多余的请求，单用户下可接受——但要清楚它不是零成本。
 */
export async function readAvatar(id: string): Promise<StoredAvatar | null> {
  const safe = safeId(id)
  const storage = activeStorage()

  for (const [mime, extension] of Object.entries(EXTENSIONS)) {
    try {
      const data = await storage.read(keyFor(safe, extension))
      return { data, mime }
    } catch {
      // 不存在就试下一种。**不在这里报错**——「没有头像」是正常状态
    }
  }

  return null
}

/**
 * 删除头像。文件不存在时静默通过（「没有头像」不是错误）。
 *
 * 这里能直接 `Promise.all` 而不必各自 catch：`remove` 的契约就是幂等的
 * （`StorageBackend` 的注释），两个后端都原生满足——本地吞掉 `ENOENT`，
 * S3 的 DeleteObject 本来就返回 204。
 */
export async function removeAvatar(id: string): Promise<void> {
  const safe = safeId(id)

  await Promise.all(
    Object.values(EXTENSIONS).map((extension) => activeStorage().remove(keyFor(safe, extension))),
  )
}
