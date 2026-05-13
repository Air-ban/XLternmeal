import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme } from 'electron';
import * as path from 'path';
import { SSHManager } from './ssh';

let mainWindow: BrowserWindow | null = null;
const sshManager = new SSHManager();

nativeTheme.themeSource = 'system';
Menu.setApplicationMenu(null);

function getBackgroundColor(): string {
  return '#00000000';
}

function joinRemotePath(basePath: string, name: string): string {
  const normalizedBase = basePath || '/';
  if (normalizedBase === '/') {
    return `/${name}`;
  }
  return `${normalizedBase.replace(/\/+$/, '')}/${name}`;
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 0 && port <= 65535;
}

function createWindow(): void {
  const isDark = nativeTheme.shouldUseDarkColors;
  const isWin = process.platform === 'win32';

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    transparent: true,
    backgroundColor: getBackgroundColor(),
    title: '',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(isWin ? {
      backgroundMaterial: 'acrylic',
      frame: false,
      autoHideMenuBar: true,
    } : {
      titleBarStyle: 'hiddenInset',
      frame: false,
    }),
  });

  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
    mainWindow?.setTitle('');
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.webContents.send('theme:changed', isDark ? 'dark' : 'light');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    sshManager.closeAll();
  });
}

// Theme IPC handler - get current theme
ipcMain.handle('theme:get', () => {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

ipcMain.handle('theme:set', (_event, theme: 'dark' | 'light') => {
  if (theme !== 'dark' && theme !== 'light') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  }

  nativeTheme.themeSource = theme;

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(getBackgroundColor());

    if (process.platform === 'win32') {
      mainWindow.setBackgroundMaterial('acrylic');
    }
  }

  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

// Listen for native theme changes and push to renderer
nativeTheme.on('updated', () => {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme:changed', theme);

    // Update title bar overlay on Windows
    if (process.platform === 'win32') {
      mainWindow.setBackgroundMaterial('acrylic');
    }
  }
});

ipcMain.handle('window:minimize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isFocused()) {
    mainWindow.focus();
  }
  mainWindow.minimize();
});

ipcMain.handle('window:toggle-maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;

  if (!mainWindow.isFocused()) {
    mainWindow.focus();
  }

  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }

  return mainWindow.isMaximized();
});

ipcMain.handle('window:close', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.close();
});

ipcMain.handle('window:is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

// SSH IPC handlers
ipcMain.handle('ssh:connect', async (_event, config: {
  id: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}) => {
  try {
    await sshManager.connect(config);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('ssh:disconnect', async (_event, sessionId: string) => {
  sshManager.disconnect(sessionId);
  return { success: true };
});

ipcMain.handle('ssh:write', (_event, sessionId: string, data: string) => {
  sshManager.write(sessionId, data);
});

ipcMain.handle('ssh:resize', (_event, sessionId: string, cols: number, rows: number) => {
  sshManager.resize(sessionId, cols, rows);
});

ipcMain.handle('ssh:execute', async (_event, sessionId: string, command: string) => {
  try {
    const result = await sshManager.execute(sessionId, command);
    return { success: true, output: result };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// SFTP IPC handlers
ipcMain.handle('sftp:list', async (_event, sessionId: string, remotePath: string) => {
  try {
    const files = await sshManager.listFiles(sessionId, remotePath || '/');
    return { success: true, files };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:mkdir', async (_event, sessionId: string, remotePath: string) => {
  try {
    await sshManager.makeDirectory(sessionId, remotePath);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:delete', async (_event, sessionId: string, remotePath: string, type: 'file' | 'directory') => {
  try {
    if (type === 'directory') {
      await sshManager.deleteDirectory(sessionId, remotePath);
    } else {
      await sshManager.deleteFile(sessionId, remotePath);
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:upload', async (_event, sessionId: string, remoteDir: string) => {
  try {
    if (!mainWindow) {
      return { success: false, error: 'Main window is not available' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'Upload file',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, canceled: true };
    }

    const localPath = result.filePaths[0];
    const remotePath = joinRemotePath(remoteDir || '/', path.basename(localPath));
    await sshManager.uploadFile(sessionId, localPath, remotePath);
    return { success: true, remotePath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('sftp:download', async (_event, sessionId: string, remotePath: string, filename: string) => {
  try {
    if (!mainWindow) {
      return { success: false, error: 'Main window is not available' };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Download file',
      defaultPath: filename,
    });

    if (result.canceled || !result.filePath) {
      return { success: true, canceled: true };
    }

    await sshManager.downloadFile(sessionId, remotePath, result.filePath);
    return { success: true, localPath: result.filePath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Port forwarding IPC handlers
ipcMain.handle('forward:list', (_event, sessionId?: string) => {
  return { success: true, forwards: sshManager.listPortForwards(sessionId) };
});

ipcMain.handle('forward:start', async (_event, config: {
  sessionId: string;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}) => {
  try {
    if (!isValidPort(config.localPort) || !isValidPort(config.remotePort)) {
      return { success: false, error: 'Ports must be integers between 0 and 65535' };
    }
    if (!config.remoteHost.trim()) {
      return { success: false, error: 'Remote host is required' };
    }

    const forward = await sshManager.startPortForward({
      sessionId: config.sessionId,
      localHost: config.localHost || '127.0.0.1',
      localPort: config.localPort,
      remoteHost: config.remoteHost.trim(),
      remotePort: config.remotePort,
    });

    return { success: true, forward };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('forward:stop', async (_event, id: string) => {
  try {
    await sshManager.stopPortForward(id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Forward stream data to renderer
sshManager.onData((sessionId: string, data: string) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`ssh:data:${sessionId}`, data);
  }
});

sshManager.onClose((sessionId: string) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`ssh:close:${sessionId}`);
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  sshManager.closeAll();
});
