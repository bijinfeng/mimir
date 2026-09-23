import { Hono } from 'hono'
import type { RuntimeConfig } from '@mimir/shared'
import { env } from '../env.js'
import { retrievalLegs } from '../plugins/leg/index.js'
import { PER_LEG_LIMIT } from '../search/index.js'
import { RRF_K } from '../search/fuse.js'
import type { AppEnv } from '../types.js'

/**
 * 生效中的运行时配置，**只读**。
 *
 * 存在的理由：设置页要显示「哪些模型在干活、融合参数是多少」，
 * 而这些值的真相都在服务端（环境变量与代码常量）。前端硬编码一份副本
 * 就会漂移——改了 `MODEL_CHAT_MODEL` 之后设置页仍显示默认值，
 * 界面看起来很好，只是说的不是真的。
 *
 * 四个与设置页无关的性质，都是刻意的：
 *
 *  1. **只读。** 没有写入端点，因为配置的真相在 `.env` 与代码里。
 *     做成可写的就等于让界面成为第二个真相来源，那是另一半麻烦
 *  2. **不含密钥。** 只回 baseURL 与模型名（见 shared 的注释）
 *  3. **与 `/maintenance` 分开。** 那条是「会改数据」的动作，这条只是读
 *  4. **值取自运行时对象本身**（`env` / `retrievalLegs` / `RRF_K`），
 *     不是重新写一遍常量——否则又制造了一份会漂移的副本
 */
export const configRoute = new Hono<AppEnv>()

configRoute.get('/', (c) => {
  const config: RuntimeConfig = {
    models: {
      // 与 assistant-stream.ts 的判断保持一致：缺 key 或缺 baseURL 都算没配
      configured: Boolean(env.modelApiKey && env.modelBaseUrl),
      provider: env.modelProviderName,
      baseUrl: env.modelBaseUrl,
      chat: env.modelChatModel,
      reasoning: env.modelReasoningModel,
    },
    retrieval: {
      rrfK: RRF_K,
      perLegLimit: PER_LEG_LIMIT,
      legs: retrievalLegs.map((leg) => ({ name: leg.name, weight: leg.weight })),
    },
  }

  return c.json(config)
})
