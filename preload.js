const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onLookup:  fn => ipcRenderer.on('lookup-word', (_, w) => fn(w)),
  onOpenMgr: fn => ipcRenderer.on('open-manager', fn),
  reqSources: () => ipcRenderer.invoke('request-sources'),
  saveSources: s  => ipcRenderer.send('update-sources', s),
  onSourcesUpdated: fn => ipcRenderer.on('sources-updated', (_, s) => fn(s)),
  // 新增：通知主进程“对话框已关闭，可以恢复 BrowserView”
  managerDone: () => ipcRenderer.send('manager-done'),
  toMain: url => ipcRenderer.send('load-url', url),
  sendToolbarH: h => ipcRenderer.send('toolbar-height', h),
});