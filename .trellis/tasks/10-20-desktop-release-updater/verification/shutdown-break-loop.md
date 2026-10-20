# Bug Analysis: 更新前跨层资源关闭

## 1. Root Cause Category

- **B / E / D**：窗口、Chromium Session、HTTP 与数据库的生命周期被错误等同。原测试的 EventEmitter 和开发缓存覆盖不足，未验证生产实际连接。
- 窗口销毁后的 getter 问题曾先阻断流程；修复它只能解锁下一阶段，不能证明整个升级成功。真实 Electron 预连接使 HTTP close 悬挂得到红绿证明，但旧 Linux artifact 丢失 cause，无法断言该现场的精确底层异常。
- 数据库问题独立存在：production 不写 development HMR 缓存，原 closeDb 却只关闭缓存，导致成功返回而实际连接仍开着。它不是前述 HTTP 超时的直接原因。

## 2. Why Fixes Failed

1. 先前捕获 webContents 修复原生销毁边界，但未覆盖 Session 连接池和真实数据库释放。
2. 第一版 Session 清理置于时间门外，被独立审查识别；最终统一到原 15 秒总预算，并禁止超时后的迟到清理继续进入宿主。
3. Windows 外部 UIA 未发现实际可见按钮，与 Linux 产品关闭问题分开记录；不可混成一个原因或放宽升级判据。

## 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
|---|---|---|---|
| P0 | Architecture | 提前捕获 Session，保存及真实关闭后清连接；同一时间门覆盖连接、HTTP、DB | DONE |
| P0 | Ownership | 实际数据库引用独立于 development 缓存，关闭失败传播 | DONE |
| P0 | Tests | 永不完成/迟到/累计预算、真实 Electron 红绿、production/development SQLite 与 PG 实际关闭 | DONE |
| P0 | Native E2E | 新基线正式安装后再次从官方源验证完整升级及资料保留 | PENDING |
| P1 | Review | 分层读取实际资源状态，不能以 Promise resolve 或测试替身代替 | DONE |

## 4. Systematic Expansion

- 普通退出、模式切换与更新共用宿主关闭门；本轮不把 Session 清理提前到保存保护前，不绕过 beforeunload。
- 生产服务器和 fnOS 同样依赖 closeDb 实际关闭，必须保留 SQLite / PG 两条真实驱动回归。
- 每次原生修复都从先前阻塞阶段继续直到新进程/版本/数据验证结束，保留失败原件。

## 5. Knowledge Capture

- [x] desktop/runtime/releases-updates.md：Session 与统一预算、迟到行为及真实探针。
- [x] server/backend/conventions.md：实际 client 所有权与 production/development 验证。
- [x] guides/index.md：跨层关闭检查与完整升级边界。
- 当前为应用仓库，无 Trellis 生成模板目录；无需创建或同步 src/templates。
