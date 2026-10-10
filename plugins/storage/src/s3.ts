import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { StorageBackend, StorageProbe } from '@mimir/shared'

/**
 * S3（以及所有兼容实现）后端。
 *
 * ## 与本地后端的四处实质差异
 *
 * | | 本地 | S3 |
 * |---|---|---|
 * | 改名 | `rename(2)`，原子 | 复制 + 删除，**不原子** |
 * | 列举 | `readdir` 递归 | LIST + **翻页**（每次最多 1000） |
 * | 空的父前缀 | `mkdir` 造出来 | 本来就不存在 |
 * | 「文件没了」 | `ENOENT` | `NoSuchKey` |
 *
 * 前两条各有专门处理，见 `move` 与 `list`。
 *
 * ## 兼容性：一行配置换来的
 *
 * `@aws-sdk/client-s3` 从 3.729.0 起**默认给上传加 `x-amz-checksum-crc32`**，
 * 而不少 S3 兼容实现（旧 MinIO、各类网关、Cloudflare R2）不认这个头。
 * LobeHub 为此提过 PR 5479，LobeChat 的注释直接写着
 * 「temporarily disable S3 client integrity check for Cloudflare R2」
 * （`docs/RESEARCH.md` §10.11）。
 *
 * `requestChecksumCalculation: 'WHEN_REQUIRED'` 就是那个开关，
 * 所以这不是选 SDK 的代价，只是一行配置。
 *
 * ## 一致性：铁律 2 在这里仍然成立
 *
 * AWS 明确保证 PUT / DELETE 的强 read-after-write、单 key 覆盖是原子的
 * （「you will get either the old data or the new data, but never partial
 * or corrupt data」）。所以**「先文件后数据库」不需要为 S3 改顺序**。
 *
 * 同一条文档也确认跨 key 没有原子性（「There is no way to make atomic updates
 * across keys」）——那正是 `move` 的失败模式来源。
 */

export interface S3StorageOptions {
  /** 桶名 */
  bucket: string
  /**
   * 自定义端点（MinIO / R2 / 各类兼容服务）。留空走 AWS 官方端点。
   *
   * 注意它是**服务端**用的地址：mimir 不做预签名直传，所以不存在
   * LobeHub 那种「服务端走内网、浏览器走公网」的双端点需求
   * （预签名 URL 的签名绑定 Host，才必须两套客户端）。
   */
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  /**
   * 路径风格寻址。默认为真——自建端点几乎都是这个模式。
   *
   * 两种写法的区别（`docs/RESEARCH.md` §10.7 与 LobeHub 的文档同）：
   * ```
   * path-style:    endpoint/bucket/key
   * virtual-host:  bucket.endpoint/key
   * ```
   * 虚拟主机风格要求 DNS 里能解析 `bucket.` 前缀，自建环境通常没有。
   */
  pathStyle: boolean
  /**
   * 桶内前缀。**这就是为什么用一个桶而不是三个桶**——
   * mimir 的三类文件（笔记 / 原始快照 / 头像）生命周期完全不同，
   * 但共用桶时靠前缀隔离已经足够，且省掉三次配置。
   */
  prefix: string
}

/**
 * 配置怎么拿：**每次操作现读，不缓存明文密钥**。
 *
 * 为什么是一个异步加载器而不是构造时传入静态值：
 *
 * 1. `secretAccessKey` 是加密落库的，取明文要走 `getSecret`（异步），
 *    而且契约明确要求「只在即将发请求的那一刻调用，不要缓存」
 * 2. 插件在 `install()` 期间拿不到设置层（延迟绑定，见 `host.ts`），
 *    构造时根本读不到值
 * 3. 改完设置不必重启——与另外四条接缝的行为一致
 *
 * 返回 null 表示「还没配齐」，调用方给出可读的报错而不是让 SDK 抛
 * `undefined is not a string` 那种查不出所以然的东西。
 */
export type S3ConfigLoader = () => Promise<S3StorageOptions | null>

/** key → 真实的 S3 对象名。前缀在这里拼一次，其它方法不再关心 */
function objectPrefix(prefix: string): string {
  return prefix.trim().replace(/^\/+|\/+$/g, '')
}

/** 端点是否像是本地/自建（http、内网地址）。用于给出更准的报错 */
function looksLocal(endpoint: string): boolean {
  return /^http:\/\//i.test(endpoint) || /:\/\/(127\.|localhost|[\d.]+)/i.test(endpoint)
}

export function createS3Storage(load: S3ConfigLoader): StorageBackend {
  /**
   * 客户端按配置缓存。**密钥变更时重建**——用一个由配置拼出来的指纹做键，
   * 于是「改了凭据」立刻生效，而每次写笔记不必重新构造客户端
   * （S3Client 的构造要建 HTTP agent，不算便宜）。
   *
   * 指纹里含 secret 的哈希而不是明文：这个字符串只活在内存里，
   * 但没必要让它出现在任何可能被打印的地方。
   */
  let cached: { fingerprint: string; client: S3Client; options: S3StorageOptions } | null = null

  async function resolve(): Promise<{ client: S3Client; options: S3StorageOptions }> {
    const options = await load()
    if (!options) {
      throw new Error(
        '存储后端 s3 还没配齐（需要桶名、Access Key ID 与 Secret Access Key）。' +
          '到设置 › 存储填好，或先用本地磁盘',
      )
    }

    const fingerprint = [
      options.bucket,
      options.endpoint,
      options.region,
      options.accessKeyId,
      options.secretAccessKey,
      options.pathStyle,
    ].join('\u0000')

    if (cached?.fingerprint === fingerprint) return cached

    const client = new S3Client({
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      // 空串会让 SDK 拼出 `https://` 这种非法端点，所以留空时必须给 undefined
      endpoint: options.endpoint.trim() || undefined,
      region: options.region || 'us-east-1',
      forcePathStyle: options.pathStyle,
      /**
       * 关闭默认的完整性校验头。见文件头的注释——
       * 少了这两行，Cloudflare R2 一类实现会直接拒收上传。
       */
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })

    cached = { fingerprint, client, options }
    return cached
  }

  return {
    id: 's3',

    async read(key) {
      const { client, options } = await resolve()
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket: options.bucket, Key: joinKey(options.prefix, key) }),
        )

        if (!result.Body) throw new Error('响应里没有内容')

        // SDK 返回的是 SdkStream（Node 下是 Readable）。契约要 Uint8Array，
        // 所以这里一次性读完——单用户笔记在 KB 量级，流式的复杂度不值得
        return await result.Body.transformToByteArray()
      } catch (error) {
        // 兼容端点的 NoSuchKey 文案未必带对象名；存储契约要求错误指出 key。
        throw new Error(`读取 ${key} 失败：${describeS3Error(error, options.bucket)}`, {
          cause: error,
        })
      }
    },

    async write(key, data) {
      const { client, options } = await resolve()
      // string 与 Uint8Array 都能直接给 SDK。显式按 UTF-8 转一次，
      // 让中文笔记在两端表现一致
      const body = typeof data === 'string' ? Buffer.from(data, 'utf8') : data

      await client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: joinKey(options.prefix, key),
          Body: body,
          // 笔记是 Markdown，头像与快照各有各的类型。统一给 octet-stream
          // 会让浏览器/工具在直接取对象时猜错类型
          ContentType: guessContentType(key),
        }),
      )
    },

    async remove(key) {
      const { client, options } = await resolve()
      // S3 的 DeleteObject 对不存在的 key 本来就返回 204，
      // 「幂等」是它的原生行为，不需要额外处理
      await client.send(
        new DeleteObjectCommand({ Bucket: options.bucket, Key: joinKey(options.prefix, key) }),
      )
    },

    async move(from, to) {
      const { client, options } = await resolve()
      const sourceKey = joinKey(options.prefix, from)
      const targetKey = joinKey(options.prefix, to)
      if (sourceKey === targetKey) return

      /**
       * 复制 + 删除。**顺序不能反**：先删后复制的话，复制失败就是数据丢失；
       * 先复制后删除，最坏是留下一个重复文件，而那是可修复的
       * （`reindexVault` 会检测「同一个 id 多个路径」并报出来）。
       *
       * 复制走 `CopyObjectCommand`——**服务端复制**，正文不出对象存储
       * （实测请求体 0 字节，`docs/RESEARCH.md` §10.3a）。不能改成
       * 「先 read 再 write」：那会让正文在网络上走两遍，而且失败时的
       * 中间态更难收拾。
       *
       * copy-source 必须按段 URI 编码：key 里有中文（`slugify` 保留汉字），
       * 不编码时 S3 会按字面量找对象而找不到。
       */
      await client.send(
        new CopyObjectCommand({
          Bucket: options.bucket,
          Key: targetKey,
          CopySource: `/${options.bucket}/${encodeCopySource(sourceKey)}`,
          ContentType: guessContentType(to),
        }),
      )

      await client.send(new DeleteObjectCommand({ Bucket: options.bucket, Key: sourceKey }))
    },

    async list(prefix) {
      const { client, options } = await resolve()
      const found: string[] = []
      const base = prefix.endsWith('/') ? prefix : `${prefix}/`

      /**
       * 递归列举 + 翻页。**不带 `delimiter`**：那会把中间层折叠成
       * `CommonPrefixes`，于是要逐层下钻——实测在深层 vault 上请求数是
       * 递归方式的 2 倍以上（7 个文件：7 次 vs 3 次，`docs/RESEARCH.md` §10.3b）。
       *
       * 代价是必须处理翻页：每次最多 1000 个 key，`IsTruncated` 之后的
       * 内容靠 `ContinuationToken` 拿。漏掉这一段的表现是
       * 「超过 1000 篇之后，重建索引静默漏掉一部分文件」。
       */
      let token: string | undefined
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: options.bucket,
            Prefix: joinKey(options.prefix, base),
            ContinuationToken: token,
          }),
        )

        const stored = objectPrefix(options.prefix)
        for (const item of page.Contents ?? []) {
          // 前缀本身可能作为「目录占位对象」出现在列表里（S3 控制台建目录
          // 会造一个 0 字节的 `foo/` 对象），跳过它
          if (!item.Key || item.Key.endsWith('/')) continue

          // 剥掉桶内前缀，让调用方永远只看见 key
          const stripped =
            stored && item.Key.startsWith(`${stored}/`)
              ? item.Key.slice(stored.length + 1)
              : item.Key
          found.push(stripped)
        }

        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)

      return found
    },

    async probe(): Promise<StorageProbe> {
      let options: S3StorageOptions | null = null
      try {
        options = await load()
        if (!options) {
          return { ok: false, message: '还没配齐：需要桶名、Access Key ID 与 Secret Access Key' }
        }
      } catch (error) {
        return { ok: false, message: describeS3Error(error, '') }
      }

      const key = `.probe/${Date.now().toString(36)}`
      const payload = 'mimir-storage-probe'

      try {
        await this.write(key, payload)
        const readBack = Buffer.from(await this.read(key)).toString('utf8')
        await this.remove(key)

        if (readBack !== payload) {
          return { ok: false, message: '写入后读回的内容不一致' }
        }

        const where = options.endpoint.trim() || 'AWS 官方端点'
        return {
          ok: true,
          message: `写入、读回与删除都成功（${where} / ${options.bucket}）`,
        }
      } catch (error) {
        const reason = describeS3Error(error, options.bucket)
        // 把「常见的配错」再接一句怎么办。存储配错的表现是「保存笔记失败」，
        // 而用户从那一句里看不出是端点、密钥还是桶的问题
        const hint = looksLocal(options.endpoint)
          ? ''
          : '（若用的是自建 S3 服务，检查端点地址与「路径风格」开关）'
        return { ok: false, message: `${reason}${hint}` }
      }
    },
  }
}

/** 桶内前缀与 key 拼接。前缀留空时直接用 key（对象落在桶根） */
function joinKey(prefix: string, key: string): string {
  const stored = objectPrefix(prefix)
  return stored ? `${stored}/${key}` : key
}

/**
 * 把 SDK 的错误翻成一句人话。
 *
 * 为什么值得做：SDK 抛出来的是一整段带 RequestId、HostId、重试建议的文本，
 * 而用户真正需要知道的只有一件事——**是端点、密钥、桶还是权限**，
 * 因为四者的处理动作完全不同。按错误码分类比让用户去读那段文本有用得多。
 */
function describeS3Error(error: unknown, bucket: string): string {
  const raw = error instanceof Error ? error.message : String(error)
  const name = (error as { name?: string })?.name ?? ''

  if (name === 'NoSuchKey' || raw.includes('NoSuchKey')) return '文件不存在'
  if (name === 'InvalidAccessKeyId' || raw.includes('InvalidAccessKeyId')) {
    return 'Access Key ID 无效'
  }
  if (name === 'SignatureDoesNotMatch' || raw.includes('SignatureDoesNotMatch')) {
    return 'Secret Access Key 不正确（签名不匹配）'
  }
  if (name === 'NoSuchBucket' || raw.includes('NoSuchBucket')) {
    return `桶不存在：${bucket}`
  }
  if (name === 'AccessDenied' || raw.includes('AccessDenied')) {
    return `没有权限访问这个桶（${bucket}）`
  }
  return raw
}

/** copy-source 的编码：整体 URI 编码，但保留 `/` 作为路径分隔 */
function encodeCopySource(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

/**
 * 由 key 的后缀猜 Content-Type。
 *
 * 为什么值得做：换成 S3 之后，用户可能直接用浏览器或 `aws s3 cp` 取对象。
 * 一律给 `application/octet-stream` 会让 `.md` 变成下载、图片在浏览器里
 * 不显示——而这是「文件是真相」这条规则在对象存储上的可读性版本。
 */
function guessContentType(key: string): string {
  const extension = key.slice(key.lastIndexOf('.')).toLowerCase()
  switch (extension) {
    case '.md':
      // 必须带 charset：Markdown 里中文很多，不带的话浏览器会按 latin-1 解，
      // 直接取对象时看到的是乱码
      return 'text/markdown; charset=utf-8'
    case '.html':
      return 'text/html; charset=utf-8'
    case '.webp':
      return 'image/webp'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    default:
      return 'application/octet-stream'
  }
}
