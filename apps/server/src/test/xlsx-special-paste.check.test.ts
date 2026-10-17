import { expect, it } from 'vitest'
import { readXlsxRangeXmlTree } from '../../../../packages/office/src/xlsx-native-xml.js'
import { planXlsxRangeRules, xlsxNativeRuleReaders } from '../services/xlsx-range-rules.js'
import { planXlsxPasteGeometry } from '../services/xlsx-special-paste.js'

it.each(['all', 'format', 'besides-border'] as const)(
  'independent %s tiling keeps statistical CF and DV in one source-rule domain',
  (mode) => {
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    const source = `<worksheet xmlns="${ns}"><sheetData/><conditionalFormatting sqref="A1:C3"><cfRule type="aboveAverage" priority="1" aboveAverage="1"/></conditionalFormatting><dataValidations count="1"><dataValidation type="decimal" operator="greaterThan" sqref="A2:B2"><formula1>0</formula1></dataValidation></dataValidations></worksheet>`
    const target = `<worksheet xmlns="${ns}"><sheetData/></worksheet>`
    const geometry = planXlsxPasteGeometry('A1:C3', 'E5:J10', 'copy', mode)
    const plan = planXlsxRangeRules(
      {
        sheets: [
          { entry: 'source', name: '来源', xml: source },
          { entry: 'target', name: '目标', xml: target },
        ],
        source: { entry: 'source', bounds: geometry.source },
        target: { entry: 'target', bounds: geometry.target },
        move: false,
        kinds: mode === 'format' ? ['cf'] : ['cf', 'dv'],
        tiles: geometry.tiles,
      },
      xlsxNativeRuleReaders(),
    )
    expect(plan.replacements.has('source')).toBe(false)
    const root = readXlsxRangeXmlTree(plan.replacements.get('target')!)
    const statistical = root.children.filter((node) => node.local === 'conditionalFormatting')
    expect(statistical).toHaveLength(1)
    expect(statistical[0]!.attrs.get('sqref')).toBe('E5:G7 H5:J7 E8:G10 H8:J10')
    expect(statistical[0]!.children).toHaveLength(1)
    expect(statistical[0]!.children[0]!.attrs.get('type')).toBe('aboveAverage')
    const validations = root.children.filter((node) => node.local === 'dataValidations')
    const verify = {
      all: () => {
        expect(validations).toHaveLength(1)
        expect(validations[0]!.children).toHaveLength(1)
        expect(validations[0]!.children[0]!.attrs.get('sqref')).toBe('E6:F6 H6:I6 E9:F9 H9:I9')
      },
      format: () => {
        expect(validations).toHaveLength(0)
      },
      'besides-border': () => {
        expect(validations).toHaveLength(1)
        expect(validations[0]!.children).toHaveLength(1)
        expect(validations[0]!.children[0]!.attrs.get('sqref')).toBe('E6:F6 H6:I6 E9:F9 H9:I9')
      },
    }
    verify[mode]()
  },
)
