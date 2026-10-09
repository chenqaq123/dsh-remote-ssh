/* Native Harness client bundle. React and services come from its module loader. */
window.__ModuleLoader__.load({
  id: 'dsh-ssh-remote',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;
    const PANEL = 'ssh-remote';
    const BADGE_CSS = `
      .dsh-ssh-workspace-label{display:flex!important;align-items:center;gap:7px;min-width:0}
      .dsh-ssh-workspace-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .dsh-ssh-workspace-badge{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;font-size:10px;font-weight:400;line-height:1.4;color:var(--dsw-alias-label-tertiary,#8a8f98)}
      .dsh-ssh-remote-dot{width:4px;height:4px;flex-shrink:0;border-radius:50%;background:#86efac}
    `;
    const CSS = `
      ${BADGE_CSS}
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
      .dsh-ssh-name-field{margin-top:18px}.dsh-ssh-hostname{display:flex;align-items:center;gap:4px;font-size:10px;margin:8px 0 0;overflow-wrap:anywhere}
      .dsh-ssh-hostname-text{font-family:ui-monospace,SFMono-Regular,monospace;opacity:.62}
      .dsh-ssh-section-title{display:flex;align-items:center;justify-content:space-between;margin:28px 0 13px}
      .dsh-ssh-section-title h2{font-size:14px;margin:0;font-weight:600}.dsh-ssh-count{opacity:.5;font-size:12px;margin-left:8px}
      .dsh-ssh-mount{border:1px solid color-mix(in srgb,currentColor 12%,transparent);border-radius:12px;padding:18px 20px;margin-bottom:10px}
      .dsh-ssh-row{display:flex;align-items:center;justify-content:space-between;gap:15px}.dsh-ssh-host{display:flex;align-items:center;gap:9px;font-weight:600;font-size:14px;min-width:0;overflow-wrap:anywhere}.dsh-ssh-host svg{flex-shrink:0}
      .dsh-ssh-path{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;line-height:1.7;overflow-wrap:anywhere;opacity:.75;margin:9px 0 12px}
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
      .dsh-ssh-dialog-footer{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:18px;flex-wrap:wrap}
      @media(max-width:650px){.dsh-ssh-page{padding-left:18px;padding-right:18px}.dsh-ssh-grid{grid-template-columns:1fr}.dsh-ssh-card{padding:18px}.dsh-ssh-form-footer{align-items:flex-start;flex-direction:column}.dsh-ssh-form-footer button{width:100%}.dsh-ssh-header{align-items:flex-start}.dsh-ssh-row{gap:8px}}
    `;
    /** The native workspace row has no title slot; decorate only its label span. */
    function installWorkspaceBadges(ctx, api) {
      const lifetime = new AbortController();
      const style = document.createElement('style');
      style.textContent = BADGE_CSS;
      document.head.appendChild(style);
      const decorated = new Map();
      let mounts = [];
      let frame;
      const rows = '[data-row-key^="workspace:"]';
      const workspaceItems = () => ctx.workspaces.list.getSnapshot?.().items ?? [];
      const restore = (label, record) => {
        const title = workspaceItems().find(item => item.workspaceId === record.id)?.title ?? record.title;
        label.textContent = title;
        label.classList.remove('dsh-ssh-workspace-label');
        decorated.delete(label);
      };
      function render() {
        frame = undefined;
        if (lifetime.signal.aborted) return;
        const items = workspaceItems();
        const byId = new Map(mounts.map(mount => [mount.workspaceId ?? items.find(item => item.path === mount.localDir)?.workspaceId, mount]));
        for (const [label, record] of decorated) {
          if (!label.isConnected || !byId.has(record.id)) restore(label, record);
        }
        for (const row of document.querySelectorAll(rows)) {
          const id = row.getAttribute('data-row-key').slice('workspace:'.length);
          const mount = byId.get(id);
          if (!mount) continue;
          // Folder, chevron, label, actions: use the native label's structural seat,
          // without depending on generated CSS class names or touching row events.
          const label = row.querySelector(':scope > span:nth-of-type(3) > span');
          if (!label) continue;
          const record = decorated.get(label);
          const name = label.querySelector('.dsh-ssh-workspace-name');
          const badge = label.querySelector('.dsh-ssh-workspace-badge');
          if (name?.textContent === mount.name && badge?.textContent === mount.hostname) continue;
          const title = items.find(item => item.workspaceId === id)?.title ?? (record && name && badge ? record.title : label.textContent);
          const nameNode = document.createElement('span');
          nameNode.className = 'dsh-ssh-workspace-name';
          nameNode.textContent = mount.name;
          const badgeNode = document.createElement('span');
          badgeNode.className = 'dsh-ssh-workspace-badge';
          badgeNode.setAttribute('aria-label', `远程服务器 ${mount.hostname}`);
          badgeNode.title = `SSH · ${mount.alias}`;
          const dot = document.createElement('span');
          dot.className = 'dsh-ssh-remote-dot';
          dot.setAttribute('aria-hidden', 'true');
          badgeNode.append(dot, document.createTextNode(mount.hostname));
          label.classList.add('dsh-ssh-workspace-label');
          label.replaceChildren(nameNode, document.createTextNode(' '), badgeNode);
          decorated.set(label, { id, title });
        }
      }
      const schedule = () => {
        if (frame === undefined && !lifetime.signal.aborted) frame = requestAnimationFrame(render);
      };
      const observer = new MutationObserver(records => {
        if (records.some(record => (record.target.nodeType === 1 ? record.target : record.target.parentElement)?.closest(rows)
          || [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches(rows) || node.querySelector(rows))))) schedule();
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      const refresh = () => api('list', undefined, lifetime.signal).catch(() => {});
      const unsubscribe = ctx.workspaces.list.subscribe(refresh);
      refresh();
      return { refresh, update(snapshot) {
        if (lifetime.signal.aborted) return;
        mounts = snapshot.mounts;
        schedule();
      }, dispose() {
        lifetime.abort(); unsubscribe(); observer.disconnect();
        if (frame !== undefined) cancelAnimationFrame(frame);
        for (const [label, record] of decorated) restore(label, record);
        style.remove();
      } };
    }
    function Icon({ size = 18 } = {}) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('rect', { x: 3, y: 3, width: 18, height: 12, rx: 2 }),
      h('path', { d: 'M8 21h8M12 15v6M7 7l3 2-3 2M13 11h4' }));
    }
    function friendly(error) {
      const message = error?.message || String(error);
      if (/Permission denied|publickey|authentication/i.test(message)) return 'SSH 认证失败。请确认该服务器已配置密钥登录，且密钥已解锁。';
      if (/timed out|timeout|ETIMEDOUT/i.test(message)) return '连接超时。请检查网络、VPN 和服务器是否在线，然后重试。';
      if (/resolve hostname|ENOTFOUND/i.test(message)) return '找不到服务器。请检查 SSH 配置中的主机名和网络连接。';
      if (/Connection refused/i.test(message)) return '服务器拒绝连接。请检查 SSH 服务和端口。';
      if (/Host key verification failed|REMOTE HOST IDENTIFICATION/i.test(message)) return '服务器身份校验失败，请先核实 SSH 主机密钥。';
      return message;
    }
    function Folder() {
      return h('svg', { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.5, 'aria-hidden': true }, h('path', { d: 'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z' }));
    }
    function DirectoryPicker({ api, host, initialPath, onSelect, onClose }) {
      const dialog = useRef(null);
      const controller = useRef(null);
      const [data, setData] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState('');
      const [hidden, setHidden] = useState(false);
      const [filter, setFilter] = useState('');
      async function browse(path, showHidden = hidden) {
        controller.current?.abort();
        const request = new AbortController();
        controller.current = request;
        setLoading(true); setError(''); setFilter('');
        try {
          const next = await api('browse', { host, path, show_hidden: showHidden }, request.signal);
          if (request.signal.aborted) return;
          setData(next);
        } catch (e) { if (!request.signal.aborted) setError(friendly(e)); }
        finally { if (!request.signal.aborted) setLoading(false); }
      }
      useEffect(() => {
        dialog.current.showModal();
        browse(initialPath);
        return () => controller.current?.abort();
      }, []);
      const crumbs = data?.path.split('/').filter(Boolean) ?? [];
      const folders = data?.directories.filter((entry) => entry.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase())) ?? [];
      return h('dialog', { ref: dialog, 'aria-labelledby': 'dsh-ssh-picker-title',
        onCancel: (e) => { e.preventDefault(); onClose(); } },
        h('div', { className: 'dsh-ssh-dialog-head' }, h('div', null,
          h('h2', { id: 'dsh-ssh-picker-title' }, '选择远程项目目录'),
          h('p', { className: 'dsh-ssh-muted' }, `服务器 · ${host}`)),
          h('button', { type: 'button', onClick: onClose, 'aria-label': '关闭目录选择器' }, '关闭')),
        h('div', { className: 'dsh-ssh-actions' },
          h('button', { type: 'button', disabled: loading, onClick: () => browse('') }, '主目录'),
          h('button', { type: 'button', disabled: loading || !data?.parent, onClick: () => browse(data.parent) }, '上一级')),
        h('nav', { className: 'dsh-ssh-breadcrumb', 'aria-label': '当前目录' },
          h('button', { type: 'button', disabled: loading, onClick: () => browse('/') }, '/'),
          crumbs.map((name, i) => h(React.Fragment, { key: i },
            h('button', { type: 'button', disabled: loading, onClick: () => browse('/' + crumbs.slice(0, i + 1).join('/')) }, name),
            i < crumbs.length - 1 && h('span', { 'aria-hidden': true }, '/')))),
        h('input', { 'aria-label': '筛选当前目录', placeholder: '筛选文件夹…', value: filter, disabled: loading || !data,
          onChange: (e) => setFilter(e.target.value) }),
        error && h('p', { className: 'dsh-ssh-error', role: 'alert', style: { marginTop: 12 } }, error),
        h('div', { className: 'dsh-ssh-folders', 'aria-busy': loading },
          loading ? h('p', { className: 'dsh-ssh-muted', role: 'status' }, '正在读取远程目录…') :
            folders.length ? folders.map((entry) => h('button', { type: 'button', className: 'dsh-ssh-folder', key: entry.path,
              onClick: () => browse(entry.path), 'aria-label': `打开文件夹 ${entry.name}` },
              h(Folder), h('span', null, entry.name), h('b', { 'aria-hidden': true }, '›'))) :
              h('p', { className: 'dsh-ssh-muted' }, error ? '请返回主目录后重试。' : filter ? '没有匹配的文件夹。' : '此目录没有子文件夹。')),
        data?.truncated && h('p', { className: 'dsh-ssh-muted' }, '仅显示前 500 个文件夹。'),
        h('label', { className: 'dsh-ssh-check' }, h('input', { type: 'checkbox', checked: hidden, disabled: loading,
          onChange: (e) => { setHidden(e.target.checked); browse(data?.path ?? initialPath, e.target.checked); } }), '显示隐藏文件夹'),
        h('div', { className: 'dsh-ssh-dialog-footer' },
          h('button', { type: 'button', className: 'dsh-ssh-primary', disabled: loading || !data || !!error,
            onClick: () => onSelect(data.path) }, '选择此目录')));
    }
    function RemotePanel({ api, openWorkspace, subscribeWorkspaces }) {
      const [snapshot, setSnapshot] = useState({ hosts: [], mounts: [], warnings: [] });
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
      const lifetime = useRef(null);
      const lock = useRef(false);
      const refreshId = useRef(0);
      const refresh = async (signal) => {
        const id = ++refreshId.current;
        const next = await api('list', undefined, signal);
        if (signal?.aborted || id !== refreshId.current) return;
        setSnapshot(next);
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
      async function run(key, operation) {
        if (lock.current) return;
        lock.current = true;
        setBusy(key); setError(''); setNotice('');
        const signal = lifetime.current.signal;
        try { await operation(signal); }
        catch (e) {
          if (!signal.aborted) {
            setError(friendly(e));
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
        if (!path.startsWith('/')) { setError('请先选择远程项目目录。'); return; }
        await run('connect', async (signal) => {
          const mount = await api('connect', { host, remote_path: path, ...(name.trim() ? { name: name.trim() } : {}) }, signal);
          await refresh(signal);
          setNotice('连接成功，正在打开远程工作区…');
          await openWorkspace(mount.localDir, signal);
        });
      }
      const statuses = { connected: '可连接', saved: '待检查', error: '连接失败' };
      return h('section', { className: 'dsh-ssh-page', 'aria-label': '远程工作区' },
        h('style', null, CSS),
        h('div', { className: 'dsh-ssh-inner' },
          h('header', { className: 'dsh-ssh-header' }, h('div', null,
            h('div', { className: 'dsh-ssh-kicker' }, h(Icon, { size: 14 }), 'SSH'),
            h('h1', null, '远程工作区'), h('p', { className: 'dsh-ssh-muted' }, '连接服务器，在远程项目中继续工作。')),
            h('button', { disabled, onClick: () => run('refresh', refresh), 'aria-label': '刷新服务器和工作区' }, busy === 'refresh' ? '刷新中…' : '刷新')),
          error && h('div', { className: 'dsh-ssh-error', role: 'alert' }, error),
          notice && h('div', { className: 'dsh-ssh-notice', role: 'status' }, notice),
          h('form', { className: 'dsh-ssh-card', onSubmit: connect },
            h('h2', null, '连接远程项目'),
            h('div', { className: 'dsh-ssh-grid' },
              h('label', { className: 'dsh-ssh-field' }, '服务器',
                h('select', { value: host, onChange: (e) => setHost(e.target.value), disabled: disabled || !snapshot.hosts.length, required: true },
                  !snapshot.hosts.length && h('option', { value: '' }, loading ? '正在读取服务器…' : '未找到 SSH 服务器'),
                  snapshot.hosts.map((entry) => h('option', { value: entry.alias, key: entry.alias }, entry.alias))),
                h('span', { className: 'dsh-ssh-muted' }, snapshot.hosts.find(entry => entry.alias === host)?.hostname ?? '')),
              h('div', { className: 'dsh-ssh-field' }, h('span', { id: 'dsh-ssh-directory-label' }, '远程项目目录'),
                h('button', { type: 'button', className: 'dsh-ssh-picker', disabled: disabled || !host,
                  'aria-label': path ? `更改目录 ${path}` : '选择远程目录', onClick: () => setPicker(true), title: path },
                  h(Folder), h('span', null, path || '选择服务器上的文件夹…')))),
            h('label', { className: 'dsh-ssh-field dsh-ssh-name-field' }, '工作区名称',
              h('input', { value: name, maxLength: 80, disabled, placeholder: path.split('/').filter(Boolean).pop() || '默认使用项目文件夹名称',
                onChange: (e) => setSelection(current => ({ ...current, name: e.target.value })) })),
            h('div', { className: 'dsh-ssh-form-footer' },
              h('button', { type: 'submit', className: 'dsh-ssh-primary', disabled: disabled || !host || !path.trim() }, busy === 'connect' ? '连接并打开中…' : '连接并打开')),
            !loading && !snapshot.hosts.length && h('p', { className: 'dsh-ssh-muted', style: { marginTop: 16 } }, '请先在 ~/.ssh/config 添加服务器，再点击刷新。'),
            snapshot.warnings.map((warning, i) => h('p', { className: 'dsh-ssh-muted', key: i }, warning))),
          picker && h(DirectoryPicker, { api, host, initialPath: path, onClose: () => setPicker(false),
            onSelect: (next) => { setPath(next); setPicker(false); } }),
          h('div', { className: 'dsh-ssh-section-title' }, h('h2', null, '已保存的远程工作区',
            h('span', { className: 'dsh-ssh-count' }, snapshot.mounts.length))),
          loading ? h('div', { className: 'dsh-ssh-empty', role: 'status' }, '正在读取工作区…') :
          !snapshot.mounts.length ? h('div', { className: 'dsh-ssh-empty' }, h(Icon, { size: 30 }),
            h('strong', null, '还没有远程工作区'), h('p', { className: 'dsh-ssh-muted' }, '选择服务器和项目目录，建立第一个连接。')) :
          snapshot.mounts.map((mount) => h('article', { className: 'dsh-ssh-mount', key: mount.localDir },
            h('div', { className: 'dsh-ssh-row' }, h('div', { className: 'dsh-ssh-host' }, h(Icon), mount.name),
              h('span', { className: `dsh-ssh-status ${mount.status}` }, statuses[mount.status])),
            h('p', { className: 'dsh-ssh-hostname', title: `SSH · ${mount.alias}`, 'aria-label': `远程主机 ${mount.hostname.toLowerCase()}` },
              h('span', { className: 'dsh-ssh-remote-dot', 'aria-hidden': true }),
              h('span', { className: 'dsh-ssh-hostname-text' }, mount.hostname.toLowerCase())),
            h('p', { className: 'dsh-ssh-path' }, mount.remoteDir),
            mount.message && h('p', { className: 'dsh-ssh-error' }, friendly(new Error(mount.message))),
            h('div', { className: 'dsh-ssh-actions' },
              h('button', { className: 'dsh-ssh-primary', disabled, onClick: () => run(`open:${mount.localDir}`, async (signal) => {
                await api('check', { local_path: mount.localDir }, signal);
                await openWorkspace(mount.localDir, signal);
              }) }, busy === `open:${mount.localDir}` ? '打开中…' : '打开工作区'),
              h('button', { disabled, onClick: () => run(`check:${mount.localDir}`, async (signal) => {
                await api('check', { local_path: mount.localDir }, signal); await refresh(signal);
              }) }, busy === `check:${mount.localDir}` ? '检查中…' : '检查连接'),
              h('button', { disabled, onClick: () => setConfirm({ path: mount.localDir, action: 'disconnect' }) }, '断开'),
              h('button', { disabled, className: 'dsh-ssh-danger', onClick: () => setConfirm({ path: mount.localDir, action: 'remove' }) }, '移除工作区')),
            mount.checkedAt && h('p', { className: 'dsh-ssh-muted', style: { marginTop: 10 } }, `上次检查：${new Date(mount.checkedAt).toLocaleString()}`),
            confirm?.path === mount.localDir && h('div', { className: 'dsh-ssh-confirm' },
              h('p', { className: 'dsh-ssh-muted' }, confirm.action === 'remove'
                ? '将移除工作区并归档其中的会话，历史记录和远程文件会保留。已进入“未分组”的相关会话也会归档。请先结束正在运行的任务。'
                : '断开会移除这个远程工作区的连接。请先结束其中正在进行的任务；服务器上的文件会保留。'),
              h('div', { className: 'dsh-ssh-actions' }, h('button', { className: 'dsh-ssh-danger', disabled,
                onClick: () => run(`${confirm.action}:${mount.localDir}`, async (signal) => {
                  const action = confirm.action;
                  await api(action, { local_path: mount.localDir }, signal); setConfirm(null);
                  await refresh(signal); setNotice(action === 'remove' ? '工作区已移除，会话已归档，远程文件已保留。' : '已断开连接，远程文件已保留。');
                }) }, busy === `${confirm.action}:${mount.localDir}` ? '处理中…' : confirm.action === 'remove' ? '确认移除并归档' : '确认断开'),
                h('button', { disabled, onClick: () => setConfirm(null) }, '取消')))))));
    }
    return {
      inject: ['slots', 'layout', 'connection', 'workspaces', 'uiWorkspace'],
      apply(ctx) {
        let badges;
        let listRevision = 0;
        let appliedListRevision = 0;
        const api = async (method, request, signal) => {
          const revision = method === 'list' ? ++listRevision : 0;
          const result = await ctx.connection.rpc.call('/api', `sshRemoteUi/${method}`,
            { args: request === undefined ? {} : { request } }, signal);
          if (!result.ok) throw new Error(result.error.message);
          if (method === 'list' && revision >= appliedListRevision) {
            appliedListRevision = revision;
            badges?.update(result.value);
          }
          if (['connect', 'open', 'check', 'disconnect', 'remove'].includes(method)) badges?.refresh();
          return result.value;
        };
        ctx.effect(() => {
          badges = installWorkspaceBadges(ctx, api);
          return () => { badges.dispose(); badges = undefined; };
        });
        const openWorkspace = async (localDir, signal) => {
          signal?.throwIfAborted();
          const workspace = await api('open', { local_path: localDir }, signal);
          signal?.throwIfAborted();
          await ctx.uiWorkspace.openWorkspace(workspace.workspaceId);
        };
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL,
          inject: () => ({ api, openWorkspace, subscribeWorkspaces: (listener) => ctx.workspaces.list.subscribe(listener) }) }, RemotePanel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist',
          id: PANEL, order: -10, label: '远程工作区' }, Icon));
      },
    };
  },
});
