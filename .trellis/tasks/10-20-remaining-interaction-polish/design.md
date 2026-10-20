# 设计

## 浮层

- 任务浮层统一沿用现有 library/document 的顶部定位：宽屏 56px，≤700px 36px，≤480px 24px；保持命令面板的 14vh 检索定位。
- 抽出共享对话框几何类：root 定位与最大宽度、container 弹性列与最大高度、body 局部滚动。KB/Avatar/UnsavedGuard/DocumentCommand 使用它；Capture 与 library 专用样式仅把既有数值对齐，不重写主题。
- 移除 KB 的 `centered` 与 Document/Guard 的固定 `top:52`，避免同屏弹窗出现两套垂直位置。

## 桌面

- 平台契约新增桌面 `openAbout`：入口由 desktop renderer 的 router 提供，保留 SPA 导航与未保存守卫的宿主边界。
- `ClientSection` 分两段：使用方式（现有）与关于客户端（版本 + 关于入口）；浏览器不渲染。
- 原生菜单新增「关于 mimir」，打开原生信息框（版本与当前使用方式），不改变更新/退出顺序。
- `UpdatePage` 正文改为可滚动内容 + 自动外边距居中：内容短时成组居中，超出时从顶部滚动；footer 仍固定。

## 证据

- 前后同内容、同主题、同尺寸；使用运行中的真实路由组件，HTML 保存 DOM 与样式，PNG 以 CDP 固定视口。
- 桌面更新页与 ClientSection 使用真实 MimirProvider + 模拟桥的组件夹具；原生菜单另记边界。
