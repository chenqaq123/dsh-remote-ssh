# DeepSeek Harness · Remote SSH

在 DeepSeek Harness 桌面侧边栏中连接 SSH 服务器，**浏览并选择远程项目目录**，直接打开远程工作区。本地工作区继续使用 Harness 原生沙箱。

![远程工作区面板](docs/remote-workspace.png)

## 目录选择

选择服务器 → 点击「选择服务器上的文件夹…」→ 打开项目文件夹 →「选择此目录」→「连接并打开」。

目录选择器从服务器主目录开始，支持面包屑、上一级、文件夹筛选、隐藏目录和手动跳转。浏览不会创建工作区，确认连接后才保存。切换服务器会清空旧的目录选择。

![远程目录选择器](docs/directory-picker.png)

以上是使用真实插件组件和虚构数据生成的浏览器预览。预览侧边栏为演示外壳；截图不含真实 SSH 配置、账户、服务器地址或个人目录。重新生成方式见下文。

## 环境要求

- 已在 **macOS / DeepSeek Harness 0.2.0-rc.2** 验证。插件使用 Harness 内部接口，其他版本需重新验证；暂不支持 Windows 本地后端。
- 安装脚本需要 Node.js 20+；本机需要 OpenSSH。
- 远程主机需要 POSIX `sh`、`stat`（GNU 或 BSD）、`mktemp`、`cat`、`cp`、`mv` 等常见工具；执行命令需要 Bash。
- 使用 SSH 密钥或 agent 非交互登录。插件不提供密码输入，不读取或上传私钥。

先在终端确认可以登录服务器。示例 `~/.ssh/config`：

```sshconfig
Host dev-server
  HostName dev.example.com
  User demo
  IdentityFile ~/.ssh/id_ed25519
```

```sh
ssh dev-server
```

上面的服务器地址是示例，请替换为自己的配置。`Include`、跳板机和密钥认证由系统 OpenSSH 处理。默认自动接受首次连接的新主机密钥，已知主机密钥变更会拒绝连接；可将 `strictHostKeyChecking` 设为 `yes`，要求预先确认主机身份。

## 安装

### 从 GitHub 安装（推荐）

先启动一次 Harness，使 `desktop` 配置目录存在。然后将插件克隆到希望长期保留的位置：

```sh
git clone https://github.com/chenqaq123/dsh-remote-ssh.git
cd dsh-remote-ssh
git checkout v0.3.1
node scripts/profile.mjs install desktop
```

**完全退出并重新打开 DeepSeek Harness**，侧边栏会出现「远程工作区」。安装无运行时 npm 依赖，不需要执行 `npm install`。

安装器在 `~/.dsh/profiles/desktop/plugins/dsh-ssh-remote` 建立指向源码的符号链接，并向该 profile 的 `cordis.patch.yml` 添加独立管理区块。修改前自动备份，重复安装保留区块内的自定义配置。请保留源码目录。设置了 `DSH_HOME` 时，安装器会使用该位置；可将 `desktop` 替换成其他已有 profile 名称。

### 作为 npm 包安装

仓库包含完整 npm 包元数据和命令入口，可直接从 GitHub tag 安装，无需等待 npm registry 发布：

```sh
npm install -g git+https://github.com/chenqaq123/dsh-remote-ssh.git#v0.3.1
dsh-ssh-remote install desktop
```

本仓库不声称已在 npm registry 上架。维护者可运行 `npm pack` 生成安装包，或使用有发布权限的 npm 账户执行 `npm publish`。

### 更新与卸载

更新源码或全局 npm 包后，重新运行安装命令并重启 Harness。卸载 GitHub 源码安装：

```sh
node scripts/profile.mjs uninstall desktop
```

全局包安装可运行 `dsh-ssh-remote uninstall desktop`，然后再卸载 npm 包。卸载只移除配置区块与插件链接，不删除远程文件或已保存的挂载数据。

## 使用与行为

- 已保存工作区支持打开、检查连接和断开；「可连接」是最近一次检查结果，不是持续在线状态。
- 断开前请结束该工作区中的任务。断开后旧工作区会要求重新连接，避免误在本地执行；其他工作区仍可继续使用同一 SSH 连接。
- 目录选择每次最多显示 500 个文件夹；筛选作用于当前列表。超过上限时可使用「前往指定路径」。符号链接目录会解析为物理路径。
- 聊天工具 `ssh_hosts`、`ssh_mount`、`ssh_unmount` 仍可使用。`ssh_mount` 只创建映射；当前聊天不会自动切换到远程。打开返回的工作区路径，或从面板连接并打开。
- 本地映射目录用于 Harness 工作区身份，**不是文件同步副本，也不是 SSHFS**。文件读取、修改和命令通过 SSH 在远程执行。
- 文件修改按服务器和工作区隔离。断开与重新连接记录默认保存在 `~/.dsh/ssh-remote/mounts.json`，不会进入 Git 或安装包。

## 配置与边界

可在 profile 的管理区块中修改 `config`，然后重启：

| 设置 | 默认值 | 用途 |
| --- | --- | --- |
| `hosts` | `[]` | 补充 SSH 别名或 `user@hostname` |
| `sshConfigPaths` | `~/.ssh/config`（存在时） | 指定一个配置文件，同时用于列表和 SSH 的 `-F`；多个文件请通过 `Include` 引入 |
| `mounts` | `[]` | 启动时配置的挂载，字段为 `host`、`remoteDir`、`localDir`；可直接使用面板保存代替 |
| `localFallback` | `true` | 保留本地沙箱文件与命令后端 |
| `confineMutations` | `true` | 文件写入和编辑限制在当前挂载的路径及额外允许路径内 |
| `extraWritableRoots` | `[]` | 额外允许文件写入的远程绝对路径 |
| `connectTimeoutSec` | `10` | SSH 建立连接超时 |
| `operationTimeoutMs` | `60000` | 文件与目录请求超时 |
| `multiplex` | `true` | 复用 SSH 连接 |
| `watchIntervalMs` | `3000` | 远程文件变更轮询间隔 |

远程执行使用 SSH 账户的实际权限，**不具有本地操作系统沙箱的隔离能力**。`confineMutations` 是文件 API 的路径检查，不能隔离 Bash 命令，也不能阻止远程符号链接越界。只读策略下插件拒绝远程写入和远程命令。需要更强隔离时，应在远程使用受限账户或容器。

远程文件监听采用轮询。版本检查与同一插件进程内的写入队列可减少覆盖，但不提供与其他编辑器之间的跨进程事务锁。SSH 网络断开或取消本地请求也不保证已经启动的远程进程被终止。

## 开发与验证

```sh
npm ci
npm test
npx playwright install chromium
npm run test:ui
```

这些测试只使用临时目录和虚构数据，不访问真实 SSH 配置、不连接服务器。浏览器测试覆盖目录导航、筛选、隐藏目录、空目录、错误重试、取消、服务器切换、连接及断开、键盘和窄屏布局。

重新生成 README 截图：

```sh
UPDATE_SCREENSHOTS=1 npm run test:ui
```

可设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 使用本机 Chrome。需要 Harness 的集成检查，在 macOS 使用其运行时：

```sh
export DSH_DESKTOP_NODE_EXECUTABLE='/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness'
DSH_NODE='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/bin/node'
"$DSH_NODE" test/local-startup.mjs
"$DSH_NODE" test/ui-rpc.mjs
```

这两项验证真实 Cordis 生命周期、本地沙箱和认证 Gateway 描述符，SSH 端使用模拟。可选真实服务器测试需要明确传入测试主机，且会在远程 `/tmp` 创建临时文件：`node test/integration-ssh.mjs <test-host>` 和 `"$DSH_NODE" test/composition.mjs <test-host>`。

客户端通过 Harness 原生 `sidebar.panellist` / `main` 插槽挂载，后端通过已有认证连接和严格校验的 Typert RPC 提供服务，不增加后台 HTTP 端口。插件借用已安装 Harness 的接口类，不打包应用的专有代码。

## 许可证

[MIT](LICENSE)。社区插件，与 DeepSeek 官方无隶属关系。
