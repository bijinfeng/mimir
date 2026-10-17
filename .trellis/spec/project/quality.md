# 命令与完成定义

## 常用命令

| 命令 | 干什么 |
|---|---|
| `pnpm dev` | 全仓并行 dev（web / server 等有 dev 脚本的包；桌面端另用 `pnpm desktop:dev`） |
| `pnpm check` | lint + 样式守卫 + format + typecheck + test，一条命令跑完 |
| `pnpm build` / `pnpm test` / `pnpm -r typecheck` | 全仓构建 / 测试 / 类型检查 |
| `pnpm lint`（`lint:fix`）/ `pnpm format:check`（`format`） | oxlint / oxfmt（oxfmt 不碰 `**/*.md`） |
| `pnpm db:up` / `db:down` | 起 / 停 Postgres（Docker）。不设 `DATABASE_URL` 时本地默认 SQLite，不需要它 |
| `pnpm db:migrate` / `db:reindex` | 跑迁移 / 重建全文与分块索引 |
| `pnpm db:generate:pg` + `db:generate:sqlite` | 生成两侧迁移，**两边的迁移文件要同批提交** |
| `pnpm desktop:dev` / `desktop:build` | 桌面端开发（electron-vite 三段 watch 构建，**改完刷新窗口**）/ 打包安装包（`server-deploy/` 是 gitignore 的产物） |

---

## 检查输入范围

根 `.oxlintrc.json` 与 `.oxfmtrc.json` 的排除项只用于生成产物、第三方发布文件和本地缓存。安装在 `.agents/skills/impeccable/scripts/`、`.claude/skills/impeccable/scripts/`、`.github/skills/impeccable/scripts/` 的发布脚本及 `.pnpm-store/` 不属于本项目维护源码；产品代码仍由原规则检查。新增排除须指向具体产物路径并说明来源，不能用排除产品目录或降低规则来使质量门通过。

异步行为测试以真实操作完成、版本发布与界面解锁作为等待条件；固定延时不能证明完成。涉及迟到结果时用可控 promise 分别守住“发布前”和“请求返回后”的边界，并在卸载前结算本测试创建的异步链。

## 完成定义

「改完了」不算完成。以下全部满足才算：

1. **`pnpm check` 通过** —— lint、format、typecheck、test 一条命令
2. **验证方式写进提交信息** —— 跑了什么、看到什么。不是「已测试」
3. **涉及检索或解析的改动** —— 说明怎么确认效果，不要只跑单元测试就宣布完成
4. **涉及界面的改动** —— 说明实际看到了什么，不要只看代码推断
5. **改了现行契约** —— 更新唯一归属文档；有新的实质取舍才追加决策记录，
   其余改动不为登记而登记
6. **没跑过的东西不要声称跑过**

---

