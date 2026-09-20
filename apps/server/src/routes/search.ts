import { Hono } from 'hono'
import { searchQuerySchema } from '@mimir/shared'
import { parseInput } from '../lib/http.js'
import { search } from '../search/index.js'
import type { AppEnv } from '../types.js'

export const searchRoute = new Hono<AppEnv>()

searchRoute.get('/', async (c) => {
  const input = await parseInput(c, 'query', searchQuerySchema)
  return c.json(await search(input))
})
