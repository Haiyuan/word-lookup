const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose a compact API to the renderer.
 *  - onLookup(): triggered for both toolbar > Enter/Go and CLI‑pushed words
 *  - onOpenMgr(): open the “Manage Sources” dialog
 *  - reqSources() / saveSources(): persistence helpers
 *  - onSourcesUpdated(): live‑reload sources from menu
 *  - managerDone(): called when dialog is closed so we can re‑attach BrowserView
 *  - toMain(): ask main to navigate BrowserView
 *  - sendToolbarH(): report toolbar height so main can size BrowserView
 */
contextBridge.exposeInMainWorld('api', {
  // ✔ single subscription that receives both events
  onLookup: fn => {
    ipcRenderer.on('lookup-word',      (_, w) => fn(w));
    ipcRenderer.on('lookup-from-cli', (_, w) => fn(w));
  },

  onOpenMgr:       fn => ipcRenderer.on('open-manager', fn),
  reqSources:      () => ipcRenderer.invoke('request-sources'),
  saveSources:     s  => ipcRenderer.send('update-sources', s),
  onSourcesUpdated:fn => ipcRenderer.on('sources-updated', (_, s) => fn(s)),
  managerDone:     () => ipcRenderer.send('manager-done'),
  openSettings:    () => ipcRenderer.send('open-settings'),
  toMain:          url => ipcRenderer.send('load-url', url),
  reqHistory:      () => ipcRenderer.invoke('request-history'),
  saveHistory:     h  => ipcRenderer.send('update-history', h),
  reqFavorites:    () => ipcRenderer.invoke('request-favorites'),
  saveFavorites:   f  => ipcRenderer.send('update-favorites', f),
  sendToolbarH:    h   => ipcRenderer.send('toolbar-height', h),
});