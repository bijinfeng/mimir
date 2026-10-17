import {
  BookOpen,
  File,
  Globe,
  ListTree,
  Maximize,
  PanelTop,
  PanelsTopLeft,
  ZoomIn,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { ToolbarButton, ToolbarGroup, ToolbarMenu } from '../shell/EditorShell.js'
import { CompactToolbar } from './CompactToolbar.js'
import type { DocxLayout, DocxZoomMode } from './docx-view.js'
export interface DocxViewControlsProps {
  layout: DocxLayout
  reading: boolean
  zoom: number
  zoomMode: DocxZoomMode
  navigation: boolean
  split?: boolean
  onSplit?: () => void
  disabled: boolean
  onLayout: (layout: DocxLayout) => void
  onReading: (reading: boolean) => void
  onZoom: (zoom: number | 'width' | 'page') => void
  onNavigation: () => void
}
export function DocxLayoutControls(props: DocxViewControlsProps) {
  return (
    <ToolbarGroup label="文档视图">
      <ToolbarButton
        label="打印布局"
        active={props.layout === 'print' && !props.reading}
        disabled={props.disabled}
        onClick={() => props.onLayout('print')}
      >
        <File size={14} />
        打印
      </ToolbarButton>
      <ToolbarButton
        label="Web 布局"
        active={props.layout === 'web' && !props.reading}
        disabled={props.disabled}
        onClick={() => props.onLayout('web')}
      >
        <Globe size={14} />
        Web
      </ToolbarButton>
      <ToolbarButton
        label={props.reading ? '退出阅读模式' : '阅读模式'}
        active={props.reading}
        disabled={props.disabled}
        onClick={() => props.onReading(!props.reading)}
      >
        <BookOpen size={14} />
        {props.reading ? '退出阅读' : '阅读'}
      </ToolbarButton>
    </ToolbarGroup>
  )
}
export function DocxZoomControls(props: DocxViewControlsProps) {
  return (
    <ToolbarGroup label="显示比例">
      <ToolbarMenu
        label="文档缩放"
        icon={<ZoomIn size={14} />}
        text={`${Math.round(props.zoom * 100)}%`}
        items={[50, 75, 100, 125, 150, 175, 200].map((value) => ({
          key: String(value),
          label: `${value}%`,
          active: props.zoomMode === 'manual' && Math.round(props.zoom * 100) === value,
          disabled: props.disabled,
          onSelect: () => props.onZoom(value / 100),
        }))}
      />
      <ToolbarButton
        label="实际大小 100%"
        disabled={props.disabled}
        onClick={() => props.onZoom(1)}
      >
        100%
      </ToolbarButton>
      <ToolbarButton
        label="适合页宽"
        active={props.zoomMode === 'width'}
        disabled={props.disabled}
        onClick={() => props.onZoom('width')}
      >
        <PanelTop size={14} />
        页宽
      </ToolbarButton>
      <ToolbarButton
        label="显示整页"
        active={props.zoomMode === 'page'}
        disabled={props.disabled}
        onClick={() => props.onZoom('page')}
      >
        <Maximize size={14} />
        整页
      </ToolbarButton>
    </ToolbarGroup>
  )
}
export function DocxSplitControl(props: DocxViewControlsProps) {
  return (
    <ToolbarButton
      label="拆分视图"
      active={props.split}
      disabled={props.disabled}
      onClick={props.onSplit}
    >
      <PanelsTopLeft size={14} />
      拆分
    </ToolbarButton>
  )
}
export function DocxNavigationControl(props: DocxViewControlsProps) {
  return (
    <ToolbarButton
      label="文档导航"
      active={props.navigation}
      disabled={props.disabled}
      onClick={props.onNavigation}
    >
      <ListTree size={14} />
      导航
    </ToolbarButton>
  )
}
export function DocxReadingControls(
  props: DocxViewControlsProps & { saveAction: ReactNode; exportAction: ReactNode },
) {
  return (
    <div className="mimir-docx-reading-bar" role="toolbar" aria-label="阅读视图">
      <CompactToolbar
        quickAccess={
          <>
            {props.saveAction}
            <ToolbarButton label="退出阅读模式" onClick={() => props.onReading(false)}>
              <BookOpen size={14} />
              退出阅读
            </ToolbarButton>
          </>
        }
        sections={[
          {
            key: 'reading-layout',
            label: '布局',
            minWidth: 150,
            content: (
              <ToolbarGroup label="阅读布局">
                <ToolbarButton
                  label="打印布局"
                  active={props.layout === 'print'}
                  onClick={() => props.onLayout('print')}
                >
                  <File size={14} />
                  打印
                </ToolbarButton>
                <ToolbarButton
                  label="Web 布局"
                  active={props.layout === 'web'}
                  onClick={() => props.onLayout('web')}
                >
                  <Globe size={14} />
                  Web
                </ToolbarButton>
              </ToolbarGroup>
            ),
          },
          {
            key: 'reading-zoom',
            label: '显示比例',
            minWidth: 300,
            content: <DocxZoomControls {...props} />,
          },
          {
            key: 'reading-navigation',
            label: '导航',
            minWidth: 72,
            content: <DocxNavigationControl {...props} />,
          },
          {
            key: 'reading-split',
            label: '拆分',
            minWidth: 72,
            content: <DocxSplitControl {...props} />,
          },
          { key: 'reading-export', label: '导出', minWidth: 100, content: props.exportAction },
        ]}
      />
    </div>
  )
}
