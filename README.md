# @nestos/device-tty

独立的 Node.js 交互进程库，提供 pipe、真实 PTY 驱动和通用 TTY 契约。唯一直接运行依赖是 `node-pty ^1.1.0`；不依赖 MindOS、tools、VFS、Session 或 durable-kernel。

```ts
import { NodeTTYDriver, collectOutput } from '@nestos/device-tty';

const session = new NodeTTYDriver().spawn('/bin/sh', ['-c', 'read answer; echo "$answer"']);
const output = collectOutput(session);
session.write('hello\n');
console.log(await output);
```

`NodeTTYDriver` 使用 Node `child_process` 的管道，`supportsPty` 为 false。`NodePtyDriver` 首次 spawn 时同步加载 `node-pty`，支持 `isatty`、终端尺寸和交互程序。原生模块加载失败时保留错误 cause；不需要等待异步预加载。安装 `node-pty` 需要兼容平台的原生制品，或可用的本地构建工具。

## 接口与事件

- `ITTYDriver.spawn(command, args, options)` 返回实时进程会话；options 提供 cwd、env、cols、rows、AbortSignal。
- `ITTYSession` 提供 write、resize、kill、pid、exited、exitCode；pipe 驱动的 resize 无操作。
- `session.on('data' | 'exit' | 'error', callback)` 注册实时通知并返回取消订阅函数。先监听，再写入；输出不持久化，也不为迟到监听者重放。
- `TTYSessionManager` 登记、查找、列出和终止当前进程内的会话；`collectOutput` 在退出、空闲、输出阈值或取消时返回收集结果。空闲只说明暂时无输出，不证明正在等待用户输入。
- 默认继承环境会过滤常见凭据变量；调用方显式传入的 env 会覆盖过滤结果，应由宿主管理。

只使用接口的浏览器或远端宿主从独立子入口导入，不加载 Node 或原生实现：

```ts
import type { ITTYDriver, ITTYSession, ITTYSpawnOptions } from '@nestos/device-tty/contracts';
```

MindOS 的 `@nestos/tools/contracts` 兼容转发这些类型。工具授权、命令策略、RPC、持久任务与审批界面由上层负责，不进入本库。

## 生命周期与恢复边界

会话仅在宿主进程内登记。终端暂时断开显示时，只要宿主及子进程仍存活，重新绑定监听器并继续 write 即可；本库不保存屏幕，也不自动重绘选择菜单。宿主重启后不能凭 sessionId 重新连接旧 PTY，不提供检查点、持久 attach、恢复或任意 JavaScript 调用栈恢复。

需要恢复的结构化对话框应将问题与答案持久化，由 UI 重新呈现；真实 TTY 跨宿主恢复需额外的独立终端服务及重连协议，不能由内存 Map 或 kernel 的 Task 恢复替代。

## 开发

仓库：[mushuanli/device-tty](https://github.com/nest-agentos/device-tty)。使用 Node.js 22 和 pnpm 10.20.0：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

构建输出 ESM、CJS 和对应声明；检查脚本验证依赖与 contracts 隔离。MindOS 使用 `libraries/device-tty` 子模块作为唯一开发工作树；在其中提交推送后，再更新主仓库的子模块提交。
