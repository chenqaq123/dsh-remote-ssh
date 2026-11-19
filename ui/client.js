/* Native Harness client bundle. React and services come from its module loader. */
window.__ModuleLoader__.load({
  id: 'dsh-ssh-remote-workspace',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useState, useEffect, useRef, useSyncExternalStore } = React;
    const PANEL = 'ssh-remote';
    /** Marker the host appends to errors the user resolves by entering a password. */
    const PASSWORD_MARKER = '[ssh-password-required]';
    const LOCALE_NS = 'ssh-remote';
    const UI_COPY = {
      en: {
        'app.name': 'Remote Workspaces',
        'status.connected': 'Connected',
        'status.notConnected': 'Not connected',
        'status.pending': 'Unchecked',
        'status.disconnected': 'Disconnected',
        'status.failed': 'Connection failed',
        'common.cancel': 'Cancel',
        'common.save': 'Save',
        'common.close': 'Close',
        'common.processing': 'Working…',
        'common.justNow': 'Just now',
        'sidebar.aria': 'Remote workspaces',
        'sidebar.manage': 'Manage remote workspaces',
        'sidebar.add': 'Add remote workspace',
        'sidebar.treeAria': 'Remote servers and workspaces',
        'sidebar.loading': 'Loading remote workspaces…',
        'sidebar.empty': 'No remote workspaces yet. Add one from the top-right menu.',
        'sidebar.expand': 'Expand remote workspaces',
        'sidebar.collapse': 'Collapse remote workspaces',
        'sidebar.expandRow': 'Expand {name}',
        'sidebar.collapseRow': 'Collapse {name}',
        'sidebar.serverActions': 'Server actions: {name}',
        'sidebar.workspaceActions': 'Workspace actions: {name}',
        'sidebar.sessionActions': 'Session actions: {name}',
        'sidebar.addWorkspace': 'Add workspace: {name}',
        'sidebar.newSession': 'New session: {name}',
        'sidebar.connectServer': 'Connect server: {name}',
        'sidebar.disconnectServer': 'Disconnect server: {name}',
        'sidebar.connectWorkspace': 'Connect workspace: {name}',
        'sidebar.disconnectWorkspace': 'Disconnect workspace: {name}',
        'sidebar.nativeMenuUnavailable': 'The Harness native menu is not ready yet.',
        'menu.connectServer': 'Connect server',
        'menu.disconnect': 'Disconnect',
        'menu.connectWorkspace': 'Connect workspace',
        'menu.newSession': 'New session',
        'menu.copyRemotePath': 'Copy remote directory path',
        'menu.manageWorkspace': 'Manage remote workspace',
        'menu.addRemoteWorkspace': 'Add remote workspace',
        'menu.manageServers': 'Manage servers and workspaces',
        'menu.deleteSession': 'Delete session',
        'session.new': 'New session',
        'session.untitled': 'Untitled session',
        'dialog.deleteSession': 'Delete session?',
        'dialog.deleteSessionBody': 'The session will be archived and removed from the remote workspace list. Harness history and remote files will be kept.',
        'dialog.stopFirst': 'Stop the session before deleting it.',
        'dialog.archivedRemovalFailed': 'Session archived, but removal did not finish: ',
        'errors.passwordRequired': 'This server requires password authentication. Enter a password and try again.',
        'errors.auth': 'SSH authentication failed. Unlock your key or enter a password for this server.',
        'errors.timeout': 'Connection timed out. Check your network, VPN, and server, then try again.',
        'errors.hostNotFound': 'Could not resolve the server. Check the hostname and network connection.',
        'errors.refused': 'The server refused the connection. Check the SSH service and port.',
        'errors.hostKey': 'Server identity verification failed. Verify the SSH host key first.',
        'errors.pathRequired': 'Choose a remote project directory first.',
        'errors.invalidHost': 'Select a valid SSH server.',
        'errors.absolutePath': 'Enter a path starting with /.',
        'errors.browsePermission': 'You do not have permission to browse this directory. Choose another one.',
        'errors.directoryGone': 'The directory does not exist or was moved. Go up one level.',
        'errors.sshFailed': 'SSH connection failed ({code}).',
        'errors.passwordEmpty': 'The password cannot be empty.',
        'errors.passwordTooLong': 'The password must be at most {count} characters.',
        'errors.passwordNewline': 'The password cannot contain line breaks.',
        'errors.invalidHostName': 'Invalid server name.',
        'errors.remoteDisconnected': 'The remote workspace is disconnected. Reconnect it from the Remote Workspaces panel.',
        'errors.remotePlaceholderConflict': 'This path belongs to an existing local workspace. Choose a separate empty directory for the remote placeholder.',
        'errors.placeholderNotEmpty': 'The remote placeholder path must be an empty directory.',
        'errors.duplicateWorkspace': 'A workspace with this name already exists on the host. Choose another name.',
        'errors.passwordStoreUnavailable': 'Password storage is unavailable. Check secretsFile in the plugin configuration.',
        'errors.remoteAccess': 'Could not access the remote directory: {detail}',
        'errors.remoteDirMissing': 'The remote directory does not exist: {path}',
        'errors.remoteNotDirectory': 'This path is not a directory: {path}',
        'errors.remoteMappingLost': 'The remote mapping is missing. Choose the server and directory above, then reconnect.',
        'errors.remoteAbsolutePath': 'Enter an absolute remote path starting with /.',
        'errors.workspaceConnecting': 'This workspace is connecting. Try again shortly.',
        'errors.localPathTraversal': 'The local workspace path cannot contain ..',
        'errors.workspaceBusy': 'Another operation is already running for this workspace. Try again shortly.',
        'errors.localMappedElsewhere': 'This local workspace already maps to another remote directory. Choose another path.',
        'errors.workspaceServiceUnavailable': 'The workspace service is not ready yet. Try again shortly.',
        'errors.workspaceNameInvalid': 'Workspace names must be a single line of at most 80 characters.',
        'errors.localAbsolutePath': 'The local workspace path must be absolute.',
        'errors.remoteAbsolutePathRequired': 'The remote workspace path must be absolute.',
        'errors.workspaceMissing': 'Remote workspace not found. Reopen the Remote Workspaces panel and try again.',
        'errors.sessionNotInWorkspace': 'This session does not belong to the remote workspace.',
        'errors.archiveFirst': 'Archive the session before removing it from the remote list.',
        'errors.mappingMissing': 'Could not find the mapping for this remote workspace.',
        'errors.removeRunning': 'A task is still running in this workspace. Stop it before removing the workspace.',
        'errors.removeUnfinished': 'Removal did not finish because restoring the workspace state failed. Reopen the Remote Workspaces panel and try again.',
        'errors.remote255': 'The remote command returned 255 even though SSH ran it. Check the server-side program and its exit code.',
        'picker.title': 'Choose a remote directory',
        'picker.server': 'Server · {host}',
        'picker.close': 'Close directory picker',
        'picker.home': 'Home',
        'picker.parent': 'Up one level',
        'picker.cwdAria': 'Current directory',
        'picker.filterAria': 'Filter the current directory',
        'picker.filterPlaceholder': 'Filter folders…',
        'picker.passwordAria': 'Password ({host})',
        'picker.passwordPlaceholder': 'Enter this server’s password and retry',
        'picker.savePasswordRetry': 'Save password and retry',
        'picker.loading': 'Loading remote directories…',
        'picker.backHome': 'Return to the home directory and try again.',
        'picker.noMatches': 'No matching folders.',
        'picker.noChildren': 'This directory has no subfolders.',
        'picker.truncated': 'Showing only the first 500 folders.',
        'picker.showHidden': 'Show hidden folders',
        'picker.select': 'Select this directory',
        'picker.openFolder': 'Open folder {name}',
        'workspace.renamed': 'Workspace renamed to “{title}”.',
        'workspace.nameAria': 'Workspace name ({alias})',
        'workspace.namePlaceholder': 'Workspace name',
        'workspace.localPlaceholder': 'Local placeholder directory: {path}',
        'workspace.orphaned': 'Choose {alias} and a remote directory above, then reconnect. The existing workspace will be reused.',
        'workspace.newChat': 'New chat',
        'workspace.rename': 'Rename',
        'workspace.check': 'Check connection',
        'workspace.checking': 'Checking…',
        'workspace.reconnect': 'Reconnect',
        'workspace.changePassword': 'Change password',
        'workspace.enterPassword': 'Enter password',
        'workspace.disconnect': 'Disconnect',
        'workspace.remove': 'Remove workspace',
        'workspace.lastChecked': 'Last checked: {time}',
        'workspace.passwordPrompt': 'Enter the password for {alias}. It will be stored locally and the connection will retry immediately.',
        'workspace.passwordPlaceholder': 'Password',
        'workspace.passwordAria': 'Password for {alias}',
        'workspace.passwordSaved': 'Password saved locally. Reconnecting this server.',
        'workspace.retrying': 'Retrying…',
        'workspace.confirmRemove': 'Remove the workspace and archive its sessions? History and remote files will be kept. Related sessions moved to “Ungrouped” are archived too. Stop running tasks first.',
        'workspace.confirmDisconnect': 'Disconnecting removes the connection to this remote workspace. Stop running tasks first; files on the server will be kept.',
        'workspace.confirmRemoveAction': 'Remove and archive',
        'workspace.confirmDisconnectAction': 'Confirm disconnect',
        'workspace.removed': 'Workspace removed, sessions archived, and remote files kept.',
        'workspace.disconnected': 'Disconnected. Remote files were kept.',
        'workspace.passwordStored': 'Password saved',
        'workspace.checkAll': 'Check all',
        'workspace.checkingAll': 'Checking…',
        'workspace.checkAllAria': 'Check all workspaces on {alias}',
        'workspace.checkedAll': 'Checked {count} workspaces on {alias}.',
        'workspace.unknownServer': 'the server',
        'workspace.noneTitle': 'No remote workspaces yet',
        'workspace.noneBody': 'Choose a server and remote directory to create the first connection.',
        'panel.title': 'Remote Workspaces',
        'panel.choosePathFirst': 'Choose a remote project directory first.',
        'panel.connectSuccess': 'Connected. Opening the remote workspace…',
        'panel.connectTitle': 'Connect a remote directory',
        'panel.server': 'Server',
        'panel.loadingServers': 'Loading servers…',
        'panel.noServers': 'No SSH servers found',
        'panel.passwordSavedOption': '{alias} · password saved',
        'panel.passwordLabel': 'Password ',
        'panel.passwordNeededPlaceholder': 'This server requires a password. Enter it, then click “Connect and open”.',
        'panel.clearPassword': 'Clear password',
        'panel.clearingPassword': 'Clearing…',
        'panel.clearedPassword': 'Cleared the saved password for {host}.',
        'panel.workspaceName': 'Workspace name',
        'panel.remoteDirectory': 'Remote directory',
        'panel.changeDirectoryAria': 'Change directory {path}',
        'panel.selectDirectoryAria': 'Choose a remote directory',
        'panel.chooseFolder': 'Choose a folder on the server…',
        'panel.connectAndOpen': 'Connect and open',
        'panel.connecting': 'Connecting and opening…',
        'panel.sshConfigHint': 'Add a server to ~/.ssh/config, then reopen this panel.',
        'panel.savedWorkspaces': 'Saved remote workspaces',
        'panel.loadingWorkspaces': 'Loading workspaces…',
        'panel.hierarchyFailed': 'Could not load the workspace hierarchy',
        'panel.hierarchyFailedHint': 'Reopen this panel to retry.',
        'workspace.opening': 'Opening…',
      },
      zh: {
        'app.name': '远程工作区',
        'status.connected': '可连接',
        'status.notConnected': '尚未连接',
        'status.pending': '待检查',
        'status.disconnected': '已断开',
        'status.failed': '连接失败',
        'common.cancel': '取消',
        'common.save': '保存',
        'common.close': '关闭',
        'common.processing': '处理中…',
        'common.justNow': '刚刚',
        'sidebar.aria': '远程工作区',
        'sidebar.manage': '管理远程工作区',
        'sidebar.add': '添加远程工作区',
        'sidebar.treeAria': '远程服务器与工作区',
        'sidebar.loading': '正在读取远程工作区…',
        'sidebar.empty': '还没有远程工作区，可从右上角添加。',
        'sidebar.expand': '展开远程工作区',
        'sidebar.collapse': '折叠远程工作区',
        'sidebar.expandRow': '展开 {name}',
        'sidebar.collapseRow': '折叠 {name}',
        'sidebar.serverActions': '服务器操作：{name}',
        'sidebar.workspaceActions': '工作区操作：{name}',
        'sidebar.sessionActions': '会话操作：{name}',
        'sidebar.addWorkspace': '添加工作区：{name}',
        'sidebar.newSession': '新建会话：{name}',
        'sidebar.connectServer': '连接服务器：{name}',
        'sidebar.disconnectServer': '断开连接：{name}',
        'sidebar.connectWorkspace': '连接工作区：{name}',
        'sidebar.disconnectWorkspace': '断开连接：{name}',
        'sidebar.nativeMenuUnavailable': 'Harness 原生菜单尚未就绪。',
        'menu.connectServer': '连接服务器',
        'menu.disconnect': '断开连接',
        'menu.connectWorkspace': '连接工作区',
        'menu.newSession': '新建会话',
        'menu.copyRemotePath': '复制远程目录路径',
        'menu.manageWorkspace': '管理远程工作区',
        'menu.addRemoteWorkspace': '添加远程工作区',
        'menu.manageServers': '管理服务器与工作区',
        'menu.deleteSession': '删除会话',
        'session.new': '新会话',
        'session.untitled': '未命名会话',
        'dialog.deleteSession': '删除会话？',
        'dialog.deleteSessionBody': '会话将归档并从远程工作区列表移除。Harness 历史日志和远程文件都会保留。',
        'dialog.stopFirst': '请先停止会话，再删除。',
        'dialog.archivedRemovalFailed': '会话已归档，但移除未完成：',
        'errors.passwordRequired': '这台服务器需要密码认证。请输入密码后重试。',
        'errors.auth': 'SSH 认证失败。请确认密钥已解锁，或为这台服务器输入密码。',
        'errors.timeout': '连接超时。请检查网络、VPN 和服务器是否在线，然后重试。',
        'errors.hostNotFound': '找不到服务器。请检查 SSH 配置中的主机名和网络连接。',
        'errors.refused': '服务器拒绝连接。请检查 SSH 服务和端口。',
        'errors.hostKey': '服务器身份校验失败，请先核实 SSH 主机密钥。',
        'errors.pathRequired': '请先选择远程项目目录。',
        'errors.invalidHost': '请选择有效的 SSH 服务器。',
        'errors.absolutePath': '请输入以 / 开头的路径。',
        'errors.browsePermission': '没有权限浏览这个目录，请选择其他目录。',
        'errors.directoryGone': '目录不存在或已被移走，请返回上级目录。',
        'errors.sshFailed': 'SSH 连接失败（{code}）。',
        'errors.passwordEmpty': '密码不能为空。',
        'errors.passwordTooLong': '密码不能超过 {count} 个字符。',
        'errors.passwordNewline': '密码不能包含换行符，因为 SSH 只读取一行。',
        'errors.invalidHostName': '无效的服务器名称。',
        'errors.remoteDisconnected': '远程工作区已断开，请在远程工作区面板中重新连接。',
        'errors.remotePlaceholderConflict': '这个路径属于已有本地工作区，请选择独立的空目录作为远程占位目录。',
        'errors.placeholderNotEmpty': '远程占位路径必须是空目录，不能使用已有本地项目或符号链接。',
        'errors.duplicateWorkspace': '同一主机上已有同名工作区，请使用其他名称。',
        'errors.passwordStoreUnavailable': '密码存储不可用，请检查插件配置中的 secretsFile。',
        'errors.remoteAccess': '无法访问远程目录：{detail}',
        'errors.remoteDirMissing': '远程目录不存在：{path}',
        'errors.remoteNotDirectory': '这个路径不是目录：{path}',
        'errors.remoteMappingLost': '远程映射信息已丢失，请在上方重新选择服务器和目录后连接。',
        'errors.remoteAbsolutePath': '请填写以 / 开头的远程绝对路径。',
        'errors.workspaceConnecting': '这个工作区正在连接，请稍候。',
        'errors.localPathTraversal': '本地工作区路径不能包含 ..。',
        'errors.workspaceBusy': '这个工作区正在处理其他操作，请稍后重试。',
        'errors.localMappedElsewhere': '这个本地工作区已对应其他远程目录，请选择其他路径。',
        'errors.workspaceServiceUnavailable': '工作区服务尚未就绪，请稍后重试。',
        'errors.workspaceNameInvalid': '工作区名称请使用不超过 80 个字符的单行文字。',
        'errors.localAbsolutePath': '本地工作区路径必须是绝对路径。',
        'errors.remoteAbsolutePathRequired': '远程工作区路径必须是绝对路径。',
        'errors.workspaceMissing': '找不到这个远程工作区，请重新打开远程工作区面板后重试。',
        'errors.sessionNotInWorkspace': '会话不属于这个远程工作区。',
        'errors.archiveFirst': '请先归档会话，再从远程列表移除。',
        'errors.mappingMissing': '找不到这个远程工作区的映射记录。',
        'errors.removeRunning': '工作区中仍有任务在运行，请先结束任务，再移除工作区。',
        'errors.removeUnfinished': '移除未完成，恢复工作区状态时发生错误，请重新打开远程工作区面板后重试。',
        'errors.remote255': '远程命令返回 255（SSH 已执行该命令）；请检查服务器端程序及其退出码。',
        'picker.title': '选择远程目录',
        'picker.server': '服务器 · {host}',
        'picker.close': '关闭目录选择器',
        'picker.home': '主目录',
        'picker.parent': '上一级',
        'picker.cwdAria': '当前目录',
        'picker.filterAria': '筛选当前目录',
        'picker.filterPlaceholder': '筛选文件夹…',
        'picker.passwordAria': '密码（{host}）',
        'picker.passwordPlaceholder': '输入这台服务器的密码后重试',
        'picker.savePasswordRetry': '保存密码并重试',
        'picker.loading': '正在读取远程目录…',
        'picker.backHome': '请返回主目录后重试。',
        'picker.noMatches': '没有匹配的文件夹。',
        'picker.noChildren': '此目录没有子文件夹。',
        'picker.truncated': '仅显示前 500 个文件夹。',
        'picker.showHidden': '显示隐藏文件夹',
        'picker.select': '选择此目录',
        'picker.openFolder': '打开文件夹 {name}',
        'workspace.renamed': '工作区已重命名为「{title}」。',
        'workspace.nameAria': '工作区名称（{alias}）',
        'workspace.namePlaceholder': '工作区名称',
        'workspace.localPlaceholder': '本地占位目录：{path}',
        'workspace.orphaned': '请在上方重新选择 {alias} 和远程目录后连接；连接时会复用这个工作区。',
        'workspace.newChat': '新对话',
        'workspace.rename': '重命名',
        'workspace.check': '检查连接',
        'workspace.checking': '检查中…',
        'workspace.reconnect': '重新连接',
        'workspace.changePassword': '修改密码',
        'workspace.enterPassword': '输入密码',
        'workspace.disconnect': '断开',
        'workspace.remove': '移除工作区',
        'workspace.lastChecked': '上次检查：{time}',
        'workspace.passwordPrompt': '输入 {alias} 的密码，保存在本机后会立即重试连接。',
        'workspace.passwordPlaceholder': '密码',
        'workspace.passwordAria': '{alias} 的密码',
        'workspace.passwordSaved': '密码已保存到本机，正在重新连接这台服务器。',
        'workspace.retrying': '重试中…',
        'workspace.confirmRemove': '将移除工作区并归档其中的会话，历史记录和远程文件会保留。已进入“未分组”的相关会话也会归档。请先结束正在运行的任务。',
        'workspace.confirmDisconnect': '断开会移除这个远程工作区的连接。请先结束其中正在进行的任务；服务器上的文件会保留。',
        'workspace.confirmRemoveAction': '确认移除并归档',
        'workspace.confirmDisconnectAction': '确认断开',
        'workspace.removed': '工作区已移除，会话已归档，远程文件已保留。',
        'workspace.disconnected': '已断开连接，远程文件已保留。',
        'workspace.passwordStored': '已保存密码',
        'workspace.checkAll': '检查全部',
        'workspace.checkingAll': '检查中…',
        'workspace.checkAllAria': '检查 {alias} 的全部工作区',
        'workspace.checkedAll': '已检查 {alias} 的 {count} 个工作区。',
        'workspace.unknownServer': '对应服务器',
        'workspace.noneTitle': '还没有远程工作区',
        'workspace.noneBody': '选择服务器和远程目录，建立第一个连接。',
        'panel.title': '远程工作区',
        'panel.choosePathFirst': '请先选择远程项目目录。',
        'panel.connectSuccess': '连接成功，正在打开远程工作区…',
        'panel.connectTitle': '连接远程目录',
        'panel.server': '服务器',
        'panel.loadingServers': '正在读取服务器…',
        'panel.noServers': '未找到 SSH 服务器',
        'panel.passwordSavedOption': '{alias} · 密码已保存',
        'panel.passwordLabel': '密码 ',
        'panel.passwordNeededPlaceholder': '这台服务器需要密码，输入后点击「连接并打开」',
        'panel.clearPassword': '清除密码',
        'panel.clearingPassword': '清除中…',
        'panel.clearedPassword': '已清除 {host} 保存的密码。',
        'panel.workspaceName': '工作区名称',
        'panel.remoteDirectory': '远程目录',
        'panel.changeDirectoryAria': '更改目录 {path}',
        'panel.selectDirectoryAria': '选择远程目录',
        'panel.chooseFolder': '选择服务器上的文件夹…',
        'panel.connectAndOpen': '连接并打开',
        'panel.connecting': '连接并打开中…',
        'panel.sshConfigHint': '请先在 ~/.ssh/config 添加服务器，再重新打开此面板。',
        'panel.savedWorkspaces': '已保存的远程工作区',
        'panel.loadingWorkspaces': '正在读取工作区…',
        'panel.hierarchyFailed': '工作区层级加载失败',
        'panel.hierarchyFailedHint': '请重新打开此面板后重试。',
        'workspace.opening': '打开中…',
      },
    };
    let localeRuntime;

    function interpolateCopy(template, params) {
      if (params === undefined) return template;
      return template.replace(/\{(\w+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match);
    }

    function translateFor(locale, key, params) {
      const dictionary = UI_COPY[locale] ?? UI_COPY.en;
      return interpolateCopy(dictionary[key] ?? UI_COPY.en[key] ?? key, params);
    }

    function baselineLocale(locale) {
      return typeof locale === 'string' && locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    }

    function tr(key, params) {
      const active = localeRuntime?.getSnapshot?.().active;
      const locale = baselineLocale(active);
      const supported = typeof active !== 'string' || /^(?:zh|en)/iu.test(active);
      if (supported) {
        try {
          const bound = localeRuntime?.bind?.(LOCALE_NS);
          if (typeof bound === 'function') {
            const text = bound(key, params);
            if (typeof text === 'string' && text !== '' && text !== key) return text;
          }
        } catch { /* Fall back to the bundled dictionary. */ }
      }
      return translateFor(supported ? locale : 'en', key, params);
    }

    function useActiveLocale() {
      return useSyncExternalStore(
        useCallback((listener) => localeRuntime?.subscribe?.(listener) ?? (() => {}), []),
        () => localeRuntime?.getSnapshot?.().active ?? 'en',
        () => 'en',
      );
    }

    function localizeComponent(Component) {
      function LocalizedComponent(props) {
        useActiveLocale();
        return h(Component, props);
      }
      LocalizedComponent.displayName = `Localized(${Component.displayName ?? Component.name ?? 'SshRemoteComponent'})`;
      return LocalizedComponent;
    }

    const needsPassword = (error) => (error?.message || String(error ?? '')).includes(PASSWORD_MARKER);
    const CSS = `
      .dsh-ssh-page{height:100%;overflow:auto;box-sizing:border-box;padding:calc(var(--dsh-frame-top-clearance,24px) + 24px) 36px 48px;color:inherit;font-family:inherit}
      .dsh-ssh-inner{max-width:860px;margin:0 auto}.dsh-ssh-page *{box-sizing:border-box}
      .dsh-ssh-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:28px}
      .dsh-ssh-page h1{font-size:26px;letter-spacing:-.5px;margin:0 0 8px;font-weight:650}
      .dsh-ssh-muted{opacity:.62;font-size:13px;line-height:1.65;margin:0}
      .dsh-ssh-kicker{display:flex;align-items:center;gap:7px;font-size:11px;letter-spacing:1.5px;margin-bottom:12px;color:#5387f5;font-weight:650}
      .dsh-ssh-card{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:14px;padding:24px;margin-bottom:24px;background:color-mix(in srgb,currentColor 2%,transparent)}
      .dsh-ssh-card h2{font-size:15px;font-weight:650;margin:0 0 20px}.dsh-ssh-grid{display:grid;grid-template-columns:1fr 1.3fr;gap:16px}
      .dsh-ssh-field{display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:550}
      .dsh-ssh-page select,.dsh-ssh-page input{width:100%;height:42px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;background:Canvas;color:CanvasText;padding:0 12px;font:inherit;outline:none;min-width:0}
      .dsh-ssh-page input:focus,.dsh-ssh-page select:focus{border-color:#5684ec;box-shadow:0 0 0 3px #5684ec22}
      .dsh-ssh-page button{font:inherit;cursor:pointer;border-radius:8px;min-height:36px;padding:8px 13px;border:1px solid color-mix(in srgb,currentColor 15%,transparent);color:inherit;background:transparent;white-space:nowrap;font-size:13px}
      .dsh-ssh-page button:hover:not(:disabled){background:color-mix(in srgb,currentColor 6%,transparent)}
      .dsh-ssh-page button:focus-visible{outline:2px solid #5684ec;outline-offset:3px}
      .dsh-ssh-page button:disabled{opacity:.45;cursor:default}
      .dsh-ssh-page .dsh-ssh-primary{color:#fff;background:#3869df;border-color:#3869df}
      .dsh-ssh-page .dsh-ssh-primary:hover:not(:disabled){background:#2e5bc9}
      .dsh-ssh-form-footer{display:flex;justify-content:flex-end;align-items:center;gap:18px;margin-top:20px}
      .dsh-ssh-name-field{margin-top:18px}
      .dsh-ssh-hostname-text{font-family:ui-monospace,SFMono-Regular,monospace;opacity:.62}
      .dsh-ssh-section-title{display:flex;align-items:center;justify-content:space-between;margin:28px 0 13px}
      .dsh-ssh-section-title h2{font-size:14px;margin:0;font-weight:600}
      .dsh-ssh-mount{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px;padding:18px 20px;margin-bottom:10px}
      .dsh-ssh-row{display:flex;align-items:center;justify-content:space-between;gap:15px}.dsh-ssh-host{display:flex;align-items:center;gap:9px;font-weight:600;font-size:14px;min-width:0;overflow-wrap:anywhere}.dsh-ssh-host svg{flex-shrink:0}
      .dsh-ssh-path{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;line-height:1.7;overflow-wrap:anywhere;opacity:.75;margin:9px 0 12px}
      .dsh-ssh-page .dsh-ssh-rename{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 4px}.dsh-ssh-rename input{max-width:280px;height:34px}
      .dsh-ssh-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dsh-ssh-status{font-size:11px;white-space:nowrap;border-radius:20px;padding:4px 9px;background:color-mix(in srgb,currentColor 7%,transparent)}
      .dsh-ssh-status.connected{color:#238155;background:#23815515}.dsh-ssh-status.error{color:#ce5656;background:#ce565615}
      .dsh-ssh-empty{text-align:center;padding:40px 20px;border:1px dashed color-mix(in srgb,currentColor 18%,transparent);border-radius:12px}
      .dsh-ssh-empty svg{opacity:.35;margin-bottom:12px}.dsh-ssh-empty strong{display:block;font-size:14px;font-weight:500;margin-bottom:7px}
      .dsh-ssh-error{color:#c34c4c;background:#c34c4c0d;border:1px solid #c34c4c33;border-radius:9px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
      .dsh-ssh-notice{font-size:13px;padding:12px 14px;background:#2381550d;border:1px solid #23815533;border-radius:9px;margin-bottom:16px}
      .dsh-ssh-confirm{margin-top:14px;padding-top:14px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}
      .dsh-ssh-confirm p{margin-bottom:12px}.dsh-ssh-page .dsh-ssh-danger{color:#c34c4c;border-color:#c34c4c55}
      .dsh-ssh-page .dsh-ssh-picker{height:42px;text-align:left;display:flex;align-items:center;gap:9px;min-width:0;width:100%}
      .dsh-ssh-picker span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-ssh-picker svg{flex-shrink:0;color:#6796f5}
      .dsh-ssh-page dialog{color:CanvasText;background:Canvas;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:16px;padding:24px;width:min(600px,calc(100vw - 32px));max-height:85vh;overflow:auto;box-shadow:0 24px 80px #0005}
      .dsh-ssh-page dialog::backdrop{background:#0008;backdrop-filter:blur(3px)}
      .dsh-ssh-dialog-head{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:18px}
      .dsh-ssh-dialog-head h2{font-size:18px;margin:0 0 4px}.dsh-ssh-breadcrumb{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin:12px 0}
      .dsh-ssh-page .dsh-ssh-breadcrumb button{border:0;padding:4px 6px;min-height:30px;max-width:100%;overflow:hidden;text-overflow:ellipsis}
      .dsh-ssh-folders{height:250px;overflow:auto;border-block:1px solid color-mix(in srgb,currentColor 12%,transparent);margin:12px 0;padding:6px 0}
      .dsh-ssh-page .dsh-ssh-folder{display:flex;width:100%;align-items:center;gap:10px;border:0;text-align:left;padding:10px 8px}
      .dsh-ssh-folder svg{flex-shrink:0;color:#6796f5}.dsh-ssh-folder span{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}.dsh-ssh-folder b{margin-left:auto;font-weight:400;opacity:.5}
      .dsh-ssh-check{display:flex;align-items:center;gap:8px;font-size:12px}.dsh-ssh-page .dsh-ssh-check input{width:15px;height:15px}
      .dsh-ssh-page input[type=password].dsh-ssh-needed{border-color:#c34c4c}
      .dsh-ssh-dialog-footer{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:18px;flex-wrap:wrap}
      .dsh-ssh-picker-password{display:flex;gap:8px;align-items:center}.dsh-ssh-picker-password input{flex:1;min-width:0}
      .dsh-ssh-tree{margin-top:2px}
      .dsh-ssh-server{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px;margin-bottom:12px;background:color-mix(in srgb,currentColor 2%,transparent)}
      .dsh-ssh-server-head{display:flex;align-items:center;gap:10px;padding:12px 18px;cursor:pointer;user-select:none;border-radius:12px}
      .dsh-ssh-server-head:hover{background:color-mix(in srgb,currentColor 4%,transparent)}
      .dsh-ssh-server-name{font-weight:650;font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ssh-server-body{padding:4px 18px 14px;border-top:1px solid color-mix(in srgb,currentColor 8%,transparent)}
      @media(max-width:650px){.dsh-ssh-page{padding-left:18px;padding-right:18px}.dsh-ssh-grid{grid-template-columns:1fr}.dsh-ssh-card{padding:18px}.dsh-ssh-form-footer{align-items:flex-start;flex-direction:column}.dsh-ssh-form-footer button{width:100%}.dsh-ssh-header{align-items:flex-start}.dsh-ssh-row{gap:8px}}
    `;
    /**
     * A separate 远程工作区 section inside the native sidebar column, next to
     * 工作区. It owns its own container and never mutates native rows; remote
     * groups are hidden in the native list through generated CSS rules only.
     */
    const SIDEBAR_CSS = `
      .dsh-sb{flex:none;display:flex;flex-direction:column;min-width:0;margin-top:12px;padding:0;border:0}
      .dsh-sb-head{box-sizing:border-box;display:flex;align-items:center;gap:4px;height:36px;min-height:36px;padding:0 1px 0 12px;font:inherit;font-size:14px;font-weight:400;line-height:20px;color:var(--dsw-alias-label-tertiary,inherit)}
      .dsh-sb-section-toggle{position:relative;display:flex;align-items:center;flex:1;min-width:0;height:28px;box-sizing:border-box;border:0;background:none;color:inherit;font:inherit;font-size:14px;font-weight:400;line-height:20px;text-align:left;padding:4px 0;cursor:pointer}
      .dsh-sb-section-toggle>span{position:relative;left:-1px}.dsh-sb-section-toggle svg{position:absolute;left:-17px;width:14px;height:14px;transition:transform .12s}.dsh-sb-section-toggle[aria-expanded=true] svg{transform:rotate(90deg)}
      .dsh-sb-body{min-width:0;flex:none}.dsh-sb>.dsh-sb-body{padding:2px 0 6px}
      .dsh-sb-row{box-sizing:border-box;position:relative;display:flex;align-items:center;gap:var(--dsh-sidebar-label-gap,6px);width:100%;height:32px;padding:0 8px;padding-inline-start:calc(var(--dsh-sidebar-row-padding,12px) - var(--dsh-sidebar-paint-inset,3px) + var(--ssh-indent,0px));border-inline:var(--dsh-sidebar-paint-inset,3px) solid transparent;border-radius:var(--dsw-radius-md,12px);background-clip:padding-box;background-color:transparent;color:var(--dsw-alias-label-primary,inherit);font:inherit;font-size:14px;font-weight:400;cursor:pointer;min-width:0;outline:none;user-select:none}
      .dsh-sb-row:hover,.dsh-sb-row:focus-visible,.dsh-sb-row.menu-open,.dsh-sb-row.current{background-color:var(--dsw-alias-interactive-bg-hover,color-mix(in srgb,currentColor 8%,transparent))}
      .dsh-sb-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px}
      .dsh-sb-leading{position:relative;display:inline-flex;justify-content:center;align-items:center;flex:none;width:16px;height:20px;padding:0;border:0;background:none;color:var(--dsw-alias-label-tertiary,inherit);cursor:pointer}
      .dsh-sb-leading>svg{width:16px;height:16px}.dsh-sb-leading>.dsh-sb-chevron{display:none;width:14px;height:14px}.dsh-sb-chevron.open{transform:rotate(90deg)}
      .dsh-sb-row:hover .dsh-sb-folder,.dsh-sb-row:focus-within .dsh-sb-folder{display:none}.dsh-sb-row:hover .dsh-sb-chevron,.dsh-sb-row:focus-within .dsh-sb-chevron{display:block}
      .dsh-sb-dot{position:absolute;bottom:0;right:-2px;width:5px;height:5px;border-radius:50%;background:#86efac;box-shadow:0 0 0 2px var(--dsw-alias-bg-base,#1e1e2e)}.dsh-sb-dot.error{background:#e56767}
      .dsh-sb-actions{flex:none;display:none;align-items:center;gap:13px;height:20px}.dsh-sb-row:hover .dsh-sb-actions,.dsh-sb-row:focus-within .dsh-sb-actions,.dsh-sb-row.menu-open .dsh-sb-actions{display:inline-flex}
      .dsh-sb-icon{display:inline-flex;justify-content:center;align-items:center;flex:none;width:24px;height:24px;margin:-4px;padding:0;border:0;border-radius:var(--dsw-radius-xs,4px);background:none;color:var(--dsw-alias-label-tertiary,inherit);font:inherit;font-size:13.3333px;cursor:pointer}
      .dsh-sb-icon svg{width:16px;height:16px}.dsh-sb-icon svg[data-icon=dsw-icon-new-chat-outline-regular]{width:14px;height:14px}.dsh-sb-icon:hover,.dsh-sb-icon:focus-visible{color:var(--dsw-alias-label-primary,inherit)}.dsh-sb-icon.connected{color:#86efac}
      .dsh-sb-head>.dsh-sb-icon{width:28px;height:28px;margin:0}
      .dsh-sb-session-row{gap:0;padding-inline-start:calc(var(--dsh-sidebar-row-padding,12px) - var(--dsh-sidebar-paint-inset,3px) + 16px + var(--dsh-sidebar-label-gap,6px) + var(--ssh-indent,0px))}
      .dsh-sb-session-row .dsh-sb-title{margin-right:6px}.dsh-sb-time{flex:none;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary,inherit)}.dsh-sb-session-row:hover .dsh-sb-time,.dsh-sb-session-row:focus-within .dsh-sb-time,.dsh-sb-session-row.menu-open .dsh-sb-time{display:none}
      .dsh-ssh-flat-menu [data-context-menu] [role=separator]{display:none}
      .dsh-sb-empty{padding:8px 12px;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary,inherit)}
      .dsh-sb-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:10000;max-width:420px;padding:9px 14px;border-radius:8px;background:var(--dsw-alias-bg-elevated,Canvas);color:CanvasText;border:1px solid color-mix(in srgb,currentColor 14%,transparent);box-shadow:0 10px 28px #0005;font-size:12px;line-height:1.5}
      .dsh-sb-confirm{width:360px;max-width:calc(100vw - 40px);padding:24px;box-sizing:border-box;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:16px;background:var(--dsw-alias-bg-elevated,#272735);color:var(--dsw-alias-label-primary,#cdd6f4);font:inherit;box-shadow:0 16px 60px #0006}.dsh-sb-confirm::backdrop{background:#0007}.dsh-sb-confirm h2{font-size:17px;margin:0 0 16px}.dsh-sb-confirm p{font-size:13px;line-height:1.6;overflow-wrap:anywhere}.dsh-sb-error{color:#e56767}.dsh-sb-confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}.dsh-sb-confirm-actions button{padding:7px 14px;border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:8px;background:none;color:inherit;font:inherit;font-size:13px;cursor:pointer}.dsh-sb-confirm-actions .danger{background:#c64747;color:white;border-color:#c64747}
      @media(hover:none){.dsh-sb-actions{display:inline-flex}.dsh-sb-time{display:none}}
    `;
    function installRemoteSidebar(ctx, api, PANEL) {
      const style = document.createElement('style'); style.textContent = SIDEBAR_CSS;
      const hide = document.createElement('style'); document.head.append(style, hide);
      const host = document.createElement('div'); host.className = 'dsh-sb'; host.setAttribute('aria-label', tr('sidebar.aria'));
      const STATE_KEY = 'dsh-ssh-remote-workspace:sidebar-v2';
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}') ?? {}; } catch { /* optional storage */ }
      let sectionCollapsed = saved.collapsed !== false;
      const collapsedServers = new Set(Array.isArray(saved.servers) ? saved.servers : []);
      const collapsedWorkspaces = new Set(Array.isArray(saved.workspaces) ? saved.workspaces : []);
      const serverOrder = Array.isArray(saved.serverOrder) ? saved.serverOrder : [];
      const workspaceOrder = Array.isArray(saved.workspaceOrder) ? saved.workspaceOrder : [];
      let tree = { servers: [] }, disposed = false, loading = false, loaded = false, frame, toast, dialog;
      let actionBusy = false;
      const cm = ctx.get?.('contextMenus') ?? ctx.contextMenus;
      const sessions = () => ctx.sessions.list.getSnapshot().byId;
      const selection = () => ctx.uiWorkspace.selection?.getSnapshot?.().sessionId;
      const persist = () => { try { localStorage.setItem(STATE_KEY, JSON.stringify({ collapsed: sectionCollapsed,
        servers: [...collapsedServers], workspaces: [...collapsedWorkspaces], serverOrder, workspaceOrder })); } catch { /* optional */ } };
      const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
      const icon = (name, size = 16) => {
        const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('aria-hidden', 'true');
        svg.dataset.icon = `dsw-icon-${name}`;
        if (name === 'remote-server') {
          svg.setAttribute('viewBox', '0 0 24 24');
          for (const d of ['M4 3h16a1 1 0 0 1 1 1v12H3V4a1 1 0 0 1 1-1Z', 'M8 21h8M12 16v5M7 7l3 2-3 2M13 11h4']) {
            const path = document.createElementNS(ns, 'path'); path.setAttribute('d', d); path.setAttribute('fill', 'none');
            path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.6'); path.setAttribute('stroke-linecap', 'round'); svg.append(path);
          }
        } else { const use = document.createElementNS(ns, 'use'); use.setAttribute('href', `#dsw-icon-${name}`); svg.append(use); }
        return svg;
      };
      const button = (name, label, run, size = 16) => {
        const b = el('button', 'dsh-sb-icon'); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label); b.append(icon(name, size));
        b.addEventListener('click', e => { e.stopPropagation(); run(e); }); return b;
      };
      const time = value => { const at = typeof value === 'string' ? Date.parse(value) : Number(value); if (!Number.isFinite(at)) return '';
        const m = Math.max(0, Math.floor((Date.now() - at) / 60000)); return m < 1 ? tr('common.justNow') : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`; };
      const titleOf = s => s?.blank ? tr('session.new') : s?.title?.trim() || s?.displayTitle?.trim() || tr('session.untitled');
      const serverStatus = status => tr({connected:'status.connected',saved:'status.notConnected',disconnected:'status.disconnected',error:'status.failed'}[status] ?? 'status.notConnected');
      const workspaceStatus = status => tr({connected:'status.connected',saved:'status.pending',disconnected:'status.disconnected',error:'status.failed'}[status] ?? 'status.pending');
      const workspaces = () => tree.servers.flatMap(server => server.workspaces);
      const findWorkspace = id => workspaces().find(w => w.workspaceId === id);
      const findSessionWorkspace = id => workspaces().find(w => (w.conversations ?? []).some(s => s.id === id));
      const ordered = (items, order, key) => { for (const item of items) if (!order.includes(key(item))) order.push(key(item));
        return [...items].sort((a,b) => order.indexOf(key(a)) - order.indexOf(key(b))); };
      function notify(text) { toast?.remove(); toast = el('div', 'dsh-sb-toast', text); toast.setAttribute('role','status'); document.body.append(toast);
        const own = toast; setTimeout(() => { own.remove(); if (toast === own) toast = undefined; }, 5000); }
      async function run(action) { if (actionBusy) return; cm?.close(); actionBusy = true; schedule();
        try { await action(); } catch (e) { notify(friendly(e)); } finally { actionBusy = false; await refresh(); } }
      async function navigate(action) {
        const list = host.closest('[class*=scrollArea]'), top = list?.scrollTop; let userInput = false;
        const input = () => { userInput = true; };
        const restore = () => { if (!userInput && list && top !== undefined && list.scrollTop !== top) list.scrollTop = top; };
        for (const event of ['wheel','touchmove','pointerdown','keydown']) list?.addEventListener(event,input,{passive:true});
        list?.addEventListener('scroll',restore);
        try { await action(); await new Promise(r=>setTimeout(r,180)); } finally { restore(); list?.removeEventListener('scroll',restore);
          for (const event of ['wheel','touchmove','pointerdown','keydown']) list?.removeEventListener(event,input); }
      }
      const openConversation = conversation => run(() => navigate(() => ctx.uiWorkspace.openSession(conversation.id)));
      const newConversation = workspace => run(() => navigate(async () => {
        const opened = await api('open',{local_path:workspace.localDir}); await ctx.uiWorkspace.openWorkspace(opened.workspaceId);
      }));
      const connectWorkspace = workspace => run(() => api(workspace.status === 'connected' ? 'disconnect' : 'check', { local_path: workspace.localDir }));
      function openMenu(target, trigger, point) {
        if (!cm) { notify(tr('sidebar.nativeMenuUnavailable')); return; }
        const active = cm.active.getSnapshot();
        if (active?.kind === target.kind && JSON.stringify(active.value) === JSON.stringify(target.value)) { cm.close(); return; }
        trigger.focus({preventScroll:true}); const rect = trigger.getBoundingClientRect();
        cm.open(target,point ?? {x:rect.left,y:rect.bottom},{button:`ssh:${target.kind}:${target.value.workspaceId ?? target.value.sessionId ?? target.value.alias}`});
      }
      function targetOfWorkspace(w) { return {kind:'workspace',value:{workspaceId:w.workspaceId,path:w.localDir,displayTitle:w.name || w.title || w.remoteDir}}; }
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
      ctx.slots.inject('contextMenu.icon',function*(){ for(const [key,Icon] of Object.entries({
        'ssh.link':primitives.IconLinkOutlineRegular,'ssh.new':primitives.IconNewChatOutlineRegular,
        'ssh.settings':primitives.IconSettingsOutlineRegular,'ssh.copy':primitives.IconCopyOutlineRegular,
      })) if(Icon) yield ctx.slots.register({name:'contextMenu.icon',key},Icon); });
      const removeServerMenu = cm?.register({id:'ssh.sidebar-server',target:'ssh-remote-server',order:100,
        resolve:({alias})=>{const server=tree.servers.find(s=>s.alias===alias);if(!server)return[];
          const w=server.workspaces.find(w=>!w.orphaned);
          return [{id:'status',label:serverStatus(server.status),disabled:true},
            ...(w?[{id:'connect',label:w.status==='connected'?tr('menu.disconnect'):tr('menu.connectServer'),icon:{key:'ssh.link'},run:()=>connectWorkspace(w)}]:[]),
            {id:'add',label:tr('menu.addRemoteWorkspace'),icon:{key:'ssh.new'},run:()=>ctx.layout.selectPanel(PANEL)},
            {id:'manage',label:tr('menu.manageServers'),icon:{key:'ssh.settings'},run:()=>ctx.layout.selectPanel(PANEL)}]; }});
      const removeWorkspaceMenu = cm?.register({id:'ssh.sidebar-workspace',target:'workspace',order:250,
        observe:()=>[ctx.workspaces.list], resolve:({workspaceId})=>{const w=findWorkspace(workspaceId);if(!w)return[];
          return [{id:'connect',label:w.status==='connected'?tr('menu.disconnect'):tr('menu.connectWorkspace'),icon:{key:'ssh.link'},disabled:w.orphaned===true,run:()=>connectWorkspace(w)},
            {id:'new',label:tr('menu.newSession'),icon:{key:'ssh.new'},disabled:w.orphaned===true,run:()=>newConversation(w)},
            {id:'copy',label:tr('menu.copyRemotePath'),icon:{key:'ssh.copy'},run:()=>navigator.clipboard.writeText(w.remoteDir)},
            {id:'manage',label:tr('menu.manageWorkspace'),icon:{key:'ssh.settings'},run:()=>ctx.layout.selectPanel(PANEL)}]; }});
      function confirmDelete(w,session) {
        dialog?.close();dialog?.remove();const node=el('dialog','dsh-sb-confirm');dialog=node;
        const heading=el('h2','', tr('dialog.deleteSession'));heading.id='ssh-remove-conversation';node.setAttribute('aria-labelledby',heading.id);
        const error=el('p','dsh-sb-error');error.setAttribute('role','alert');error.hidden=true;
        const actions=el('div','dsh-sb-confirm-actions'),cancel=el('button','', tr('common.cancel')),yes=el('button','danger',tr('menu.deleteSession'));
        cancel.type=yes.type='button';cancel.autofocus=true;let pending=false;
        const close=()=>{if(!pending){node.close();node.remove();if(dialog===node)dialog=undefined;}};
        cancel.addEventListener('click',close);node.addEventListener('cancel',e=>{e.preventDefault();close();});
        yes.addEventListener('click',async()=>{if(pending)return;if(sessions()[session.id]?.running){error.hidden=false;error.textContent=tr('dialog.stopFirst');return;}
          pending=true;cancel.disabled=yes.disabled=true;let archived=false;
          try{await ctx.uiWorkspace.archiveSession(session.id);archived=true;await api('forgetSession',{local_path:w.localDir,session_id:session.id});await refresh();pending=false;close();}
          catch(e){error.hidden=false;error.textContent=`${archived?tr('dialog.archivedRemovalFailed'):''}${friendly(e)}`;}
          finally{pending=false;cancel.disabled=yes.disabled=false;}});
        actions.append(cancel,yes);node.append(heading,el('p','',titleOf(session)),el('p','', tr('dialog.deleteSessionBody')),error,actions);
        document.body.append(node);node.showModal();
      }
      const removeDeleteMenu=cm?.register({id:'ssh.sidebar-delete-session',target:'session',order:700,
        observe:()=>[ctx.workspaces.list,ctx.sessions.list],resolve:({sessionId})=>{const w=findSessionWorkspace(sessionId),s=sessions()[sessionId];
          return !w||!s||s.blank?[]:[{id:'delete',label:tr('menu.deleteSession'),danger:true,afterContent:true,disabled:s.running===true,run:()=>confirmDelete(w,s)}];}});
      function hideRemote(servers) {
        const rules=[];
        for(const s of servers)for(const w of s.workspaces){if(!w.workspaceId)continue;const id=String(w.workspaceId).replace(/["\\]/g,'');
          rules.push(`[data-row-key="workspace:${id}"]{display:none!important}`,`*:has(> [data-row-key="workspace:${id}"]){display:none!important}`);
          for(const c of w.conversations??[])rules.push(`[data-row-key="session:${String(c.id).replace(/["\\]/g,'')}"]{display:none!important}`);
        }
        const css=rules.join('\n');if(hide.textContent!==css)hide.textContent=css;
      }
      function toggle(set,key){cm?.close();set.has(key)?set.delete(key):set.add(key);persist();render();}
      function rowShell(kind,key,label,expanded,indent,toggleRow,status) {
        const row=el('div',`dsh-sb-row dsh-sb-${kind}-row`);row.dataset.kind=kind;row.dataset.key=key;
        row.style.setProperty('--ssh-indent',`${indent}px`);row.setAttribute('role','treeitem');row.tabIndex=0;row.setAttribute('aria-expanded',String(expanded));row.title=label;
        const leading=el('button','dsh-sb-leading');leading.type='button';leading.title=expanded?tr('sidebar.collapseRow',{name:label}):tr('sidebar.expandRow',{name:label});leading.setAttribute('aria-label',leading.title);
        const glyph=icon(kind==='server'?'remote-server':expanded?'folder-open-regular':'folder-close-regular');glyph.classList.add('dsh-sb-folder');
        const arrow=icon('triangle-right-fill-regular',14);arrow.classList.add('dsh-sb-chevron');if(expanded)arrow.classList.add('open');leading.append(glyph,arrow);
        if(status==='connected'||status==='error'){const dot=el('span',`dsh-sb-dot ${status}`);leading.append(dot);}
        leading.addEventListener('click',e=>{e.stopPropagation();toggleRow();});row.append(leading,el('span','dsh-sb-title',label));
        row.addEventListener('click',toggleRow);row.addEventListener('keydown',e=>{if(e.target!==row)return;
          if(e.key==='Enter'||e.key===' '||e.key==='ArrowRight'&&!expanded||e.key==='ArrowLeft'&&expanded){e.preventDefault();toggleRow();}});
        const actions=el('span','dsh-sb-actions');row.append(actions);return {row,actions};
      }
      function menuButton(row,target,label){const more=button('ellipsis-outline-regular',label,e=>openMenu(target,e.currentTarget));more.setAttribute('data-context-menu-trigger','');more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded','false');
        row.addEventListener('contextmenu',e=>{e.preventDefault();openMenu(target,more,{x:e.clientX,y:e.clientY});});return more;}
      function render() {
        frame=undefined;if(disposed)return;
        if(ownsMenu(cm?.active?.getSnapshot?.())&&host.childElementCount)return;
        const outer=host.closest('[class*=scrollArea]'),scroll=outer?.scrollTop;
        const focused=host.contains(document.activeElement)?document.activeElement?.getAttribute('aria-label'):undefined;
        host.setAttribute('aria-label',tr('sidebar.aria'));
        host.replaceChildren();const head=el('div','dsh-sb-head');
        const sectionToggle=el('button','dsh-sb-section-toggle');sectionToggle.type='button';sectionToggle.setAttribute('aria-expanded',String(!sectionCollapsed));
        sectionToggle.setAttribute('aria-label',sectionCollapsed?tr('sidebar.expand'):tr('sidebar.collapse'));sectionToggle.append(icon('chevron-right-outline-regular',14),el('span','', tr('app.name')));
        sectionToggle.addEventListener('click',()=>{cm?.close();sectionCollapsed=!sectionCollapsed;persist();render();});head.append(sectionToggle);
        for(const [name,label]of[['settings-outline-regular',tr('sidebar.manage')],['project-add-outline-regular',tr('sidebar.add')]]){const b=button(name,label,()=>ctx.layout.selectPanel(PANEL));b.classList.add('dsh-sb-header-action');head.append(b);}
        host.append(head);
        if(!sectionCollapsed){const body=el('div','dsh-sb-body');body.setAttribute('role','tree');body.setAttribute('aria-label',tr('sidebar.treeAria'));host.append(body);
          if(!loaded)body.append(el('div','dsh-sb-empty',tr('sidebar.loading')));
          else if(!tree.servers.length)body.append(el('div','dsh-sb-empty',tr('sidebar.empty')));
          for(const server of ordered(tree.servers,serverOrder,s=>s.alias)){
            const expanded=!collapsedServers.has(server.alias),group=el('div','dsh-sb-server');
            const {row,actions}=rowShell('server',server.alias,server.alias,expanded,0,()=>toggle(collapsedServers,server.alias),server.status);
            row.title=`${server.alias}\n${server.hostname}\n${server.message?friendly(new Error(server.message)):serverStatus(server.status)}`;
            const primary=server.workspaces.find(w=>!w.orphaned);
            actions.append(menuButton(row,{kind:'ssh-remote-server',value:{alias:server.alias}},tr('sidebar.serverActions',{name:server.alias})));
            if(primary)actions.append(button('link-outline-regular',primary.status==='connected'?tr('sidebar.disconnectServer',{name:server.alias}):tr('sidebar.connectServer',{name:server.alias}),()=>connectWorkspace(primary)));
            actions.append(button('project-add-outline-regular',tr('sidebar.addWorkspace',{name:server.alias}),()=>ctx.layout.selectPanel(PANEL)));
            group.append(row);body.append(group);if(!expanded)continue;
            const serverBody=el('div','dsh-sb-body');serverBody.setAttribute('role','group');group.append(serverBody);
            for(const w of ordered(server.workspaces,workspaceOrder,w=>`${server.alias}:${w.localDir}`)){
              const wk=`${server.alias}:${w.localDir}`,open=!collapsedWorkspaces.has(wk),name=w.name||w.title||w.remoteDir;
              const workspaceNode=el('div','dsh-sb-workspace');const parts=rowShell('workspace',w.localDir,name,open,16,()=>toggle(collapsedWorkspaces,wk),w.status);
              parts.row.dataset.workspaceId=w.workspaceId??'';parts.row.title=`${name}\n${server.alias}:${w.remoteDir}\n${w.message?friendly(new Error(w.message)):workspaceStatus(w.status)}`;
              if(w.workspaceId&&!w.orphaned){parts.actions.append(menuButton(parts.row,targetOfWorkspace(w),tr('sidebar.workspaceActions',{name})));
                const connect=button('link-outline-regular',w.status==='connected'?tr('sidebar.disconnectWorkspace',{name}):tr('sidebar.connectWorkspace',{name}),()=>connectWorkspace(w));if(w.status==='connected')connect.classList.add('connected');
                parts.actions.append(connect,button('new-chat-outline-regular',tr('sidebar.newSession',{name}),()=>newConversation(w),14));}
              workspaceNode.append(parts.row);serverBody.append(workspaceNode);if(!open)continue;
              const list=el('div','dsh-sb-body');list.setAttribute('role','group');workspaceNode.append(list);
              const byId=sessions(),current=selection();
              for(const c of w.conversations??[]){const s=byId[c.id];if(c.archived||!s||s.origin==='subagent'||s.blank&&c.id!==current)continue;
                const label=titleOf(s),item=el('div',`dsh-sb-row dsh-sb-session-row${c.id===current?' current':''}`);item.dataset.kind='session';item.dataset.key=c.id;item.dataset.sessionId=c.id;
                item.style.setProperty('--ssh-indent','32px');item.tabIndex=0;item.setAttribute('role','treeitem');item.setAttribute('aria-selected',String(c.id===current));item.title=label;
                item.append(el('span','dsh-sb-title',label),el('span','dsh-sb-time',time(s.updatedAt)));
                item.addEventListener('click',()=>openConversation(c));item.addEventListener('keydown',e=>{if(e.target===item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openConversation(c);}});
                if(!s.blank){const actions=el('span','dsh-sb-actions');actions.append(menuButton(item,{kind:'session',value:{sessionId:c.id,displayTitle:label}},tr('sidebar.sessionActions',{name:label})));item.append(actions);}
                list.append(item);
              }
            }
          }
        }
        if(outer&&scroll!==undefined)outer.scrollTop=scroll;
        if(focused)[...host.querySelectorAll('[aria-label]')].find(e=>e.getAttribute('aria-label')===focused)?.focus({preventScroll:true});
      }
      function ownsMenu(active){return active?.kind==='ssh-remote-server'&&tree.servers.some(s=>s.alias===active.value.alias)
        ||active?.kind==='workspace'&&!!findWorkspace(active.value.workspaceId)||active?.kind==='session'&&!!findSessionWorkspace(active.value.sessionId);}
      const schedule=()=>{if(!disposed&&frame===undefined)frame=setTimeout(render,0);};
      async function refresh(){if(disposed||loading)return;loading=true;
        try{const next=await api('tree');if(!disposed){tree=next;loaded=true;ordered(tree.servers,serverOrder,s=>s.alias);for(const s of tree.servers)ordered(s.workspaces,workspaceOrder,w=>`${s.alias}:${w.localDir}`);persist();hideRemote(tree.servers);schedule();}}
        catch(e){console.warn('[dsh-ssh-remote-workspace] sidebar refresh:',e);}finally{loading=false;}}
      const updateMenu=()=>{const active=cm?.active?.getSnapshot?.(),own=ownsMenu(active);document.documentElement.classList.toggle('dsh-ssh-flat-menu',Boolean(own));
        for(const row of host.querySelectorAll('[data-kind]')){const open=own&&(row.dataset.kind==='server'&&active.kind==='ssh-remote-server'&&row.dataset.key===active.value.alias
          ||row.dataset.kind==='workspace'&&active.kind==='workspace'&&row.dataset.workspaceId===active.value.workspaceId
          ||row.dataset.kind==='session'&&active.kind==='session'&&row.dataset.key===active.value.sessionId);row.classList.toggle('menu-open',Boolean(open));row.querySelector('[aria-haspopup=menu]')?.setAttribute('aria-expanded',String(Boolean(open)));}
        if(!own)schedule();};
      const attach=()=>{const region=document.querySelector('[class*=regionArea]');if(region&&host.parentElement!==region)region.append(host);};
      const observer=new MutationObserver(()=>{if(!disposed)attach();});observer.observe(document.body,{childList:true,subtree:true});
      const offWorkspaces=ctx.workspaces.list.subscribe(()=>{void refresh();}),offSessions=ctx.sessions.list.subscribe(schedule),offSelection=ctx.uiWorkspace.selection?.subscribe?.(schedule),offMenu=cm?.active?.subscribe?.(updateMenu);
      const offLocale=(ctx.get?.('locale')??ctx.locale)?.subscribe?.(()=>{if(disposed)return;cm?.close();if(dialog){dialog.close();dialog.remove();dialog=undefined;}schedule();});
      const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},4000);
      attach();void refresh();
      return {refresh,dispose(){disposed=true;observer.disconnect();offWorkspaces?.();offSessions?.();offSelection?.();offMenu?.();offLocale?.();
        removeServerMenu?.();removeWorkspaceMenu?.();removeDeleteMenu?.();clearInterval(timer);if(frame!==undefined)clearTimeout(frame);
        document.documentElement.classList.remove('dsh-ssh-flat-menu');dialog?.close();dialog?.remove();toast?.remove();host.remove();style.remove();hide.remove();}};
    }
    function Icon({ size = 18 } = {}) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('rect', { x: 3, y: 3, width: 18, height: 12, rx: 2 }),
      h('path', { d: 'M8 21h8M12 15v6M7 7l3 2-3 2M13 11h4' }));
    }
    function localizeHostError(message) {
      const exact = {
        '请选择有效的 SSH 服务器。': 'errors.invalidHost',
        '请输入以 / 开头的路径。': 'errors.absolutePath',
        '没有权限浏览这个目录，请选择其他目录。': 'errors.browsePermission',
        '目录不存在或已被移走，请返回上级目录。': 'errors.directoryGone',
        '密码不能为空。': 'errors.passwordEmpty',
        '密码不能包含换行符，因为 SSH 只读取一行。': 'errors.passwordNewline',
        '无效的服务器名称。': 'errors.invalidHostName',
        '工作区名称请使用不超过 80 个字符的单行文字。': 'errors.workspaceNameInvalid',
        '本地工作区路径必须是绝对路径。': 'errors.localAbsolutePath',
        '远程工作区路径必须是绝对路径。': 'errors.remoteAbsolutePathRequired',
        '远程工作区已断开，请在远程工作区面板中重新连接。': 'errors.remoteDisconnected',
        '远程工作区已断开，请重新连接。': 'errors.remoteDisconnected',
        '这个路径属于已有本地工作区，请选择独立的空目录作为远程占位目录。': 'errors.remotePlaceholderConflict',
        '远程占位路径必须是空目录，不能使用已有本地项目或符号链接。': 'errors.placeholderNotEmpty',
        '同一主机上已有同名工作区，请使用其他名称。': 'errors.duplicateWorkspace',
        '密码存储不可用，请检查插件配置中的 secretsFile。': 'errors.passwordStoreUnavailable',
        '远程映射信息已丢失，请在上方重新选择服务器和目录后连接。': 'errors.remoteMappingLost',
        '请填写以 / 开头的远程绝对路径。': 'errors.remoteAbsolutePath',
        '这个工作区正在连接，请稍候。': 'errors.workspaceConnecting',
        '本地工作区路径不能包含 ..。': 'errors.localPathTraversal',
        '这个工作区正在处理其他操作，请稍后重试。': 'errors.workspaceBusy',
        '这个本地工作区已对应其他远程目录，请选择其他路径。': 'errors.localMappedElsewhere',
        '工作区服务尚未就绪，请稍后重试。': 'errors.workspaceServiceUnavailable',
        '找不到这个远程工作区，请重新打开远程工作区面板后重试。': 'errors.workspaceMissing',
        '会话不属于这个远程工作区。': 'errors.sessionNotInWorkspace',
        '请先归档会话，再从远程列表移除。': 'errors.archiveFirst',
        '找不到这个远程工作区的映射记录。': 'errors.mappingMissing',
        '工作区中仍有任务在运行，请先结束任务，再移除工作区。': 'errors.removeRunning',
        '移除未完成，恢复工作区状态时发生错误，请重新打开远程工作区面板后重试。': 'errors.removeUnfinished',
      };
      if (exact[message] !== undefined) return tr(exact[message]);
      let match = message.match(/^密码不能超过 (\d+) 个字符。$/u);
      if (match) return tr('errors.passwordTooLong', { count: match[1] });
      match = message.match(/^SSH 连接失败（(\d+)）$/u);
      if (match) return tr('errors.sshFailed', { code: match[1] });
      match = message.match(/^无法访问远程目录：(.*)$/su);
      if (match) return tr('errors.remoteAccess', { detail: match[1] });
      match = message.match(/^远程目录不存在：(.*)$/su);
      if (match) return tr('errors.remoteDirMissing', { path: match[1] });
      match = message.match(/^这个路径不是目录：(.*)$/su);
      if (match) return tr('errors.remoteNotDirectory', { path: match[1] });
      if (message.includes('远程命令返回 255')) return tr('errors.remote255');
      return message;
    }
    function friendly(error) {
      const message = error?.message || String(error);
      // The host needs a password: the panel shows the password field instead.
      if (needsPassword(error)) {
        return baselineLocale(localeRuntime?.getSnapshot?.().active) === 'zh'
          ? message.split(PASSWORD_MARKER).join('').trim()
          : tr('errors.passwordRequired');
      }
      if (/Permission denied|publickey|authentication/i.test(message)) return tr('errors.auth');
      if (/timed out|timeout|ETIMEDOUT/i.test(message)) return tr('errors.timeout');
      if (/resolve hostname|ENOTFOUND/i.test(message)) return tr('errors.hostNotFound');
      if (/Connection refused/i.test(message)) return tr('errors.refused');
      if (/Host key verification failed|REMOTE HOST IDENTIFICATION/i.test(message)) return tr('errors.hostKey');
      return localizeHostError(message);
    }
    function Folder() {
      return h('svg', { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, 'aria-hidden': true }, h('path', { d: 'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z' }));
    }
    function DirectoryPicker({ api, host, initialPath, initialPassword = '', onSelect, onClose }) {
      const dialog = useRef(null);
      const controller = useRef(null);
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState('');
      const [hidden, setHidden] = useState(false);
      const [filter, setFilter] = useState('');
      // Password entered in the connect form, or later inline below: every browse
      // attempt resubmits it, and the host remembers it once a listing succeeds.
      const [attempt, setAttempt] = useState(initialPassword);
      const [draft, setDraft] = useState(initialPassword);
      const [askPassword, setAskPassword] = useState(false);
      async function browse(path, showHidden = hidden, password = attempt) {
        controller.current?.abort();
        const request = new AbortController();
        controller.current = request;
        setLoading(true); setError(''); setFilter('');
        try {
          const next = await api('browse', { host, path, show_hidden: showHidden,
            ...(password ? { password } : {}) }, request.signal);
          if (request.signal.aborted) return;
          setAskPassword(false);
          setData(next);
        } catch (e) {
          if (request.signal.aborted) return;
          setError(friendly(e));
          if (needsPassword(e)) { setAskPassword(true); setDraft(password); }
        }
        finally { if (!request.signal.aborted) setLoading(false); }
      }
      useEffect(() => {
        dialog.current.showModal();
        browse(initialPath, hidden, initialPassword);
        return () => controller.current?.abort();
      }, []);
      const crumbs = data?.path.split('/').filter(Boolean) ?? [];
      const folders = data?.directories.filter((entry) => entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) ?? [];
      return h('dialog', { ref: dialog, 'aria-labelledby': 'dsh-ssh-picker-title',
        onCancel: (e) => { e.preventDefault(); onClose(); } },
        h('div', { className: 'dsh-ssh-dialog-head' }, h('div', null,
          h('h2', { id: 'dsh-ssh-picker-title' }, tr('picker.title')),
          h('p', { className: 'dsh-ssh-muted' }, tr('picker.server', { host }))),
          h('button', { type: 'button', onClick: onClose, 'aria-label': tr('picker.close') }, tr('common.close'))),
        h('div', { className: 'dsh-ssh-actions' },
          h('button', { type: 'button', disabled: loading, onClick: () => browse('') }, tr('picker.home')),
          h('button', { type: 'button', disabled: loading || !data?.parent, onClick: () => browse(data.parent) }, tr('picker.parent'))),
        h('nav', { className: 'dsh-ssh-breadcrumb', 'aria-label': tr('picker.cwdAria') },
          h('button', { type: 'button', disabled: loading, onClick: () => browse('/') }, '/'),
          crumbs.map((name, i) => h(React.Fragment, { key: i },
            h('button', { type: 'button', disabled: loading, onClick: () => browse('/' + crumbs.slice(0, i + 1).join('/')) }, name),
            i < crumbs.length - 1 && h('span', { 'aria-hidden': true }, '/')))),
        h('input', { 'aria-label': tr('picker.filterAria'), placeholder: tr('picker.filterPlaceholder'), value: filter, disabled: loading || !data,
          onChange: (e) => setFilter(e.target.value) }),
        error && h('p', { className: 'dsh-ssh-error', role: 'alert', style: { marginTop: 12 } }, error),
        askPassword && h('form', { className: 'dsh-ssh-picker-password', style: { marginTop: 12 },
            onSubmit: (e) => { e.preventDefault(); setAttempt(draft); browse(data?.path ?? initialPath, hidden, draft); } },
          h('input', { type: 'password', value: draft, autoFocus: true, autoComplete: 'new-password',
            'aria-label': tr('picker.passwordAria', { host }), placeholder: tr('picker.passwordPlaceholder'),
            onChange: (e) => setDraft(e.target.value) }),
          h('button', { type: 'submit', className: 'dsh-ssh-primary', disabled: loading || !draft }, tr('picker.savePasswordRetry'))),
        h('div', { className: 'dsh-ssh-folders', 'aria-busy': loading },
          loading ? h('p', { className: 'dsh-ssh-muted', role: 'status' }, tr('picker.loading')) :
            folders.length ? folders.map((entry) => h('button', { type: 'button', className: 'dsh-ssh-folder', key: entry.path,
              onClick: () => browse(entry.path), 'aria-label': tr('picker.openFolder', { name: entry.name }) },
              h(Folder), h('span', null, entry.name), h('b', { 'aria-hidden': true }, '›'))) :
              h('p', { className: 'dsh-ssh-muted' }, error ? tr('picker.backHome') : filter ? tr('picker.noMatches') : tr('picker.noChildren'))),
        data?.truncated && h('p', { className: 'dsh-ssh-muted' }, tr('picker.truncated')),
        h('label', { className: 'dsh-ssh-check' }, h('input', { type: 'checkbox', checked: hidden, disabled: loading,
          onChange: (e) => { setHidden(e.target.checked); browse(data?.path ?? initialPath, e.target.checked); } }), tr('picker.showHidden')),
        h('div', { className: 'dsh-ssh-dialog-footer' },
          h('button', { type: 'button', className: 'dsh-ssh-primary', disabled: loading || !data || !!error,
            onClick: () => onSelect(data.path) }, tr('picker.select'))));
    }
    function Chevron({ open }) {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        style: { transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' } },
      h('path', { d: 'M9 6l6 6-6 6' }));
    }
    function WorkspaceNode({ mount, disabled, busy, run, statuses, api, openWorkspace, refresh,
      renameWorkspace, setNotice, prompt, setPrompt, confirm, setConfirm, promptPassword, setPromptPassword }) {
      const [renaming, setRenaming] = useState(false);
      const [draft, setDraft] = useState('');
      const submitRename = (event) => {
        event.preventDefault();
        const title = draft.trim();
        if (!title || !mount.workspaceId) return;
        run(`rename:${mount.localDir}`, async (signal) => {
          await renameWorkspace(mount.workspaceId, title);
          setRenaming(false);
          await refresh(signal);
          setNotice(tr('workspace.renamed', { title }));
        });
      };
      return h('article', { className: 'dsh-ssh-mount', key: mount.localDir },
        h('div', { className: 'dsh-ssh-row' }, h('div', { className: 'dsh-ssh-host' }, h(Icon), mount.name),
          h('span', { className: `dsh-ssh-status ${mount.status}` }, statuses[mount.status])),
        renaming && h('form', { className: 'dsh-ssh-rename', onSubmit: submitRename },
          h('input', { value: draft, maxLength: 80, autoFocus: true, disabled,
            'aria-label': tr('workspace.nameAria', { alias: mount.alias }), placeholder: tr('workspace.namePlaceholder'),
            onChange: (e) => setDraft(e.target.value) }),
          h('button', { type: 'submit', className: 'dsh-ssh-primary', disabled: disabled || !draft.trim() }, tr('common.save')),
          h('button', { type: 'button', disabled, onClick: () => setRenaming(false) }, tr('common.cancel'))),
        h('p', { className: 'dsh-ssh-path' }, mount.remoteDir || (mount.orphaned ? tr('workspace.localPlaceholder', { path: mount.localDir }) : '')),
        mount.message && h('p', { className: 'dsh-ssh-error' }, friendly(new Error(mount.message))),
        mount.orphaned && h('p', { className: 'dsh-ssh-muted' }, tr('workspace.orphaned', { alias: mount.alias || tr('workspace.unknownServer') })),
        h('div', { className: 'dsh-ssh-actions' },
          h('button', { className: 'dsh-ssh-primary', disabled: disabled || mount.orphaned, onClick: () => run(`open:${mount.localDir}`, async (signal) => {
            await api('check', { local_path: mount.localDir }, signal);
            await openWorkspace(mount.localDir, signal);
          }) }, busy === `open:${mount.localDir}` ? tr('workspace.opening') : tr('workspace.newChat')),
          h('button', { disabled: disabled || mount.orphaned || !mount.workspaceId,
            onClick: () => { setDraft(mount.name); setRenaming(true); } }, tr('workspace.rename')),
          h('button', { disabled: disabled || mount.orphaned, onClick: () => run(`check:${mount.localDir}`, async (signal) => {
            await api('check', { local_path: mount.localDir }, signal); await refresh(signal);
          }) }, busy === `check:${mount.localDir}` ? tr('workspace.checking') : mount.status === 'disconnected' ? tr('workspace.reconnect') : tr('workspace.check')),
          h('button', { disabled: disabled || mount.orphaned, onClick: () => {
            setPrompt({ path: mount.localDir }); setPromptPassword('');
          } }, mount.hasPassword ? tr('workspace.changePassword') : tr('workspace.enterPassword')),
          h('button', { disabled, onClick: () => setConfirm({ path: mount.localDir, action: 'disconnect' }) }, tr('workspace.disconnect')),
          h('button', { disabled, className: 'dsh-ssh-danger', onClick: () => setConfirm({ path: mount.localDir, action: 'remove' }) }, tr('workspace.remove'))),
        mount.checkedAt && h('p', { className: 'dsh-ssh-muted', style: { marginTop: 10 } }, tr('workspace.lastChecked', { time: new Date(mount.checkedAt).toLocaleString() })),
        prompt?.path === mount.localDir && h('div', { className: 'dsh-ssh-confirm' },
          h('p', { className: 'dsh-ssh-muted' }, tr('workspace.passwordPrompt', { alias: mount.alias })),
          h('input', { type: 'password', value: promptPassword, disabled, autoComplete: 'new-password',
            placeholder: tr('workspace.passwordPlaceholder'), 'aria-label': tr('workspace.passwordAria', { alias: mount.alias }), style: { marginBottom: 12 },
            onChange: (e) => setPromptPassword(e.target.value) }),
          h('div', { className: 'dsh-ssh-actions' },
            h('button', { className: 'dsh-ssh-primary', disabled: disabled || promptPassword.length === 0,
              onClick: () => run(`check:${mount.localDir}`, async (signal) => {
                await api('check', { local_path: mount.localDir, password: promptPassword }, signal);
                setPrompt(null); setPromptPassword('');
                await refresh(signal);
                setNotice(tr('workspace.passwordSaved'));
              }) }, busy === `check:${mount.localDir}` ? tr('workspace.retrying') : tr('picker.savePasswordRetry')),
            h('button', { disabled, onClick: () => { setPrompt(null); setPromptPassword(''); } }, tr('common.cancel')))),
        confirm?.path === mount.localDir && h('div', { className: 'dsh-ssh-confirm' },
          h('p', { className: 'dsh-ssh-muted' }, confirm.action === 'remove'
            ? tr('workspace.confirmRemove')
            : tr('workspace.confirmDisconnect')),
          h('div', { className: 'dsh-ssh-actions' }, h('button', { className: 'dsh-ssh-danger', disabled,
            onClick: () => run(`${confirm.action}:${mount.localDir}`, async (signal) => {
              const action = confirm.action;
              await api(action, { local_path: mount.localDir }, signal); setConfirm(null);
              await refresh(signal);
              setNotice(action === 'remove' ? tr('workspace.removed') : tr('workspace.disconnected'));
            }) }, busy === `${confirm.action}:${mount.localDir}` ? tr('common.processing') : confirm.action === 'remove' ? tr('workspace.confirmRemoveAction') : tr('workspace.confirmDisconnectAction')),
            h('button', { disabled, onClick: () => setConfirm(null) }, tr('common.cancel')))));
    }
    function ServerSection({ server, disabled, busy, run, statuses, api,
      openWorkspace, refresh, renameWorkspace, prompt, setPrompt, confirm, setConfirm,
      promptPassword, setPromptPassword, setNotice }) {
      const [expanded, setExpanded] = useState(true);
      const checkable = server.workspaces.filter((mount) => !mount.orphaned);
      const checkAll = () => run(`checkall:${server.alias}`, async (signal) => {
        for (const mount of checkable) await api('check', { local_path: mount.localDir }, signal);
        await refresh(signal);
        setNotice(tr('workspace.checkedAll', { alias: server.alias, count: checkable.length }));
      });
      return h('section', { className: 'dsh-ssh-server' },
        h('div', { className: 'dsh-ssh-server-head', role: 'button', tabIndex: 0, 'aria-expanded': expanded,
          onClick: () => setExpanded((value) => !value),
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((value) => !value); } } },
          h(Chevron, { open: expanded }),
          h('div', { className: 'dsh-ssh-host' }, h(Icon), h('span', { className: 'dsh-ssh-server-name' }, server.alias)),
          server.hostname !== server.alias && h('span', { className: 'dsh-ssh-hostname-text' }, server.hostname),
          server.hasPassword && h('span', { className: 'dsh-ssh-remote-workspace-dot', title: tr('workspace.passwordStored'), 'aria-label': tr('workspace.passwordStored') }),
          h('span', { style: { flex: 1 } }),
          h('span', { className: `dsh-ssh-status ${server.status}` }, statuses[server.status]),
          checkable.length > 0 && h('button', { disabled, 'aria-label': tr('workspace.checkAllAria', { alias: server.alias }),
            onClick: (e) => { e.stopPropagation(); checkAll(); } },
            busy === `checkall:${server.alias}` ? tr('workspace.checkingAll') : tr('workspace.checkAll'))),
        expanded && h('div', { className: 'dsh-ssh-server-body' }, server.workspaces.map((mount) =>
          h(WorkspaceNode, { key: mount.localDir, mount, disabled, busy, run, statuses, api,
            openWorkspace, refresh, renameWorkspace, prompt, setPrompt, confirm, setConfirm,
            promptPassword, setPromptPassword, setNotice }))));
    }
    function ServerTree({ servers, disabled, busy, run, statuses, api,
      openWorkspace, refresh, renameWorkspace, prompt, setPrompt, confirm, setConfirm,
      promptPassword, setPromptPassword, setNotice }) {
      if (!servers.length) return h('div', { className: 'dsh-ssh-empty' }, h(Icon, { size: 30 }),
        h('strong', null, tr('workspace.noneTitle')), h('p', { className: 'dsh-ssh-muted' }, tr('workspace.noneBody')));
      return h('div', { className: 'dsh-ssh-tree' }, servers.map((server) =>
        h(ServerSection, { key: server.alias, server, disabled, busy, run, statuses, api,
          openWorkspace, refresh, renameWorkspace, prompt, setPrompt, confirm, setConfirm,
          promptPassword, setPromptPassword, setNotice })));
    }
    function RemotePanel({ api, openWorkspace, renameWorkspace, subscribeWorkspaces }) {
      const [snapshot, setSnapshot] = useState({ hosts: [], mounts: [], warnings: [], servers: [] });
      const [selection, setSelection] = useState({ host: '', path: '', name: '' });
      const { host, path, name } = selection;
      const setPath = (path) => setSelection((current) => ({ ...current, path, name: '' }));
      const setHost = (next) => setSelection((current) => {
        const host = typeof next === 'function' ? next(current.host) : next;
        return host === current.host ? current : { host, path: '', name: '' };
      });
      const [picker, setPicker] = useState(false);
      const [loading, setLoading] = useState(true);
      const [busy, setBusy] = useState('');
      const [error, setError] = useState('');
      const [notice, setNotice] = useState('');
      const [confirm, setConfirm] = useState(null);
      // The password lives only in this component's memory until it is submitted;
      // the host stores it, and the field is cleared again.
      const [password, setPassword] = useState('');
      const [passwordNeeded, setPasswordNeeded] = useState(false);
      const [prompt, setPrompt] = useState(null);
      const [promptPassword, setPromptPassword] = useState('');
      const passwordField = useRef(null);
      const lifetime = useRef(null);
      const lock = useRef(false);
      const refreshId = useRef(0);
      const refresh = async (signal) => {
        const id = ++refreshId.current;
        const [next, tree] = await Promise.all([
          api('list', undefined, signal),
          // A tree hiccup keeps the last good hierarchy instead of blanking the panel.
          api('tree', undefined, signal).catch((error) => {
            if (!signal?.aborted) console.warn('[dsh-ssh-remote-workspace] tree refresh failed:', error);
            return null;
          }),
        ]);
        if (signal?.aborted || id !== refreshId.current) return;
        setSnapshot((current) => ({ ...next, servers: tree?.servers ?? current.servers }));
        setHost((current) => next.hosts.some((entry) => entry.alias === current) ? current : next.hosts[0]?.alias ?? '');
      };
      useEffect(() => {
        const controller = new AbortController();
        lifetime.current = controller;
        refresh(controller.signal).catch((e) => { if (!controller.signal.aborted) setError(friendly(e)); })
          .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        const unsubscribe = subscribeWorkspaces?.(() => { refresh(controller.signal).catch(() => {}); });
        return () => { unsubscribe?.(); controller.abort(); };
      }, []);
      // The field is disabled while the failed attempt is still settling, so the
      // focus has to wait for that render rather than run inside the catch.
      useEffect(() => {
        if (passwordNeeded && !busy && !loading) passwordField.current?.focus();
      }, [passwordNeeded, busy, loading]);
      async function run(key, operation) {
        if (lock.current) return;
        lock.current = true;
        setBusy(key); setError(''); setNotice(''); setPasswordNeeded(false);
        const signal = lifetime.current.signal;
        try { await operation(signal); }
        catch (e) {
          if (!signal.aborted) {
            setError(friendly(e));
            if (needsPassword(e)) setPasswordNeeded(true);
            await refresh(signal).catch(() => {});
          }
        } finally {
          lock.current = false;
          if (!signal.aborted) setBusy('');
        }
      }
      const disabled = loading || !!busy;
      async function connect(event) {
        event.preventDefault();
        if (!path.startsWith('/')) { setError(tr('panel.choosePathFirst')); return; }
        await run('connect', async (signal) => {
          const mount = await api('connect', { host, remote_path: path, ...(name.trim() ? { name: name.trim() } : {}),
            ...(password.length > 0 ? { password } : {}) }, signal);
          setPassword('');
          await refresh(signal);
          setNotice(tr('panel.connectSuccess'));
          await openWorkspace(mount.localDir, signal);
        });
      }
      const selectedHost = snapshot.hosts.find((entry) => entry.alias === host);
      const statuses = { connected: tr('status.connected'), saved: tr('status.pending'), disconnected: tr('status.disconnected'), error: tr('status.failed') };
      return h('section', { className: 'dsh-ssh-page', 'aria-label': tr('app.name') },
        h('style', null, CSS),
        h('div', { className: 'dsh-ssh-inner' },
          h('header', { className: 'dsh-ssh-header' }, h('div', null,
            h('div', { className: 'dsh-ssh-kicker' }, h(Icon, { size: 14 }), 'SSH'),
            h('h1', null, tr('panel.title')))),
          error && h('div', { className: 'dsh-ssh-error', role: 'alert' }, error),
          notice && h('div', { className: 'dsh-ssh-notice', role: 'status' }, notice),
          h('form', { className: 'dsh-ssh-card', onSubmit: connect },
            h('h2', null, tr('panel.connectTitle')),
            h('div', { className: 'dsh-ssh-grid' },
              h('label', { className: 'dsh-ssh-field' }, tr('panel.server'),
                h('select', { value: host, onChange: (e) => setHost(e.target.value), disabled: disabled || !snapshot.hosts.length, required: true },
                  !snapshot.hosts.length && h('option', { value: '' }, loading ? tr('panel.loadingServers') : tr('panel.noServers')),
                  snapshot.hosts.map((entry) => h('option', { value: entry.alias, key: entry.alias },
                    entry.hasPassword ? tr('panel.passwordSavedOption', { alias: entry.alias }) : entry.alias)))),
              h('label', { className: 'dsh-ssh-field' },
                h('span', null, tr('panel.passwordLabel')),
                h('input', { ref: passwordField, type: 'password', value: password, disabled, autoComplete: 'new-password',
                  className: passwordNeeded ? 'dsh-ssh-needed' : undefined,
                  placeholder: passwordNeeded ? tr('panel.passwordNeededPlaceholder') : undefined,
                  onChange: (e) => { setPassword(e.target.value); setPasswordNeeded(false); } }))),
            selectedHost?.hasPassword === true && h('div', { className: 'dsh-ssh-actions', style: { justifyContent: 'flex-end', marginTop: 12 } },
              h('button', { type: 'button', disabled, onClick: () => run('forgetPassword', async (signal) => {
                await api('forgetPassword', { host }, signal);
                await refresh(signal);
                setNotice(tr('panel.clearedPassword', { host }));
              }) }, busy === 'forgetPassword' ? tr('panel.clearingPassword') : tr('panel.clearPassword'))),
            h('label', { className: 'dsh-ssh-field dsh-ssh-name-field' }, tr('panel.workspaceName'),
              h('input', { value: name, maxLength: 80, disabled, placeholder: path.split('/').filter(Boolean).pop() || undefined,
                onChange: (e) => setSelection(current => ({ ...current, name: e.target.value })) })),
            h('div', { className: 'dsh-ssh-field dsh-ssh-name-field' },
              h('span', { id: 'dsh-ssh-directory-label' }, tr('panel.remoteDirectory')),
              h('button', { type: 'button', className: 'dsh-ssh-picker', disabled: disabled || !host,
                'aria-label': path ? tr('panel.changeDirectoryAria', { path }) : tr('panel.selectDirectoryAria'), onClick: () => setPicker(true), title: path },
                h(Folder), h('span', null, path || tr('panel.chooseFolder')))),
            h('div', { className: 'dsh-ssh-form-footer' },
              h('button', { type: 'submit', className: 'dsh-ssh-primary', disabled: disabled || !host || !path.trim() }, busy === 'connect' ? tr('panel.connecting') : tr('panel.connectAndOpen'))),
            !loading && !snapshot.hosts.length && h('p', { className: 'dsh-ssh-muted', style: { marginTop: 16 } }, tr('panel.sshConfigHint')),
            snapshot.warnings.map((warning, i) => h('p', { className: 'dsh-ssh-muted', key: i }, warning))),
          picker && h(DirectoryPicker, { api, host, initialPath: path, initialPassword: password,
            onClose: () => { setPicker(false); refresh(lifetime.current.signal).catch(() => {}); },
            onSelect: (next) => { setPath(next); setPicker(false); refresh(lifetime.current.signal).catch(() => {}); } }),
          h('div', { className: 'dsh-ssh-section-title' }, h('h2', null, tr('panel.savedWorkspaces'))),
          loading ? h('div', { className: 'dsh-ssh-empty', role: 'status' }, tr('panel.loadingWorkspaces')) :
          !snapshot.mounts.length ? h('div', { className: 'dsh-ssh-empty' }, h(Icon, { size: 30 }),
            h('strong', null, tr('workspace.noneTitle')), h('p', { className: 'dsh-ssh-muted' }, tr('workspace.noneBody'))) :
          !snapshot.servers.length ? h('div', { className: 'dsh-ssh-empty' }, h('strong', null, tr('panel.hierarchyFailed')),
            h('p', { className: 'dsh-ssh-muted' }, tr('panel.hierarchyFailedHint'))) :
          h(ServerTree, { servers: snapshot.servers, disabled, busy, run, statuses, api,
            openWorkspace, refresh, renameWorkspace, prompt, setPrompt, confirm, setConfirm,
            promptPassword, setPromptPassword, setNotice })));
    }
    return {
      inject: ['slots', 'layout', 'connection', 'workspaces', 'uiWorkspace', 'sessions', 'locale'],
      apply(ctx) {
        const locale = ctx.get?.('locale') ?? ctx.locale;
        if (locale !== undefined) localeRuntime = locale;
        if (locale?.register !== undefined) {
          ctx.effect(() => {
            const disposeEn = locale.register(LOCALE_NS, 'en', UI_COPY.en);
            const disposeZh = locale.register(LOCALE_NS, 'zh', UI_COPY.zh);
            return () => {
              disposeZh?.();
              disposeEn?.();
            };
          }, 'dsh-ssh-remote: locale dictionaries');
        }
        let sidebar;
        const api = async (method, request, signal) => {
          const result = await ctx.connection.rpc.call('/api', `sshRemoteUi/${method}`,
            { args: request === undefined ? {} : { request } }, signal);
          if (!result.ok) throw new Error(result.error.message);
          if (['connect', 'open', 'check', 'disconnect', 'remove'].includes(method)) sidebar?.refresh();
          return result.value;
        };
        ctx.effect(() => {
          sidebar = installRemoteSidebar(ctx, api, PANEL);
          return () => { sidebar.dispose(); sidebar = undefined; };
        });
        const openWorkspace = async (localDir, signal) => {
          signal?.throwIfAborted();
          const workspace = await api('open', { local_path: localDir }, signal);
          signal?.throwIfAborted();
          await ctx.uiWorkspace.openWorkspace(workspace.workspaceId);
        };
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL, locale: LOCALE_NS,
          inject: () => ({ api, openWorkspace,
            renameWorkspace: (workspaceId, title) => ctx.workspaces.rename(workspaceId, title),
            subscribeWorkspaces: (listener) => ctx.workspaces.list.subscribe(listener) }) },
          localizeComponent(RemotePanel)));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist',
          id: PANEL, order: -10, locale: LOCALE_NS, label: () => tr('app.name') }, Icon));
      },
    };
  },
});
