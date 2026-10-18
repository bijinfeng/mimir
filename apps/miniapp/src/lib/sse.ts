/** Incremental UTF-8 without TextDecoder (not available in all WeChat JavaScript engines). */
export class Utf8Decoder {
  private pending: number[] = []
  decode(buffer: ArrayBuffer, final = false) {
    const bytes = this.pending.concat(Array.from(new Uint8Array(buffer)))
    this.pending = []
    let text = ''
    let index = 0
    while (index < bytes.length) {
      const first = bytes[index]!
      const length =
        first < 0x80
          ? 1
          : first >= 0xc2 && first <= 0xdf
            ? 2
            : first >= 0xe0 && first <= 0xef
              ? 3
              : first >= 0xf0 && first <= 0xf4
                ? 4
                : 0
      if (!length) {
        text += '\uFFFD'
        index++
        continue
      }
      if (index + length > bytes.length) {
        if (!final) this.pending = bytes.slice(index)
        else text += '\uFFFD'
        break
      }
      let point = first & (length === 1 ? 0x7f : (1 << (7 - length)) - 1)
      let valid = true
      for (let offset = 1; offset < length; offset++) {
        const next = bytes[index + offset]!
        if ((next & 0xc0) !== 0x80) {
          valid = false
          break
        }
        point = (point << 6) | (next & 0x3f)
      }
      if (
        !valid ||
        (length === 2 && point < 0x80) ||
        (length === 3 && point < 0x800) ||
        (length === 4 && point < 0x10000) ||
        point > 0x10ffff ||
        (point >= 0xd800 && point <= 0xdfff)
      ) {
        text += '\uFFFD'
        index++
        continue
      }
      text += String.fromCodePoint(point)
      index += length
    }
    return text
  }
}
export class SseParser {
  private buffer = ''
  private data: string[] = []
  private first = true
  private onData: (data: string) => void
  constructor(onData: (data: string) => void) {
    this.onData = onData
  }
  push(text: string) {
    if (this.first && text) {
      this.first = false
      text = text.replace(/^\uFEFF/, '')
    }
    this.buffer += text
    let match: RegExpExecArray | null
    while ((match = /\r\n|\n|\r/.exec(this.buffer))) {
      if (match[0] === '\r' && match.index === this.buffer.length - 1) break
      const line = this.buffer.slice(0, match.index)
      this.buffer = this.buffer.slice(match.index + match[0].length)
      this.line(line)
    }
  }
  private line(line: string) {
    if (!line) {
      if (this.data.length) this.onData(this.data.join('\n'))
      this.data = []
      return
    }
    if (line.startsWith(':')) return
    const colon = line.indexOf(':')
    const field = colon < 0 ? line : line.slice(0, colon)
    let value = colon < 0 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'data') this.data.push(value)
  }
  finish() {
    // A final unterminated event is deliberately not dispatched: it may be a truncated frame.
    if (this.buffer === '\r') {
      this.buffer = ''
      this.line('')
    }
  }
}

/** Only the server's persisted RUN_FINISHED confirms a complete run. */
export class RunCompletion {
  private finished = false
  private failed = false
  receive(type: string) {
    if (type === 'RUN_FINISHED') this.finished = true
    if (type === 'RUN_ERROR') this.failed = true
  }
  fail() {
    this.failed = true
  }
  get complete() {
    return this.finished && !this.failed
  }
}
