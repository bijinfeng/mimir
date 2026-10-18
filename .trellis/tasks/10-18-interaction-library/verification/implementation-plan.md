# Library 产品实施限定计划

- 差距：当前列表缺卡片已有动作；查询、缺失路径及空标签容易表达错误；目录表单和原件替换缺少等待锁定、就地错误与恢复；布局尚未对齐获批 revision2 A。
- 行为归属：LibraryView 管浏览、目录及替换；FolderSection 只修知识库删除的实际后果文案。API与模块2–4入口保持。
- 预计文件：LibraryView.tsx/style/test；局部 FolderNameModal.tsx/SourceReplaceDialog.tsx 及有意义的行为测试用于隔离草稿与同步请求锁；FolderSection.tsx仅删除文案。FileFormatIcon由独立代理拥有并接入。
- 不做：不改主题token、Office/Agent/阅读器、后端、分页、权限、批量、回收站、新浏览页移动改名命令。
- 视觉依据：冻结 ce43cbea265b09b3fd75d9db9d0f3d02723ef1559f2e9a09d742750285dc2f40 的 after，含22px图标、56px行、稳定更多列、44px小屏目标、长描述和路径、低高度滚动。
- 验证：菜单不冒泡、目录表单IME/同帧单飞/错误留稿/等待锁关闭及回焦；替换真实parseError/charCount及原File重试；失效路径、scope切换和缓存失败；限定lint/format/type/test。主会话做真实GUI及独立检查。
