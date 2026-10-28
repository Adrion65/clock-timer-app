const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  open: (view) => ipcRenderer.invoke('open', view),
  close: () => ipcRenderer.invoke('close'),
  togglePin: () => ipcRenderer.invoke('toggle-pin'),
  timerGet: () => ipcRenderer.invoke('timer-get'),
  timerCmd: (cmd, arg) => ipcRenderer.invoke('timer-cmd', cmd, arg),
  onTimer: (cb) => ipcRenderer.on('timer-state', (_e, s) => cb(s)),
  onDone: (cb) => ipcRenderer.on('timer-done', () => cb()),
  apiInfo: () => ipcRenderer.invoke('api-info'),
  rulesGet: () => ipcRenderer.invoke('rules-get'),
  rulesSet: (r) => ipcRenderer.invoke('rules-set', r),
  rulesReset: () => ipcRenderer.invoke('rules-reset'),
  onRules: (cb) => ipcRenderer.on('rules-state', (_e, r) => cb(r)),
});
