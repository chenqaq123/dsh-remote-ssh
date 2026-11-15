/* Native Harness client bundle. React and services come from its module loader. */
window.__ModuleLoader__.load({
  id: 'dsh-ssh-remote',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;
    const PANEL = 'ssh-remote';
    /** Marker the host appends to errors the user resolves by entering a password. */
    const PASSWORD_MARKER = '[ssh-password-required]';
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
      .dsh-ssh-optional{font-weight:400;opacity:.62}
      .dsh-ssh-password-note{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0}
      .dsh-ssh-page .dsh-ssh-inline{min-height:0;padding:2px 8px;border:0;font-size:12px;text-decoration:underline;opacity:.75}
      .dsh-ssh-page .dsh-ssh-inline:hover:not(:disabled){background:transparent;opacity:1}
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
      const host = document.createElement('div'); host.className = 'dsh-sb'; host.setAttribute('aria-label', '远程工作区');
      const STATE_KEY = 'dsh-ssh-remote:sidebar-v2';
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
        const m = Math.max(0, Math.floor((Date.now() - at) / 60000)); return m < 1 ? '刚刚' : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h` : `${Math.floor(m / 1440)}d`; };
      const titleOf = s => s?.blank ? '新会话' : s?.title?.trim() || s?.displayTitle?.trim() || '未命名会话';
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
        if (!cm) { notify('Harness 原生菜单尚未就绪。'); return; }
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
          return [{id:'status',label:{connected:'可连接',saved:'尚未连接',disconnected:'已断开',error:'连接失败'}[server.status],disabled:true},
            ...(w?[{id:'connect',label:w.status==='connected'?'断开连接':'连接服务器',icon:{key:'ssh.link'},run:()=>connectWorkspace(w)}]:[]),
            {id:'add',label:'添加远程工作区',icon:{key:'ssh.new'},run:()=>ctx.layout.selectPanel(PANEL)},
            {id:'manage',label:'管理服务器与工作区',icon:{key:'ssh.settings'},run:()=>ctx.layout.selectPanel(PANEL)}]; }});
      const removeWorkspaceMenu = cm?.register({id:'ssh.sidebar-workspace',target:'workspace',order:250,
        observe:()=>[ctx.workspaces.list], resolve:({workspaceId})=>{const w=findWorkspace(workspaceId);if(!w)return[];
          return [{id:'connect',label:w.status==='connected'?'断开连接':'连接工作区',icon:{key:'ssh.link'},disabled:w.orphaned===true,run:()=>connectWorkspace(w)},
            {id:'new',label:'新建会话',icon:{key:'ssh.new'},disabled:w.orphaned===true,run:()=>newConversation(w)},
            {id:'copy',label:'复制远程目录路径',icon:{key:'ssh.copy'},run:()=>navigator.clipboard.writeText(w.remoteDir)},
            {id:'manage',label:'管理远程工作区',icon:{key:'ssh.settings'},run:()=>ctx.layout.selectPanel(PANEL)}]; }});
      function confirmDelete(w,session) {
        dialog?.close();dialog?.remove();const node=el('dialog','dsh-sb-confirm');dialog=node;
        const heading=el('h2','', '删除会话？');heading.id='ssh-remove-conversation';node.setAttribute('aria-labelledby',heading.id);
        const error=el('p','dsh-sb-error');error.setAttribute('role','alert');error.hidden=true;
        const actions=el('div','dsh-sb-confirm-actions'),cancel=el('button','', '取消'),yes=el('button','danger','删除会话');
        cancel.type=yes.type='button';cancel.autofocus=true;let pending=false;
        const close=()=>{if(!pending){node.close();node.remove();if(dialog===node)dialog=undefined;}};
        cancel.addEventListener('click',close);node.addEventListener('cancel',e=>{e.preventDefault();close();});
        yes.addEventListener('click',async()=>{if(pending)return;if(sessions()[session.id]?.running){error.hidden=false;error.textContent='请先停止会话，再删除。';return;}
          pending=true;cancel.disabled=yes.disabled=true;let archived=false;
          try{await ctx.uiWorkspace.archiveSession(session.id);archived=true;await api('forgetSession',{local_path:w.localDir,session_id:session.id});await refresh();pending=false;close();}
          catch(e){error.hidden=false;error.textContent=`${archived?'会话已归档，但移除未完成：':''}${friendly(e)}`;}
          finally{pending=false;cancel.disabled=yes.disabled=false;}});
        actions.append(cancel,yes);node.append(heading,el('p','',titleOf(session)),el('p','', '会话将归档并从远程工作区列表移除。Harness 历史日志和远程文件都会保留。'),error,actions);
        document.body.append(node);node.showModal();
      }
      const removeDeleteMenu=cm?.register({id:'ssh.sidebar-delete-session',target:'session',order:700,
        observe:()=>[ctx.workspaces.list,ctx.sessions.list],resolve:({sessionId})=>{const w=findSessionWorkspace(sessionId),s=sessions()[sessionId];
          return !w||!s||s.blank?[]:[{id:'delete',label:'删除会话',danger:true,afterContent:true,disabled:s.running===true,run:()=>confirmDelete(w,s)}];}});
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
        const leading=el('button','dsh-sb-leading');leading.type='button';leading.title=`${expanded?'折叠':'展开'} ${label}`;leading.setAttribute('aria-label',leading.title);
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
        host.replaceChildren();const head=el('div','dsh-sb-head');
        const sectionToggle=el('button','dsh-sb-section-toggle');sectionToggle.type='button';sectionToggle.setAttribute('aria-expanded',String(!sectionCollapsed));
        sectionToggle.setAttribute('aria-label',`${sectionCollapsed?'展开':'折叠'}远程工作区`);sectionToggle.append(icon('chevron-right-outline-regular',14),el('span','', '远程工作区'));
        sectionToggle.addEventListener('click',()=>{cm?.close();sectionCollapsed=!sectionCollapsed;persist();render();});head.append(sectionToggle);
        for(const [name,label]of[['settings-outline-regular','管理远程工作区'],['project-add-outline-regular','添加远程工作区']]){const b=button(name,label,()=>ctx.layout.selectPanel(PANEL));b.classList.add('dsh-sb-header-action');head.append(b);}
        host.append(head);
        if(!sectionCollapsed){const body=el('div','dsh-sb-body');body.setAttribute('role','tree');body.setAttribute('aria-label','远程服务器与工作区');host.append(body);
          if(!loaded)body.append(el('div','dsh-sb-empty','正在读取远程工作区…'));
          else if(!tree.servers.length)body.append(el('div','dsh-sb-empty','还没有远程工作区，可从右上角添加。'));
          for(const server of ordered(tree.servers,serverOrder,s=>s.alias)){
            const expanded=!collapsedServers.has(server.alias),group=el('div','dsh-sb-server');
            const {row,actions}=rowShell('server',server.alias,server.alias,expanded,0,()=>toggle(collapsedServers,server.alias),server.status);
            row.title=`${server.alias}\n${server.hostname}\n${server.message||{connected:'可连接',saved:'尚未连接',disconnected:'已断开',error:'连接失败'}[server.status]}`;
            const primary=server.workspaces.find(w=>!w.orphaned);
            actions.append(menuButton(row,{kind:'ssh-remote-server',value:{alias:server.alias}},`服务器操作：${server.alias}`));
            if(primary)actions.append(button('link-outline-regular',`${primary.status==='connected'?'断开连接':'连接服务器'}：${server.alias}`,()=>connectWorkspace(primary)));
            actions.append(button('project-add-outline-regular',`添加工作区：${server.alias}`,()=>ctx.layout.selectPanel(PANEL)));
            group.append(row);body.append(group);if(!expanded)continue;
            const serverBody=el('div','dsh-sb-body');serverBody.setAttribute('role','group');group.append(serverBody);
            for(const w of ordered(server.workspaces,workspaceOrder,w=>`${server.alias}:${w.localDir}`)){
              const wk=`${server.alias}:${w.localDir}`,open=!collapsedWorkspaces.has(wk),name=w.name||w.title||w.remoteDir;
              const workspaceNode=el('div','dsh-sb-workspace');const parts=rowShell('workspace',w.localDir,name,open,16,()=>toggle(collapsedWorkspaces,wk),w.status);
              parts.row.dataset.workspaceId=w.workspaceId??'';parts.row.title=`${name}\n${server.alias}:${w.remoteDir}\n${w.message||w.status}`;
              if(w.workspaceId&&!w.orphaned){parts.actions.append(menuButton(parts.row,targetOfWorkspace(w),`工作区操作：${name}`));
                const connect=button('link-outline-regular',`${w.status==='connected'?'断开连接':'连接工作区'}：${name}`,()=>connectWorkspace(w));if(w.status==='connected')connect.classList.add('connected');
                parts.actions.append(connect,button('new-chat-outline-regular',`新建会话：${name}`,()=>newConversation(w),14));}
              workspaceNode.append(parts.row);serverBody.append(workspaceNode);if(!open)continue;
              const list=el('div','dsh-sb-body');list.setAttribute('role','group');workspaceNode.append(list);
              const byId=sessions(),current=selection();
              for(const c of w.conversations??[]){const s=byId[c.id];if(c.archived||!s||s.origin==='subagent'||s.blank&&c.id!==current)continue;
                const label=titleOf(s),item=el('div',`dsh-sb-row dsh-sb-session-row${c.id===current?' current':''}`);item.dataset.kind='session';item.dataset.key=c.id;item.dataset.sessionId=c.id;
                item.style.setProperty('--ssh-indent','32px');item.tabIndex=0;item.setAttribute('role','treeitem');item.setAttribute('aria-selected',String(c.id===current));item.title=label;
                item.append(el('span','dsh-sb-title',label),el('span','dsh-sb-time',time(s.updatedAt)));
                item.addEventListener('click',()=>openConversation(c));item.addEventListener('keydown',e=>{if(e.target===item&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openConversation(c);}});
                if(!s.blank){const actions=el('span','dsh-sb-actions');actions.append(menuButton(item,{kind:'session',value:{sessionId:c.id,displayTitle:label}},`会话操作：${label}`));item.append(actions);}
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
        catch(e){console.warn('[dsh-ssh-remote] sidebar refresh:',e);}finally{loading=false;}}
      const updateMenu=()=>{const active=cm?.active?.getSnapshot?.(),own=ownsMenu(active);document.documentElement.classList.toggle('dsh-ssh-flat-menu',Boolean(own));
        for(const row of host.querySelectorAll('[data-kind]')){const open=own&&(row.dataset.kind==='server'&&active.kind==='ssh-remote-server'&&row.dataset.key===active.value.alias
          ||row.dataset.kind==='workspace'&&active.kind==='workspace'&&row.dataset.workspaceId===active.value.workspaceId
          ||row.dataset.kind==='session'&&active.kind==='session'&&row.dataset.key===active.value.sessionId);row.classList.toggle('menu-open',Boolean(open));row.querySelector('[aria-haspopup=menu]')?.setAttribute('aria-expanded',String(Boolean(open)));}
        if(!own)schedule();};
      const attach=()=>{const region=document.querySelector('[class*=regionArea]');if(region&&host.parentElement!==region)region.append(host);};
      const observer=new MutationObserver(()=>{if(!disposed)attach();});observer.observe(document.body,{childList:true,subtree:true});
      const offWorkspaces=ctx.workspaces.list.subscribe(()=>{void refresh();}),offSessions=ctx.sessions.list.subscribe(schedule),offSelection=ctx.uiWorkspace.selection?.subscribe?.(schedule),offMenu=cm?.active?.subscribe?.(updateMenu);
      const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},4000);
      attach();void refresh();
      return {refresh,dispose(){disposed=true;observer.disconnect();offWorkspaces?.();offSessions?.();offSelection?.();offMenu?.();
        removeServerMenu?.();removeWorkspaceMenu?.();removeDeleteMenu?.();clearInterval(timer);if(frame!==undefined)clearTimeout(frame);
        document.documentElement.classList.remove('dsh-ssh-flat-menu');dialog?.close();dialog?.remove();toast?.remove();host.remove();style.remove();hide.remove();}};
    }
    function Icon({ size = 18 } = {}) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('rect', { x: 3, y: 3, width: 18, height: 12, rx: 2 }),
      h('path', { d: 'M8 21h8M12 15v6M7 7l3 2-3 2M13 11h4' }));
    }
    function friendly(error) {
      const message = error?.message || String(error);
      // The host needs a password: the panel shows the password field instead.
      if (needsPassword(error)) return message.split(PASSWORD_MARKER).join('').trim();
      if (/Permission denied|publickey|authentication/i.test(message)) return 'SSH 认证失败。请确认密钥已解锁，或为这台服务器输入密码。';
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
          h('h2', { id: 'dsh-ssh-picker-title' }, '选择远程目录'),
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
        askPassword && h('form', { className: 'dsh-ssh-picker-password', style: { marginTop: 12 },
            onSubmit: (e) => { e.preventDefault(); setAttempt(draft); browse(data?.path ?? initialPath, hidden, draft); } },
          h('input', { type: 'password', value: draft, autoFocus: true, autoComplete: 'new-password',
            'aria-label': `密码（${host}）`, placeholder: '输入这台服务器的密码后重试',
            onChange: (e) => setDraft(e.target.value) }),
          h('button', { type: 'submit', className: 'dsh-ssh-primary', disabled: loading || !draft }, '保存密码并重试')),
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
          setNotice(`工作区已重命名为「${title}」。`);
        });
      };
      return h('article', { className: 'dsh-ssh-mount', key: mount.localDir },
        h('div', { className: 'dsh-ssh-row' }, h('div', { className: 'dsh-ssh-host' }, h(Icon), mount.name),
          h('span', { className: `dsh-ssh-status ${mount.status}` }, statuses[mount.status])),
        renaming && h('form', { className: 'dsh-ssh-rename', onSubmit: submitRename },
          h('input', { value: draft, maxLength: 80, autoFocus: true, disabled,
            'aria-label': `工作区名称（${mount.alias}）`, placeholder: '工作区名称',
            onChange: (e) => setDraft(e.target.value) }),
          h('button', { type: 'submit', className: 'dsh-ssh-primary', disabled: disabled || !draft.trim() }, '保存'),
          h('button', { type: 'button', disabled, onClick: () => setRenaming(false) }, '取消')),
        h('p', { className: 'dsh-ssh-path' }, mount.remoteDir || (mount.orphaned ? `本地占位目录：${mount.localDir}` : '')),
        mount.message && h('p', { className: 'dsh-ssh-error' }, friendly(new Error(mount.message))),
        mount.orphaned && h('p', { className: 'dsh-ssh-muted' }, `请在上方重新选择 ${mount.alias || '对应服务器'} 和远程目录后连接；连接时会复用这个工作区。`),
        h('div', { className: 'dsh-ssh-actions' },
          h('button', { className: 'dsh-ssh-primary', disabled: disabled || mount.orphaned, onClick: () => run(`open:${mount.localDir}`, async (signal) => {
            await api('check', { local_path: mount.localDir }, signal);
            await openWorkspace(mount.localDir, signal);
          }) }, busy === `open:${mount.localDir}` ? '打开中…' : '新对话'),
          h('button', { disabled: disabled || mount.orphaned || !mount.workspaceId,
            onClick: () => { setDraft(mount.name); setRenaming(true); } }, '重命名'),
          h('button', { disabled: disabled || mount.orphaned, onClick: () => run(`check:${mount.localDir}`, async (signal) => {
            await api('check', { local_path: mount.localDir }, signal); await refresh(signal);
          }) }, busy === `check:${mount.localDir}` ? '检查中…' : mount.status === 'disconnected' ? '重新连接' : '检查连接'),
          h('button', { disabled: disabled || mount.orphaned, onClick: () => {
            setPrompt({ path: mount.localDir }); setPromptPassword('');
          } }, mount.hasPassword ? '修改密码' : '输入密码'),
          h('button', { disabled, onClick: () => setConfirm({ path: mount.localDir, action: 'disconnect' }) }, '断开'),
          h('button', { disabled, className: 'dsh-ssh-danger', onClick: () => setConfirm({ path: mount.localDir, action: 'remove' }) }, '移除工作区')),
        mount.checkedAt && h('p', { className: 'dsh-ssh-muted', style: { marginTop: 10 } }, `上次检查：${new Date(mount.checkedAt).toLocaleString()}`),
        prompt?.path === mount.localDir && h('div', { className: 'dsh-ssh-confirm' },
          h('p', { className: 'dsh-ssh-muted' }, `输入 ${mount.alias} 的密码，保存在本机后会立即重试连接。`),
          h('input', { type: 'password', value: promptPassword, disabled, autoComplete: 'new-password',
            placeholder: '密码', 'aria-label': `${mount.alias} 的密码`, style: { marginBottom: 12 },
            onChange: (e) => setPromptPassword(e.target.value) }),
          h('div', { className: 'dsh-ssh-actions' },
            h('button', { className: 'dsh-ssh-primary', disabled: disabled || promptPassword.length === 0,
              onClick: () => run(`check:${mount.localDir}`, async (signal) => {
                await api('check', { local_path: mount.localDir, password: promptPassword }, signal);
                setPrompt(null); setPromptPassword('');
                await refresh(signal);
                setNotice('密码已保存到本机，正在重新连接这台服务器。');
              }) }, busy === `check:${mount.localDir}` ? '重试中…' : '保存密码并重试'),
            h('button', { disabled, onClick: () => { setPrompt(null); setPromptPassword(''); } }, '取消'))),
        confirm?.path === mount.localDir && h('div', { className: 'dsh-ssh-confirm' },
          h('p', { className: 'dsh-ssh-muted' }, confirm.action === 'remove'
            ? '将移除工作区并归档其中的会话，历史记录和远程文件会保留。已进入“未分组”的相关会话也会归档。请先结束正在运行的任务。'
            : '断开会移除这个远程工作区的连接。请先结束其中正在进行的任务；服务器上的文件会保留。'),
          h('div', { className: 'dsh-ssh-actions' }, h('button', { className: 'dsh-ssh-danger', disabled,
            onClick: () => run(`${confirm.action}:${mount.localDir}`, async (signal) => {
              const action = confirm.action;
              await api(action, { local_path: mount.localDir }, signal); setConfirm(null);
              await refresh(signal);
              setNotice(action === 'remove' ? '工作区已移除，会话已归档，远程文件已保留。' : '已断开连接，远程文件已保留。');
            }) }, busy === `${confirm.action}:${mount.localDir}` ? '处理中…' : confirm.action === 'remove' ? '确认移除并归档' : '确认断开'),
            h('button', { disabled, onClick: () => setConfirm(null) }, '取消'))));
    }
    function ServerSection({ server, disabled, busy, run, statuses, api,
      openWorkspace, refresh, renameWorkspace, prompt, setPrompt, confirm, setConfirm,
      promptPassword, setPromptPassword, setNotice }) {
      const [expanded, setExpanded] = useState(true);
      const checkable = server.workspaces.filter((mount) => !mount.orphaned);
      const checkAll = () => run(`checkall:${server.alias}`, async (signal) => {
        for (const mount of checkable) await api('check', { local_path: mount.localDir }, signal);
        await refresh(signal);
        setNotice(`已检查 ${server.alias} 的 ${checkable.length} 个工作区。`);
      });
      return h('section', { className: 'dsh-ssh-server' },
        h('div', { className: 'dsh-ssh-server-head', role: 'button', tabIndex: 0, 'aria-expanded': expanded,
          onClick: () => setExpanded((value) => !value),
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((value) => !value); } } },
          h(Chevron, { open: expanded }),
          h('div', { className: 'dsh-ssh-host' }, h(Icon), h('span', { className: 'dsh-ssh-server-name' }, server.alias)),
          server.hostname !== server.alias && h('span', { className: 'dsh-ssh-hostname-text' }, server.hostname),
          server.hasPassword && h('span', { className: 'dsh-ssh-remote-dot', title: '已保存密码', 'aria-label': '已保存密码' }),
          h('span', { style: { flex: 1 } }),
          h('span', { className: `dsh-ssh-status ${server.status}` }, statuses[server.status]),
          checkable.length > 0 && h('button', { disabled, 'aria-label': `检查 ${server.alias} 的全部工作区`,
            onClick: (e) => { e.stopPropagation(); checkAll(); } },
            busy === `checkall:${server.alias}` ? '检查中…' : '检查全部')),
        expanded && h('div', { className: 'dsh-ssh-server-body' }, server.workspaces.map((mount) =>
          h(WorkspaceNode, { key: mount.localDir, mount, disabled, busy, run, statuses, api,
            openWorkspace, refresh, renameWorkspace, prompt, setPrompt, confirm, setConfirm,
            promptPassword, setPromptPassword, setNotice }))));
    }
    function ServerTree({ servers, disabled, busy, run, statuses, api,
      openWorkspace, refresh, renameWorkspace, prompt, setPrompt, confirm, setConfirm,
      promptPassword, setPromptPassword, setNotice }) {
      if (!servers.length) return h('div', { className: 'dsh-ssh-empty' }, h(Icon, { size: 30 }),
        h('strong', null, '还没有远程工作区'), h('p', { className: 'dsh-ssh-muted' }, '选择服务器和远程目录，建立第一个连接。'));
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
            if (!signal?.aborted) console.warn('[dsh-ssh-remote] tree refresh failed:', error);
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
        if (!path.startsWith('/')) { setError('请先选择远程项目目录。'); return; }
        await run('connect', async (signal) => {
          const mount = await api('connect', { host, remote_path: path, ...(name.trim() ? { name: name.trim() } : {}),
            ...(password.length > 0 ? { password } : {}) }, signal);
          setPassword('');
          await refresh(signal);
          setNotice('连接成功，正在打开远程工作区…');
          await openWorkspace(mount.localDir, signal);
        });
      }
      const selectedHost = snapshot.hosts.find((entry) => entry.alias === host);
      const statuses = { connected: '可连接', saved: '待检查', disconnected: '已断开', error: '连接失败' };
      return h('section', { className: 'dsh-ssh-page', 'aria-label': '远程工作区' },
        h('style', null, CSS),
        h('div', { className: 'dsh-ssh-inner' },
          h('header', { className: 'dsh-ssh-header' }, h('div', null,
            h('div', { className: 'dsh-ssh-kicker' }, h(Icon, { size: 14 }), 'SSH'),
            h('h1', null, '远程工作区'), h('p', { className: 'dsh-ssh-muted' }, '连接服务器，在远程目录中继续工作。')),
            h('button', { disabled, onClick: () => run('refresh', refresh), 'aria-label': '刷新服务器和工作区' }, busy === 'refresh' ? '刷新中…' : '刷新')),
          error && h('div', { className: 'dsh-ssh-error', role: 'alert' }, error),
          notice && h('div', { className: 'dsh-ssh-notice', role: 'status' }, notice),
          h('form', { className: 'dsh-ssh-card', onSubmit: connect },
            h('h2', null, '连接远程目录'),
            h('div', { className: 'dsh-ssh-grid' },
              h('label', { className: 'dsh-ssh-field' }, '服务器',
                h('select', { value: host, onChange: (e) => setHost(e.target.value), disabled: disabled || !snapshot.hosts.length, required: true },
                  !snapshot.hosts.length && h('option', { value: '' }, loading ? '正在读取服务器…' : '未找到 SSH 服务器'),
                  snapshot.hosts.map((entry) => h('option', { value: entry.alias, key: entry.alias },
                    entry.hasPassword ? `${entry.alias} · 密码已保存` : entry.alias))),
                (() => { const chosen = snapshot.hosts.find(entry => entry.alias === host);
                  return chosen && chosen.hostname !== host ? h('span', { className: 'dsh-ssh-muted' }, chosen.hostname) : null; })()),
              h('label', { className: 'dsh-ssh-field' },
                h('span', null, '密码 ', h('span', { className: 'dsh-ssh-optional' }, '（密码登录的服务器才需要，留空则使用密钥或代理）')),
                h('input', { ref: passwordField, type: 'password', value: password, disabled, autoComplete: 'new-password',
                  className: passwordNeeded ? 'dsh-ssh-needed' : undefined,
                  placeholder: passwordNeeded ? '这台服务器需要密码，输入后点击「连接并打开」' : undefined,
                  onChange: (e) => { setPassword(e.target.value); setPasswordNeeded(false); } }))),
            selectedHost?.hasPassword === true && h('p', { className: 'dsh-ssh-muted dsh-ssh-password-note', style: { marginTop: 12 } },
              h('span', null, '已保存这台服务器的密码，连接时会自动使用。'),
              h('button', { type: 'button', className: 'dsh-ssh-inline', disabled, onClick: () => run('forgetPassword', async (signal) => {
                await api('forgetPassword', { host }, signal);
                await refresh(signal);
                setNotice(`已清除 ${host} 保存的密码。`);
              }) }, busy === 'forgetPassword' ? '清除中…' : '清除密码')),
            h('label', { className: 'dsh-ssh-field dsh-ssh-name-field' }, '工作区名称',
              h('input', { value: name, maxLength: 80, disabled, placeholder: path.split('/').filter(Boolean).pop() || '默认使用项目文件夹名称',
                onChange: (e) => setSelection(current => ({ ...current, name: e.target.value })) })),
            h('div', { className: 'dsh-ssh-field dsh-ssh-name-field' },
              h('span', { id: 'dsh-ssh-directory-label' }, '远程目录'),
              h('button', { type: 'button', className: 'dsh-ssh-picker', disabled: disabled || !host,
                'aria-label': path ? `更改目录 ${path}` : '选择远程目录', onClick: () => setPicker(true), title: path },
                h(Folder), h('span', null, path || '选择服务器上的文件夹…'))),
            h('div', { className: 'dsh-ssh-form-footer' },
              h('button', { type: 'submit', className: 'dsh-ssh-primary', disabled: disabled || !host || !path.trim() }, busy === 'connect' ? '连接并打开中…' : '连接并打开')),
            !loading && !snapshot.hosts.length && h('p', { className: 'dsh-ssh-muted', style: { marginTop: 16 } }, '请先在 ~/.ssh/config 添加服务器，再点击刷新。'),
            h('p', { className: 'dsh-ssh-muted', style: { marginTop: 16 } },
              '密码只保存在本机（默认 ~/.dsh/ssh-remote/secrets.json，仅当前用户可读写），用于自动登录，可随时清除。'),
            snapshot.warnings.map((warning, i) => h('p', { className: 'dsh-ssh-muted', key: i }, warning))),
          picker && h(DirectoryPicker, { api, host, initialPath: path, initialPassword: password,
            onClose: () => { setPicker(false); refresh(lifetime.current.signal).catch(() => {}); },
            onSelect: (next) => { setPath(next); setPicker(false); refresh(lifetime.current.signal).catch(() => {}); } }),
          h('div', { className: 'dsh-ssh-section-title' }, h('h2', null, '已保存的远程工作区')),
          loading ? h('div', { className: 'dsh-ssh-empty', role: 'status' }, '正在读取工作区…') :
          !snapshot.mounts.length ? h('div', { className: 'dsh-ssh-empty' }, h(Icon, { size: 30 }),
            h('strong', null, '还没有远程工作区'), h('p', { className: 'dsh-ssh-muted' }, '选择服务器和远程目录，建立第一个连接。')) :
          !snapshot.servers.length ? h('div', { className: 'dsh-ssh-empty' }, h('strong', null, '工作区层级加载失败'),
            h('p', { className: 'dsh-ssh-muted' }, '点击右上角「刷新」重试。')) :
          h(ServerTree, { servers: snapshot.servers, disabled, busy, run, statuses, api,
            openWorkspace, refresh, renameWorkspace, prompt, setPrompt, confirm, setConfirm,
            promptPassword, setPromptPassword, setNotice })));
    }
    return {
      inject: ['slots', 'layout', 'connection', 'workspaces', 'uiWorkspace', 'sessions'],
      apply(ctx) {
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
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL,
          inject: () => ({ api, openWorkspace,
            renameWorkspace: (workspaceId, title) => ctx.workspaces.rename(workspaceId, title),
            subscribeWorkspaces: (listener) => ctx.workspaces.list.subscribe(listener) }) },
          RemotePanel));
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist',
          id: PANEL, order: -10, label: '远程工作区' }, Icon));
      },
    };
  },
});
