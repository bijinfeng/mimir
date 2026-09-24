import type { DeclarationReader, PluginHost, SettingSpec } from '@mimir/shared'
import { createLocalStorage } from './local.js'
import { createS3Storage, type S3StorageOptions } from './s3.js'

/**
 * 存储后端插件包。
 *
 * ## 为什么这个接缝是单数的（与另外四条不同）
 *
 * 多个 leg 一起跑（融合）、capturer / parser / provider 按来源或角色各选一个——
 * 而存储**任何时刻只有一个在用**，其余是备选。这个差异由 `unavailable(read)`
 * 如实体现：没被选中的后端显示「当前未选中」，而不是也报「可用」。
 *
 * 收下 `read` 是这次改动给契约带来的唯一放宽（`docs/RESEARCH.md` §10.6）：
 * `isProvided` 只能回答「有没有配过」，回答不了「选中了哪个」。
 *
 * ## 数据根为什么不在设置页里
 *
 * `DATA_DIR` 是**部署事实**（`docs/TECH.md` §7.5 的配置分层），与
 * `DATABASE_URL` 同类：改它等于换一整个数据集，出现在界面里就是假表单
 * ——M0 设置页已经用「不画存不进去的表单」否决过这类东西。
 * 所以本地后端的根由宿主通过 `dataDir` 注入，不走设置键。
 *
 * 这也顺带修掉了「三个目录各自独立默认」那个坑：容器里只设了 `VAULT_DIR`
 * 与 `RAW_DIR`、漏了 `AVATARS_DIR` 时，头像会静静地落到容器可写层
 * （`docs/RESEARCH.md` §10.10）。现在只有一个根，漏配在结构上不可能发生。
 */

/** 本地后端没有自己的配置键——根目录由宿主注入 */
const LOCAL_PARAMS: SettingSpec[] = []

const S3_PARAMS: SettingSpec[] = [
  {
    key: 'storage.s3.endpoint',
    label: '端点地址',
    description: 'MinIO / R2 / 各家的兼容端点，形如 https://s3.example.com。留空则走 AWS 官方端点',
    group: 'storage',
    type: 'string',
    envName: 'S3_ENDPOINT',
    defaultValue: '',
    rebuild: 'none',
    validate: (value) => {
      const text = String(value).trim()
      // 留空是合法值（用 AWS 官方端点），但填了就必须是 http(s) 地址——
      // 少了协议头时 SDK 会抛一个「Invalid URL」，那句话对用户毫无帮助
      if (text !== '' && !/^https?:\/\//i.test(text)) {
        return '必须以 http:// 或 https:// 开头（留空表示用 AWS 官方端点）'
      }
      return null
    },
  },
  {
    key: 'storage.s3.region',
    label: '区域',
    description: '桶所在区域。自建端点也要一个非空值（MinIO 通常用 us-east-1）',
    group: 'storage',
    type: 'string',
    envName: 'S3_REGION',
    defaultValue: 'us-east-1',
    rebuild: 'none',
    validate: (value) => (String(value).trim() === '' ? '不能为空' : null),
  },
  {
    key: 'storage.s3.bucket',
    label: '桶名',
    description: '已存在的桶。mimir 不会自动创建它，也不假设你有建桶的权限',
    group: 'storage',
    type: 'string',
    envName: 'S3_BUCKET',
    defaultValue: '',
    rebuild: 'none',
  },
  {
    key: 'storage.s3.accessKeyId',
    label: 'Access Key ID',
    description: '只存服务端。界面上会明文显示——它不是密钥，但要和下面那把配成一对',
    group: 'storage',
    type: 'string',
    envName: 'S3_ACCESS_KEY_ID',
    defaultValue: '',
    rebuild: 'none',
  },
  {
    key: 'storage.s3.secretAccessKey',
    label: 'Secret Access Key',
    description: '加密后存库，绝不下发浏览器。与模型的 API 密钥走同一套加密与同一个密钥',
    group: 'storage',
    type: 'secret',
    envName: 'S3_SECRET_ACCESS_KEY',
    defaultValue: '',
    rebuild: 'none',
  },
  {
    key: 'storage.s3.pathStyle',
    label: '路径风格寻址',
    description:
      '自建端点通常需要打开（endpoint/bucket/key）。关掉会用虚拟主机风格（bucket.endpoint/key），那要求 DNS 能解析桶名前缀',
    group: 'storage',
    type: 'boolean',
    envName: 'S3_PATH_STYLE',
    defaultValue: true,
    rebuild: 'none',
  },
  {
    key: 'storage.s3.prefix',
    label: '桶内前缀',
    description: '所有对象都放在这个前缀下，方便与别的数据共用一个桶。留空则放在桶根',
    group: 'storage',
    type: 'string',
    envName: 'S3_PREFIX',
    defaultValue: 'mimir',
    rebuild: 'none',
  },
]

/**
 * 未选中的后端给出的理由。
 *
 * 抽成一个函数而不是内联两处：两个实现要说的话**必须一致**，
 * 否则「正在用 local」与「正在用 S3」会变成两句不同意境的文案。
 */
function notSelected(read: DeclarationReader, self: string): string | null {
  const selected = String(read.get('storage.backend') ?? 'local').trim() || 'local'
  if (selected === self) return null
  return `当前未选中（正在用 ${selected}）。上面的「存储后端」决定用哪个`
}

export interface StoragePluginOptions {
  /**
   * 本地后端的根：`DATA_DIR` 的绝对路径。
   * key 是相对它的路径，于是 `vault/x.md` → `<dataDir>/vault/x.md`。
   */
  dataDir: string
}

export function install(host: PluginHost, options: StoragePluginOptions): void {
  host.storage(
    {
      seam: 'storage',
      id: 'local',
      name: '本地磁盘',
      description:
        '数据就是磁盘上的普通文件（data/），可以直接用 Typora / Obsidian 打开，也可以交给 git 版本管理。默认后端',
      file: 'plugins/storage/src/local.ts',
      configKeys: [],
      params: LOCAL_PARAMS,
      // 本地后端没有「缺配置」这种状态：根由部署决定，且启动时已校验存在
      unavailable: (read) => notSelected(read, 'local'),
    },
    createLocalStorage({ root: options.dataDir }),
  )

  host.storage(
    {
      seam: 'storage',
      id: 's3',
      name: 'S3 / 对象存储',
      description:
        '笔记、原始快照与头像放进任意 S3 兼容的对象存储（AWS S3、MinIO、Cloudflare R2 等）。适合部署在 VPS 上的场景',
      file: 'plugins/storage/src/s3.ts',
      configKeys: S3_PARAMS.map((spec) => spec.key),
      params: S3_PARAMS,
      /**
       * 缺任一个就不能干活。
       *
       * `prefix` 与 `pathStyle` 有可用的默认值，所以不列进来——
       * `requires` 的判据是「有没有人**显式**配过」，把带默认值的键放进来
       * 会让这个后端永远显示「待配置」（`docs/TECH.md` §7.4）。
       */
      requires: ['storage.s3.bucket', 'storage.s3.accessKeyId', 'storage.s3.secretAccessKey'],
      unavailable: (read) => notSelected(read, 's3'),
    },
    /**
     * 配置**每次操作现读**，不在这里解析成静态值。
     *
     * 三个理由：
     *  1. `secretAccessKey` 要解密，只能异步取；契约还明确要求
     *     「只在即将发请求的那一刻调用，不要缓存」
     *  2. 插件在 `install()` 期间拿不到设置层（延迟绑定，见 `host.ts`）
     *  3. 改完设置不必重启——与另外四条接缝的行为一致
     */
    createS3Storage(async (): Promise<S3StorageOptions | null> => {
      const settings = host.settings

      // 三把配齐了才有意义。缺任何一个都返回 null，由实现给出可读的报错，
      // 而不是让 SDK 抛 `undefined is not a string`
      const bucket = (await settings.getString('storage.s3.bucket')).trim()
      const accessKeyId = (await settings.getString('storage.s3.accessKeyId')).trim()
      const secret = await settings.getSecret('storage.s3.secretAccessKey')

      if (!bucket || !accessKeyId || !secret.ok) return null

      return {
        bucket,
        accessKeyId,
        secretAccessKey: secret.value,
        endpoint: await settings.getString('storage.s3.endpoint'),
        region: await settings.getString('storage.s3.region'),
        pathStyle: await settings.getBoolean('storage.s3.pathStyle'),
        prefix: await settings.getString('storage.s3.prefix'),
      }
    }),
  )
}
