import { describe, expect, it } from 'vitest'
import { fetchDocxImage, publicImageAddress } from '../services/docx-image-fetch.js'

describe('DOCX remote image boundary', () => {
  it('rejects loopback, private, link-local, and mapped addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '192.168.1.3',
      '169.254.1.2',
      '::1',
      'fc00::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(publicImageAddress(address)).toBe(false)
    }
    expect(publicImageAddress('1.1.1.1')).toBe(true)
    expect(publicImageAddress('2606:4700:4700::1111')).toBe(true)
  })

  it('never opens local, credentialed, or non-HTTP URLs', async () => {
    await expect(fetchDocxImage('http://127.0.0.1/private.png')).rejects.toThrow('私网')
    await expect(fetchDocxImage('http://localhost/private.png')).rejects.toThrow('内网')
    await expect(fetchDocxImage('https://u:p@example.com/x.png')).rejects.toThrow('无账号密码')
    await expect(fetchDocxImage('file:///etc/passwd')).rejects.toThrow('HTTP(S)')
  })
})
