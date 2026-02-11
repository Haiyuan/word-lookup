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

  const resizeView = () => {
    if (!viewAttached) return;
    const [w, h] = win.getContentSize();
    view.setBounds({ x: 0, y: currentH + PAD, width: w, height: h - currentH - PAD });
  };
  win.on('resize', resizeView);

  /* 渲染端上报工具栏高度 —— 在此时创建 / 挂载 BrowserView */
  ipcMain.on('toolbar-height', (_, h) => {
    // console.log('[main] got toolbar height', h);
    // 高度为 0 或极小，说明页面样式尚未生效，忽略并等待下一次上报
    if (h < 30 || h === currentH) return;
    currentH = h;

    if (!view) {
      view = new BrowserView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      });
      view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      view.webContents.setFrameRate(1);         // 开启离屏模式（帧率=1 → GPU off）

      // 若已有待加载 URL，先 load，再等 did-finish 后 attach
      const attach = () => {
        if (!viewAttached) {
          win.setBrowserView(view);
          view.webContents.setFrameRate(0);        // 恢复正常 on-screen 渲染
          viewAttached = true;
          resizeView();
        }
      };
      view.webContents.once('did-finish-load', attach);
      view.webContents.once('did-fail-load',  attach);

      if (pendingURL) {
        view.webContents.loadURL(pendingURL);
        pendingURL = null;
      }
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
    if (view && !viewAttached) {
      win.setBrowserView(view);
      viewAttached = true;
      // 恢复大小位置
      const [w, h] = win.getContentSize();
      view.setBounds({ x: 0, y: currentH + PAD, width: w, height: h - currentH - PAD });
    }
  });

  /* 渲染端让 BrowserView 导航 */
  ipcMain.on('load-url', (_, url) => {
    if (!isAllowedLookupURL(url)) {
      console.warn('[main] Blocked unsafe URL:', url);
      return;
    }

    if (viewAttached) {
      view.webContents.loadURL(url);
    } else if (view) {
      // view 创建但未 attach：先 queue
      pendingURL = url;
      view.webContents.loadURL(url);
    } else {
      // 连 view 都未创建（toolbar 高度也许还未来）→ queue
      pendingURL = url;
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
