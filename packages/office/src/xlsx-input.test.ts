import { expect, it } from 'vitest'
import { parseXlsxInput } from './xlsx-input.js'
it('parses typed numeric and boolean cells and preserves explicit text and nonnumeric input', () => {
  expect(parseXlsxInput(' 12.50 ')).toBe(12.5)
  expect(parseXlsxInput('1.2e3')).toBe(1200)
  expect(parseXlsxInput('TRUE')).toBe(true)
  expect(parseXlsxInput('false')).toBe(false)
  expect(parseXlsxInput("'00123")).toBe('00123')
  expect(parseXlsxInput("'=SUM(A1:A3)")).toBe('=SUM(A1:A3)')
  expect(parseXlsxInput('1e999')).toBe('1e999')
  expect(parseXlsxInput('')).toBe('')
  expect(parseXlsxInput('12,30')).toBe('12,30')
})
