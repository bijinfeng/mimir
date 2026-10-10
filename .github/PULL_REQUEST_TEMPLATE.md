## 改了什么

<!-- 一句话说清这次改动实现了什么，不要罗列文件。 -->

## 为什么

<!-- 如果是在实现 Trellis 里已有的决策，指出来即可。
     如果是新决策，说明取舍，并在 .trellis/spec/project/decisions.md 追加一条。 -->

## 验证方式

<!-- 必填。写「跑了什么、看到什么」，不是「已测试」。

     涉及检索/解析：说明怎么确认效果，不要只跑单元测试就宣布完成
     涉及界面：说明实际看到了什么，不要只看代码推断
     没跑过的不要声称跑过 -->

## 自检

- [ ] `pnpm check` 通过（lint + format + typecheck + test）
- [ ] 没有违反 `.trellis/spec/project/rules.md` 的项目规则
- [ ] 没有碰 `.trellis/spec/project/product.md` §1 的非目标清单
- [ ] 改了现行契约 → 更新了唯一归属文档
- [ ] 有未来可能被误改的实质取舍 → 在 `.trellis/spec/project/decisions.md` 记录了理由

## 影响面

- [ ] 数据库 schema（需要迁移）
- [ ] 检索参数（需要重跑相关性验证）
- [ ] 文件格式或 vault 布局（会影响已有笔记）
- [ ] API 契约（需要同步 `packages/shared`）
