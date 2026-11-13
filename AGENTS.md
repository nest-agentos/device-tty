# @nestos/device-tty

独立 Node.js pipe / PTY 驱动库；唯一直接运行依赖是 node-pty，不导入 NestOS、tools、VFS 或 kernel。

- 通用接口由 src/contracts.ts 拥有，公开 /contracts 子入口只提供类型，不加载 Node 或原生实现。NestOS 的 tools/contracts 兼容转发本库类型。
- 根入口为 Node-only。pipe 使用内置 child_process；PTY 在首次 spawn 时同步加载 node-pty，失败保留 cause，不吞掉原生模块错误。
- 驱动不持久化进程、输出、菜单或 sessionId。不得把内存会话描述为可跨宿主恢复；权限、持久执行和结构化问答由宿主组合。
- 日志不得记录环境值、终端正文或完整命令参数；复用宿主日志并保留错误分类与 cause。
- 使用 Node crypto 生成 ID；contracts 不引入 ID 或其他运行依赖。
- 验证 pnpm typecheck、pnpm test、pnpm build；构建检查 ESM/CJS/声明的依赖边界。

NestOS 的装配和命令策略位于主仓库 apps/cli 与 backend/kernel-adapters，不属于本独立仓库。
