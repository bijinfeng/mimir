import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

/**
 * 密钥的落库加解密（`docs/TECH.md` §7.6）。
 *
 * 两件事是刻意的：
 *
 *  1. **密钥从宿主的 `AUTH_SECRET` 派生**，不引入第二个必填环境变量。
 *     WeKnora 用一个独立的 32 字节 `SYSTEM_AES_KEY`，未设时**退化成明文落库**
 *     （`RESEARCH.md` §1.5）——那是「多一个必填项」换来的一个静默的坑。
 *     本项目已经有且必须有 `AUTH_SECRET`（生产环境不设直接拒绝启动），
 *     用它派生即可，且不存在「忘了设就明文存」的状态。
 *  2. **密文带 `enc:v1:` 前缀**。将来换算法或换派生参数时，
 *     旧值能被识别出来并单独处理，不需要「猜这一列里哪些是旧格式」。
 *
 * 加解密**只用于落库的密钥类设置**，不用于其它任何地方。这不是一套通用的
 * 加密设施——把通用加密做出来，下一步就会有人拿它加密正文。
 */

/** HKDF 的 info，改了它等于让所有已存的密文失效（这正是前缀要解决的问题） */
const HKDF_INFO = 'mimir:settings:secrets:v1'
const PREFIX = 'enc:v1:'
const IV_BYTES = 12
const TAG_BYTES = 16

export interface SecretCipher {
  encrypt(plain: string): string
  decrypt(
    stored: string,
  ): { ok: true; value: string } | { ok: false; reason: 'not-encrypted' | 'corrupted' }
}

export function createSecretCipher(authSecret: string): SecretCipher {
  // 派生一次，之后每次加解密复用：HKDF 不贵，但没有理由每行都算一遍
  const key = Buffer.from(
    hkdfSync('sha256', Buffer.from(authSecret, 'utf8'), Buffer.alloc(0), HKDF_INFO, 32),
  )

  return {
    encrypt(plain) {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()

      return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64')
    },

    decrypt(stored) {
      if (!stored.startsWith(PREFIX)) return { ok: false, reason: 'not-encrypted' }

      try {
        const raw = Buffer.from(stored.slice(PREFIX.length), 'base64')
        const iv = raw.subarray(0, IV_BYTES)
        const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
        const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES)

        const decipher = createDecipheriv('aes-256-gcm', key, iv)
        decipher.setAuthTag(tag)

        return {
          ok: true,
          value: Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'),
        }
      } catch {
        // 解不开就是解不开，不区分「密钥换了」与「数据坏了」——
        // 两者对用户的下一步动作是同一个：重新填写
        return { ok: false, reason: 'corrupted' }
      }
    },
  }
}
