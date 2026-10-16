import { describe, expect, it } from 'vitest'
import { readXlsxFormats, formatXlsxNumber } from './xlsx-format.js'

describe('XLSX explicit cell styles', () => {
  it('resolves indirect font/fill/border indexes, theme tint, alignment and escaped custom number format', () => {
    const xml =
      '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="0.00 &quot;元&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><i/><u/><strike/><sz val="18"/><name val="宋体"/><color theme="4" tint="0.5"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFCCDD00"/></patternFill></fill></fills><borders count="2"><border/><border><bottom style="double"><color rgb="FF112233"/></bottom></border></borders><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="164" fontId="1" fillId="2" borderId="1"><alignment horizontal="center" vertical="top" wrapText="1" textRotation="135" indent="2"/></xf></cellXfs></styleSheet>'
    const formats = readXlsxFormats(
      xml,
      '<a:theme><a:accent1><a:srgbClr val="204060"/></a:accent1></a:theme>',
    )
    expect(formats[1]).toMatchObject({
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      fontSize: 18,
      fontFamily: '宋体',
      fontColor: '#90A0B0',
      fillColor: '#CCDD00',
      horizontalAlign: 'center',
      verticalAlign: 'top',
      wrapText: true,
      textRotation: -45,
      indent: 2,
      numberFormat: '0.00 "元"',
      borders: { bottom: '3px double #112233' },
    })
    expect(formats[0]?.bold).toBe(false)
    expect(formatXlsxNumber('12.3', formats[1]?.numberFormat)).toBe('12.30 元')
  })
  it('formats dates and percentages from explicit formats, leaving raw and unknown formats intact', () => {
    expect(formatXlsxNumber('0.25', '0%')).toBe('25%')
    expect(formatXlsxNumber('45292', 'yyyy-mm-dd')).toBe('2024-01-01')
    expect(formatXlsxNumber('not a number', '0.00')).toBe('not a number')
    expect(formatXlsxNumber('42')).toBe('42')
  })
  it('converts only active calendar dates for the 1904 epoch, preserving time/duration and numeric sections', () => {
    expect(formatXlsxNumber('0', 'yyyy-mm-dd', true)).toBe('1904-01-01')
    expect(formatXlsxNumber('43830.5', 'yyyy-mm-dd hh:mm', true)).toBe('2024-01-01 12:00')
    expect(formatXlsxNumber('0.5', 'hh:mm', true)).toBe('12:00')
    expect(formatXlsxNumber('2.5', '[h]:mm', true)).toBe('60:00')
    expect(formatXlsxNumber('1', '0.00', true)).toBe('1.00')
    expect(formatXlsxNumber('1', '[<10]yyyy-mm-dd;0', true)).toBe('1904-01-02')
    expect(formatXlsxNumber('11', '[<10]yyyy-mm-dd;0', true)).toBe('11')
    expect(formatXlsxNumber('0', '0;0;yyyy-mm-dd', true)).toBe('1904-01-01')
    expect(formatXlsxNumber('1', '"literal;"yyyy-mm-dd', true)).toBe('literal;1904-01-02')
  })
})
