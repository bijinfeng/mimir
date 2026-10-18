import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveServerOrigin } from '../config/server.mjs'

test('unconfigured shell never invents a production server', () => {
  assert.equal(resolveServerOrigin(undefined), '')
  assert.equal(resolveServerOrigin('  '), '')
})

test('fixed origin is normalized, with a non-default HTTPS port retained', () => {
  assert.equal(
    resolveServerOrigin(' https://MIMIR.example.com:8443/ '),
    'https://mimir.example.com:8443',
  )
})

test('rejects credentials, insecure URLs and non-origin configuration', () => {
  for (const value of [
    'http://mimir.example.com',
    'https://owner:secret@mimir.example.com',
    'https://mimir.example.com/api',
    'https://mimir.example.com/?token=secret',
    'https://mimir.example.com/#secret',
    'not a URL',
  ]) {
    assert.throws(() => resolveServerOrigin(value))
  }
})
