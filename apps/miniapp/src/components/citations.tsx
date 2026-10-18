import { View, Text, ScrollView } from '@tarojs/components'
import type { Citation } from '@mimir/shared/miniapp'
import { Action } from './ui'
import { openReader } from '../lib/navigation'
export function Citations({
  items,
  selected,
  onSelect,
  onClose,
}: {
  items: Citation[]
  selected: number | null
  onSelect: (index: number | null) => void
  onClose: () => void
}) {
  const visible =
    selected === null
      ? items.map((item, index) => ({ item, index }))
      : items[selected]
        ? [{ item: items[selected]!, index: selected }]
        : []
  return (
    <View className="sheet-mask" onClick={onClose}>
      <View className="sheet" onClick={(event) => event.stopPropagation()}>
        <View className="toolbar">
          <Text className="section-title">
            {selected === null ? `全部来源 (${items.length})` : `来源 ${selected + 1}`}
          </Text>
          <Action onClick={onClose}>关闭</Action>
        </View>
        {selected !== null && <Action onClick={() => onSelect(null)}>查看全部来源</Action>}
        <ScrollView scrollY className="sheet-scroll">
          {visible.map(({ item, index }) => (
            <View className="source-row" key={`${item.documentId}:${index}`}>
              <Text className="row-title">
                {index + 1}. {item.title}
              </Text>
              <Text className="block source-snippet" selectable>
                {item.snippet}
              </Text>
              <Text className="block muted row-meta">回答时的来源片段</Text>
              <Action
                onClick={() => {
                  void openReader(item.documentId, item)
                }}
              >
                打开原文
              </Action>
            </View>
          ))}
          {!visible.length && <Text className="muted">此回答没有可用引用。</Text>}
        </ScrollView>
      </View>
    </View>
  )
}
