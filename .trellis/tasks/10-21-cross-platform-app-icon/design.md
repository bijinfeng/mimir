# 技术设计 · 第七轮图形已定稿

## 方向及边界

- 用户已选择渡鸦动物标识，替代此前字母折带方向。最新稿为 `proposals/round-7-raven/preview.html`：主色 `#00834d`、反白 `#FFFFFF`，深色标签栏/导航采用现行强调绿 `#6bdaa5`；清楚的圆头、厚喙、小眼点与简化收翅轮廓形成可辨鸟形；保留一道开放弧形翼线，收掉突出的肚子与独立尾部，轮廓使用圆润曲线，不嵌入字母。
- 单色轮廓是品牌核心，色彩与底板是呈现层；圆形是小程序裁切预览，不作为另一套主形。
- 仅改变标记及图标资源。产品名称、现有页面布局、交互和主动作绿色主题 token 保持当前行为；品牌图标改色不推导为按钮、表格、编辑器整体换肤。
- 用户已明确确认第七轮轮廓，前六轮稿保留。最终实施摘要见 `final-review.md`；最终实施摘要已获用户“可以”批准，进入四端接入。

## 资源真相源及生成

1. 新建 `assets/brand/mimir-mark.svg`，以 64×64 viewBox、单一 evenodd path 保存主形；颜色元数据集中在 `assets/brand/brand.json`。
2. 扩展现有 `apps/desktop/scripts/make-icons.ts`，通过 `pnpm --filter @mimir/desktop icons` 一次派生四端资源，不增加依赖或第二套图形绘制逻辑。
3. 生成器校验视框、路径数及配色，错误应显式终止；导出主形数据模块供 BrandMark 使用。生成的 favicon、PNG 和容器图标均由该源生成，不手工修改输出。
4. `BrandMark` 保持 size/title、currentColor 与无障碍语义；默认品牌色在品牌展示处指定，其他界面允许单色和反白。不导入 React 组件到 Node 生成器，也不把 renderer 运行时代码导入小程序。
5. 路径改变时调整既有 `design.test.ts` 的同形校验来追踪新真相源及实际使用值，不删除同形约束。验证生成文件与源文件一致及重复生成无差异。

## 平台覆盖清单

| 平台 | 实际资源与入口 | 适配 |
|---|---|---|
| 共用界面 | `packages/renderer/src/components/BrandMark.tsx`；导航、登录、官网、desktop setup/titlebar | 20–28px、18/38px 调用及单色/反白；不改变调用接口 |
| 网页 | `apps/web/public/favicon.svg` | 16/32px 优先，浅/深色标签栏自适应 |
| 桌面网页入口 | `apps/desktop/public/favicon.svg` | 与 web 同一主形 |
| macOS | `apps/desktop/resources/icon.icns` | 多尺寸 PNG 载荷，按桌面模板留外缘空间；图形本身不发生变形 |
| Windows | `apps/desktop/resources/icon.ico` | 16/24/32/48/64/128/256px 多分辨率 |
| Linux/Electron | `apps/desktop/resources/icon.png` | 1024px，可透明外缘，现有构建读取路径不变 |
| fnOS 包信息 | `apps/fnos/ICON.PNG`、`ICON_256.PNG` | 核对现有 64/256px 实际规格并保留打包合同 |
| fnOS 启动器 | `apps/fnos/app/ui/images/icon_64.png`、`icon_256.png` | 与包信息资源同形同色 |
| 小程序界面 | `apps/miniapp/src/assets/brand/`（新增）；Gate、登录页 | Taro Image 使用本地 PNG，禁用字体 m 替代；保护原有未提交改动 |
| 小程序后台交付 | `assets/brand/exports/miniapp-avatar.png`（新增） | 1024px 正方形完整底图，不预裁圆角；另做圆形遮罩安全区预览。后台上传不在本任务操作范围 |

## 裁切与光学规则

- 从同一主形在目标尺寸直接栅格化，避免先缩小 PNG 再放大。
- 普通版、反白版及底板版共享轮廓；底板只决定平台圆角、透明外缘和外部留白。
- 第七轮主轮廓锁定，所有尺寸共用同一路径，不静默另画小尺寸版。16px 检查开放翼线、喙和整体识别；小眼点是辅助细节，不承诺在所有像素密度下清晰。优先通过输出分辨率、平台底板和留白改善显示；如必须改变已批准主形，记录证据并单独审阅。
- 主体位于中心安全区；小程序背景铺满正方形，系统圆形遮罩后主体完整。macOS 与 Windows 的视觉留白分别检查，不能以一张 PNG 推断所有系统效果。

## 验证、迁移及回退

- 先归档旧版实际资源及真实组件渲染，再接入新源；正式对比与规划模拟图分开。
- 正式对比保存于 `docs/visual-comparisons/2026-10-21-brand-icon/`，HTML 的 before/after 使用同内容、尺寸和主题，并保留本轮提案。
- 更新现有唯一归属设计合同中旧外框/绿色图形的描述，不以品牌任务为由重写其他 UI 设计系统。
- 不触发安装、更新发布、fnOS 上架或小程序后台修改。系统缓存可能继续显示旧图，包内资源及运行时加载路径需要分别检查。
- 回退只涉及本任务源文件与派生资源；不得恢复或覆盖本轮开始前的小程序工作。

## 已知验证边界

规划预览已用本机 Chrome 渲染浅/深色平台模拟场景，390px 检测无横向溢出。尚未进行产品集成、安装包系统图标、fnOS 或微信真机验收。Manrope 字体只用于提案，来源与 OFL 许可证随稿保留，不构成产品字体替换。
