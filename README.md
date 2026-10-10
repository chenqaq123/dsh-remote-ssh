# DeepSeek Harness · Remote SSH

在 DeepSeek Harness 桌面侧边栏中连接 SSH 服务器，**浏览并选择远程项目目录**，直接打开远程工作区。

![远程工作区面板](docs/remote-workspace.png)

## 目录选择

选择服务器 → 点击「选择服务器上的文件夹…」→ 打开项目文件夹 →「选择此目录」→「连接并打开」。

连接时可填写「工作区名称」，留空默认使用项目文件夹名。绿点标识远程工作区。

![远程目录选择器](docs/directory-picker.png)

## 环境要求

本地支持 macOS 和 Linux，需要系统 OpenSSH。远端需要 POSIX `sh`、GNU/BSD `stat`、`readlink`、`mktemp` 等常见命令；执行远程终端命令还需要 `bash`。目前不支持 Windows/Pwsh。

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

上面的服务器地址是示例，请替换为自己的配置。

## 权限和路径行为

文件工具遵守会话权限：`read-only` 拒绝本地和远程写入、编辑；`workspace-write` 默认只允许写入所属远程工作区（会话使用子目录时边界随之缩小）；宿主批准的 `danger-full-access` 可为该次文件操作放宽目录边界。本地工作区使用原生沙箱。远程终端在 `read-only` 下不可执行命令。

**远程执行不是远端操作系统沙箱**：`workspace-write` 的远程文件边界是路径检查，工作区内指向外部的符号链接可能跨出此边界；远程 `bash` 也不会获得本地沙箱同等的目录隔离。需要远端隔离时，应使用受限账户或容器。通过符号链接写入或编辑会更新目标文件并保留链接。

在 profile 的插件配置中，`extraWritableRoots` 可加入允许写入的**远端绝对路径**；`confineMutations: false` 关闭远程文件目录边界检查，但仍保留只读限制。默认 `confineMutations: true`、`extraWritableRoots: []`。

本地路径是空的占位目录，不复制远程文件。新挂载拒绝已有本地项目、已注册本地工作区及符号链接目录，以免改道本地会话；`local_path` 必须是绝对路径（支持 `~` 展开），且不能包含 `..`。末尾斜杠会自动归一化。

远程 `resolve` 只做路径解析，不执行 `realpath`；调用方需要传入远程工作区的 `cwd`，或使用其本地占位目录下的绝对路径。没有工作区信息的相对路径按本地默认目录解析，插件不会猜测当前会话。远程文件监听采用轮询，默认每 3 秒检查一次，并复用 OpenSSH 连接。文件传输默认在 60 秒没有读写进展时超时，可通过 `operationTimeoutMs` 调整；流式读取会排除消费方暂停的时间。

`mounts` 配置条目在启动时应用，并在打开时创建占位目录；面板和工具创建的挂载独立保存。配置挂载的名称等元数据会保存，但删除配置条目后不会恢复为活动挂载，旧工作区也不会自动回落到本地执行。旧版未记录来源的条目会在配置仍存在时迁移；升级前已经删除配置却仍留在面板的旧条目需要手动断开一次。

## 安装

### 从 GitHub 安装（推荐）

先启动一次 Harness，使 `desktop` 配置目录存在。然后将插件克隆到希望长期保留的位置：

```sh
git clone https://github.com/chenqaq123/dsh-remote-ssh.git
cd dsh-remote-ssh
git checkout v0.4.3
node scripts/profile.mjs install desktop
```

**完全退出并重新打开 DeepSeek Harness**，侧边栏会出现「远程工作区」。

### 作为 npm 包安装

仓库包含完整 npm 包元数据和命令入口，可直接从 GitHub tag 安装，无需等待 npm registry 发布：

```sh
npm install -g --install-links git+https://github.com/chenqaq123/dsh-remote-ssh.git#v0.4.3
dsh-ssh-remote install desktop
```

### 更新与卸载

更新源码或全局 npm 包后，重新运行安装命令并重启 Harness。卸载 GitHub 源码安装：

```sh
node scripts/profile.mjs uninstall desktop
```

全局包安装可运行 `dsh-ssh-remote uninstall desktop`，然后再卸载 npm 包。卸载只移除配置区块与插件链接，不删除远程文件或已保存的挂载数据。

## 移除远程工作区

「移除工作区」会归档相关会话并移除分组和远程映射，保留历史记录及服务器文件。有任务运行时，请先结束任务。

## 许可证

[MIT](LICENSE)。社区插件，与 DeepSeek 官方无隶属关系。
