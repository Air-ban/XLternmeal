const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  theme: {
    get: () => ipcRenderer.invoke('theme:get'),
    set: (theme: 'dark' | 'light') => ipcRenderer.invoke('theme:set', theme),
    onChange: (callback: (theme: 'dark' | 'light') => void) => {
      const listener = (_event: any, theme: 'dark' | 'light') => callback(theme);
      ipcRenderer.on('theme:changed', listener);
      return () => ipcRenderer.removeListener('theme:changed', listener);
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  },
  ssh: {
    connect: (config: any) => ipcRenderer.invoke('ssh:connect', config),
    disconnect: (sessionId: string) => ipcRenderer.invoke('ssh:disconnect', sessionId),
    write: (sessionId: string, data: string) => ipcRenderer.invoke('ssh:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('ssh:resize', sessionId, cols, rows),
    execute: (sessionId: string, command: string) =>
      ipcRenderer.invoke('ssh:execute', sessionId, command),
    onData: (sessionId: string, callback: (data: string) => void) => {
      const listener = (_event: any, data: string) => callback(data);
      ipcRenderer.on(`ssh:data:${sessionId}`, listener);
      return () => ipcRenderer.removeListener(`ssh:data:${sessionId}`, listener);
    },
    onClose: (sessionId: string, callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on(`ssh:close:${sessionId}`, listener);
      return () => ipcRenderer.removeListener(`ssh:close:${sessionId}`, listener);
    },
  },
  sftp: {
    list: (sessionId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:list', sessionId, remotePath),
    mkdir: (sessionId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:mkdir', sessionId, remotePath),
    delete: (sessionId: string, remotePath: string, type: 'file' | 'directory') =>
      ipcRenderer.invoke('sftp:delete', sessionId, remotePath, type),
    upload: (sessionId: string, remoteDir: string) =>
      ipcRenderer.invoke('sftp:upload', sessionId, remoteDir),
    download: (sessionId: string, remotePath: string, filename: string) =>
      ipcRenderer.invoke('sftp:download', sessionId, remotePath, filename),
  },
  forward: {
    list: (sessionId: string) => ipcRenderer.invoke('forward:list', sessionId),
    start: (config: any) => ipcRenderer.invoke('forward:start', config),
    stop: (id: string) => ipcRenderer.invoke('forward:stop', id),
  },
});
