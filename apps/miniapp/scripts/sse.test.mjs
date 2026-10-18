import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Utf8Decoder, SseParser, RunCompletion } from '../src/lib/sse.ts'
const encode = (text) => new TextEncoder().encode(text)
const arrayBuffer = (bytes) => Uint8Array.from(bytes).buffer

test('UTF-8 preserves Chinese and emoji at every possible chunk boundary', () => {
  const input = '中文问答🙂𠮷\n引用 [1] café'
  const bytes = encode(input)
  for (let split = 0; split <= bytes.length; split++) {
    const decoder = new Utf8Decoder()
    const output =
      decoder.decode(arrayBuffer(bytes.slice(0, split))) +
      decoder.decode(arrayBuffer(bytes.slice(split)), true)
    assert.equal(output, input, `split ${split}`)
  }
  const decoder = new Utf8Decoder()
  assert.equal(
    Array.from(bytes, (byte) => decoder.decode(arrayBuffer([byte]))).join('') +
      decoder.decode(new ArrayBuffer(0), true),
    input,
  )
})

test('unfinished and invalid UTF-8 are replaced instead of silently lost', () => {
  const decoder = new Utf8Decoder()
  assert.equal(decoder.decode(arrayBuffer([0xf0, 0x9f])), '')
  assert.equal(decoder.decode(new ArrayBuffer(0), true), '\uFFFD')
  assert.equal(new Utf8Decoder().decode(arrayBuffer([0x61, 0xff, 0x62]), true), 'a\uFFFDb')
})

test('SSE buffers CRLF, comments, multiline data and UTF-8 byte fragments', () => {
  const source =
    '\uFEFF: ping\r\nevent: message\r\ndata: {"type":"TEXT_MESSAGE_CONTENT",\r\ndata: "delta":"中文🙂"}\r\n\r\ndata: {"type":"RUN_FINISHED"}\r\n\r\n'
  const frames = []
  const parser = new SseParser((data) => frames.push(JSON.parse(data)))
  const decoder = new Utf8Decoder()
  for (const byte of encode(source)) parser.push(decoder.decode(arrayBuffer([byte])))
  parser.push(decoder.decode(new ArrayBuffer(0), true))
  parser.finish()
  assert.deepEqual(frames, [
    { type: 'TEXT_MESSAGE_CONTENT', delta: '中文🙂' },
    { type: 'RUN_FINISHED' },
  ])
})

test('incomplete SSE frame never invents a completed run', () => {
  const frames = []
  const parser = new SseParser((data) => frames.push(data))
  parser.push('data: {"type":"TEXT_MESSAGE_CONTENT","delta":"部分"}\n\n')
  parser.push('data: {"type":"RUN_FINISHED"}')
  parser.finish()
  assert.equal(frames.length, 1)
  const completion = new RunCompletion()
  frames.forEach((data) => completion.receive(JSON.parse(data).type))
  completion.receive('TEXT_MESSAGE_END')
  assert.equal(completion.complete, false)
})

test('run errors remain failures even if a later terminal event arrives', () => {
  const completion = new RunCompletion()
  completion.receive('RUN_ERROR')
  completion.receive('RUN_FINISHED')
  assert.equal(completion.complete, false)
  const success = new RunCompletion()
  success.receive('RUN_FINISHED')
  assert.equal(success.complete, true)
  const invalid = new RunCompletion()
  invalid.fail()
  invalid.receive('RUN_FINISHED')
  assert.equal(invalid.complete, false)
})
