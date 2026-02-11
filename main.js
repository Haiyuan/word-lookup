/* eslint-disable no-console */
const { app, BrowserWindow, BrowserView, ipcMain, Menu } = require('electron');

app.disableHardwareAcceleration();
const path = require('path');
const fs   = require('fs');
const net  = require('net');
const { EventEmitter } = require('events');

const HOST = '127.0.0.1';
const PORT = 5050;
const SOURCES_FILE = path.join(app.getPath('userData'), 'sources.json');
const events = new EventEmitter();

const PAD = 8;                 // BrowserView 再向下让 8px
const MIN_TOOLBAR_HEIGHT = 30;

/* ---------- 词典源持久化 ---------- */
function loadSources () {
  try { return JSON.parse(fs.readFileSync(SOURCES_FILE, 'utf8')); }
  catch {
    return {
      Google   : 'https://www.google.com/search?q=define+{word}',
      Cambridge: 'https://dictionary.cambridge.org/dictionary/english/{word}'
    };
  }
}
function saveSources (sources) {
  fs.writeFileSync(SOURCES_FILE, JSON.stringify(sources, null, 2));
}

function isAllowedLookupURL (rawURL) {
  if (typeof rawURL !== 'string' || !rawURL.trim()) return false;
  try {
    const parsed = new URL(rawURL);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/* ---------- GUI ---------- */
let win;
let view          = null;  // BrowserView
let currentH      = 0;     // 工具栏高度
let pendingWord   = null;  // CLI 推送但 toolbarH 未到
let pendingURL    = null;  // URL 尚未 attach 时排队
let viewAttached  = false; // 是否已 setBrowserView
let lastLookupURL = null;  // 记录最后一次导航目标

function computeViewBounds () {
  if (!win) return null;
  const [w, h] = win.getContentSize();
  const y = Math.max(0, currentH + PAD);
  return { x: 0, y, width: Math.max(0, w), height: Math.max(1, h - y) };
}

function resizeView () {
  if (!viewAttached || !view || view.webContents.isDestroyed()) return;
  const bounds = computeViewBounds();
  if (!bounds) return;
  view.setBounds(bounds);
}

function attachView () {
  if (!win || !view || viewAttached || view.webContents.isDestroyed()) return;
  win.setBrowserView(view);
  viewAttached = true;
  resizeView();
}

function loadViewURL (targetView, url) {
  if (!targetView || targetView.webContents.isDestroyed()) return;
  void targetView.webContents.loadURL(url).catch(err => {
    console.error('[main] Failed to load lookup URL:', err);
  });
}

function createLookupView () {
  if (view && !view.webContents.isDestroyed()) return view;

  const createdView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  view = createdView;
  viewAttached = false;

  createdView.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  createdView.webContents.on('unresponsive', () => {
    if (view !== createdView) return;
    console.warn('[main] BrowserView unresponsive, reloading.');
    createdView.webContents.reloadIgnoringCache();
  });

  createdView.webContents.on('render-process-gone', (_, details) => {
    if (view !== createdView) return;
    console.error('[main] BrowserView render process gone:', details.reason);
    view = null;
    viewAttached = false;
    const recoverURL = pendingURL || lastLookupURL;
    if (recoverURL && currentH >= MIN_TOOLBAR_HEIGHT) {
      pendingURL = recoverURL;
      createLookupView();
    }
  });

  createdView.webContents.once('did-finish-load', attachView);
  createdView.webContents.once('did-fail-load', attachView);

  if (pendingURL) {
    const queuedURL = pendingURL;
    pendingURL = null;
    loadViewURL(createdView, queuedURL);
  }

  return createdView;
}

function createWindow () {
  win = new BrowserWindow({
    width: 1024,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'renderer/index.html'));

  win.on('resize', resizeView);

  /* 渲染端上报工具栏高度 —— 在此时创建 / 挂载 BrowserView */
  ipcMain.on('toolbar-height', (_, h) => {
    // console.log('[main] got toolbar height', h);
    // 高度为 0 或极小，说明页面样式尚未生效，忽略并等待下一次上报
    if (h < MIN_TOOLBAR_HEIGHT || h === currentH) return;
    currentH = h;

    if (!view || view.webContents.isDestroyed()) {
      view = null;
      viewAttached = false;
      createLookupView();
    }

    // 若 view 已 attach（窗口 resize 后也会走这里）需重新布局
    resizeView();

    // 把之前排队的单词发给渲染端
    if (pendingWord) {
      win.webContents.send('lookup-word', pendingWord);
      pendingWord = null;
    }
  });
}

/* ---------- 菜单 ---------- */
function createMenu () {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Sources',
      submenu: [
         {
          label: 'Manage…',
          click: () => {
            // 👉 1) 先卸下 BrowserView，避免遮挡对话框
            if (viewAttached) {
              win.setBrowserView(null);
              viewAttached = false;
            }
            // 👉 2) 通知渲染进程打开 Manager
            win.webContents.send('open-manager');
          }
        },
        { type: 'separator' },
        { label: 'Reload sources', click: () => win.webContents.send('sources-updated', loadSources()) }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { type: 'separator' }, { role: 'toggleDevTools' }
      ]
    }
  ]));
}

/* ---------- TCP 服务器 ---------- */
// ---------- TCP 服务器 ----------
function startTCPServer() {
  const server = net.createServer(sock =>
    sock.on('data', buf => events.emit('word', buf.toString('utf8').trim()))
  );

  // ⚠️ 把 error 监听放在 listen **之前**，确保任何错误都会捕获
  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${PORT} already in use ─ another instance may be running. Exiting…`
      );
      // 用 app.quit() 能让 Electron 正常清理；随后再强制退出以防万一
      app.quit();
      // 如果上面没能及时结束，确保彻底退出
      setTimeout(() => process.exit(1), 1000);
    } else {
      console.error('TCP server error:', err);
    }
  });

  server.listen(PORT, HOST, () =>
    console.log(`TCP server @ ${HOST}:${PORT}`)
  );
}

/* ---------- 进程生命周期 ---------- */
app.whenReady().then(() => {
  createWindow();
  createMenu();
  startTCPServer();

  /* CLI 推词 */
  events.on('word', w => {
    if (!currentH) pendingWord = w;           // toolbar 高度未知
    else           win.webContents.send('lookup-from-cli', w);
  });

  /* 渲染端请求源列表 / 保存修改 */
  ipcMain.handle('request-sources', () => loadSources());
  ipcMain.on('update-sources', (_, s) => saveSources(s));

  // 渲染端告诉我们 “对话框已关”，把 BrowserView 挂回去
  ipcMain.on('manager-done', () => {
    if (view && !viewAttached && !view.webContents.isDestroyed()) {
      win.setBrowserView(view);
      viewAttached = true;
      resizeView();
    }
  });

  /* 渲染端让 BrowserView 导航 */
  ipcMain.on('load-url', (_, url) => {
    if (!isAllowedLookupURL(url)) {
      console.warn('[main] Blocked unsafe URL:', url);
      return;
    }
    pendingURL = url;
    lastLookupURL = url;

    if (!view || view.webContents.isDestroyed()) {
      view = null;
      viewAttached = false;
      if (currentH >= MIN_TOOLBAR_HEIGHT) createLookupView();
      return;
    }

    const queuedURL = pendingURL;
    pendingURL = null;
    loadViewURL(view, queuedURL);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
