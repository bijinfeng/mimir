import { SEARCH_ONLY_RESULT_TEXT, type Citation } from '@mimir/shared'

/** 检索原文由引用卡展示，正文只说明本轮结果与模型调用状态。 */
export function searchOnlyAnswer(citations: Citation[]): string {
  if (citations.length === 0) {
    return '未找到相关内容，未调用模型。试试其他关键词，或检查文档是否已建立索引。'
  }

  return SEARCH_ONLY_RESULT_TEXT
}
