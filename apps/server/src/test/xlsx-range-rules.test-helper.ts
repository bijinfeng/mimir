import { parseRange } from '../../../../packages/office/vendor/packages/xlsx-gateway/src/domain/cell-address.js'
import { moveXlsxFormula, qualifyMovedFormula } from '../services/xlsx-manual-ops.js'
import {
  xlsxNativeRuleReaders,
  type XlsxRangeRuleReaders,
  type XlsxRangeRuleRequest,
} from '../services/xlsx-range-rules.js'

/** The same bounded native XML and static-reference readers used by production. */
export function ruleReaders(request: XlsxRangeRuleRequest): XlsxRangeRuleReaders {
  const source = request.sheets.find((sheet) => sheet.entry === request.source.entry)!,
    target = request.sheets.find((sheet) => sheet.entry === request.target.entry)!
  return xlsxNativeRuleReaders((formula, context, relocatedFrom) =>
    moveXlsxFormula(
      relocatedFrom && relocatedFrom !== context
        ? qualifyMovedFormula(formula, relocatedFrom)
        : formula,
      context,
      source.name,
      target.name,
      request.source.bounds,
      request.target.bounds.startRow - request.source.bounds.startRow,
      request.target.bounds.startColumn - request.source.bounds.startColumn,
    ),
  )
}
export const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
export const ruleSheet = (body: string) =>
  `<worksheet xmlns="${MAIN}"><sheetData/>${body}<pageMargins left="0.5"/></worksheet>`
export const cf = (sqref: string, formula = 'A1>0', priority = 1) =>
  `<conditionalFormatting sqref="${sqref}"><cfRule type="expression" priority="${priority}" stopIfTrue="1"><formula>${formula}</formula></cfRule></conditionalFormatting>`
export const dv = (sqref: string, formula = '1', extra = '') =>
  `<dataValidations count="1"><dataValidation type="whole" operator="greaterThan" sqref="${sqref}" ${extra}><formula1>${formula}</formula1></dataValidation></dataValidations>`
export function ruleRequest(
  source: string,
  target = '',
  move = false,
  cross = false,
): XlsxRangeRuleRequest {
  return {
    sheets: [
      { entry: 'source', name: '数据', xml: ruleSheet(source) },
      { entry: 'target', name: '目标', xml: ruleSheet(target) },
    ],
    source: { entry: 'source', bounds: parseRange('A1:C3') },
    target: { entry: cross ? 'target' : 'source', bounds: parseRange('E5:G7') },
    move,
  }
}
