import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createS3Storage } from './s3.js'

const endpoint = process.env.MIMIR_S3_TEST_ENDPOINT
const accessKeyId = process.env.MIMIR_S3_TEST_ACCESS_KEY
const secretAccessKey = process.env.MIMIR_S3_TEST_SECRET_KEY
const enabled = Boolean(endpoint && accessKeyId && secretAccessKey)

/** 显式 opt-in：只对隔离测试桶操作，默认的单元测试不接触外部存储。 */
describe.skipIf(!enabled)('S3 兼容端点集成验证', () => {
  const bucket = `mimir-test-${Date.now()}`
  const prefix = 'integration'
  let client: S3Client
  let bucketCreated = false

  const storage = createS3Storage(async () => ({
    bucket,
    endpoint: endpoint!,
    region: 'us-east-1',
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    pathStyle: true,
    prefix,
  }))

  beforeAll(async () => {
    client = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
    await client.send(new CreateBucketCommand({ Bucket: bucket }))
    bucketCreated = true
  })

  afterAll(async () => {
    if (!client) return
    try {
      if (!bucketCreated) return
      while (true) {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket }))
        const objects = (page.Contents ?? []).flatMap((item) =>
          item.Key ? [{ Key: item.Key }] : [],
        )
        if (objects.length === 0) break
        await client.send(
          new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }),
        )
      }
      await client.send(new DeleteBucketCommand({ Bucket: bucket }))
    } finally {
      client.destroy()
    }
  })

  it('往返字节、中文 key 复制、幂等删除与探针', async () => {
    const key = 'vault/中文旧名.md'
    const next = 'vault/中文新名.md'
    const bytes = new TextEncoder().encode('中文正文\n第二行')
    await storage.write(key, bytes)
    expect(await storage.read(key)).toEqual(bytes)
    await storage.move(key, next)
    await expect(storage.read(key)).rejects.toThrow(/NoSuchKey|中文旧名/)
    expect(await storage.read(next)).toEqual(bytes)
    await storage.remove(next)
    await storage.remove(next)
    expect((await storage.probe?.())?.ok).toBe(true)
  })

  it('LIST 跨过 1000 项边界且不返回桶内前缀', async () => {
    const keys = Array.from(
      { length: 1002 },
      (_, index) => `${prefix}/uploads/pagination/file-${String(index).padStart(4, '0')}.txt`,
    )
    for (let start = 0; start < keys.length; start += 50) {
      await Promise.all(
        keys
          .slice(start, start + 50)
          .map((key) => client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: 'x' }))),
      )
    }
    const listed = await storage.list('uploads/pagination')
    expect(listed).toHaveLength(keys.length)
    expect(listed).toContain('uploads/pagination/file-0000.txt')
    expect(listed).toContain('uploads/pagination/file-1001.txt')
    expect(listed.every((key) => !key.startsWith(`${prefix}/`))).toBe(true)
  })
})
