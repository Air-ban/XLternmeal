import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SSHManager } from './ssh';
import { AgentManager } from './agent';

let mainWindow: BrowserWindow | null = null;
let acrylicEnabled = true;
const sshManager = new SSHManager();
const agentManager = new AgentManager(sshManager);

nativeTheme.themeSource = 'system';
Menu.setApplicationMenu(null);

function getSolidBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? '#0b1018' : '#f7fafc';
}

function getBackgroundColor(): string {
  return acrylicEnabled ? '#00000000' : getSolidBackgroundColor();
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

function resolveWindow(event?: IpcMainInvokeEvent): BrowserWindow | null {
  const eventWindow = event ? BrowserWindow.fromWebContents(event.sender) : null;
  if (eventWindow && !eventWindow.isDestroyed()) {
    return eventWindow;
  }

  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
}

function sendWindowMaximizedState(window: BrowserWindow | null = mainWindow): void {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }

  window.webContents.send('window:maximized-changed', window.isMaximized());
}

function refreshWindowsAcrylicComposition(window: BrowserWindow): void {
  if (process.platform !== 'win32' || !acrylicEnabled || window.isDestroyed()) {
    return;
  }

  window.setBackgroundMaterial('none');
  window.setBackgroundMaterial('acrylic');
  window.setOpacity(0.995);

  const restoreOpacity = () => {
    if (!window.isDestroyed()) {
      window.setOpacity(1);
    }
  };

  if (window.isMaximized() || window.isFullScreen() || window.isMinimized()) {
    setTimeout(restoreOpacity, 80);
    return;
  }

  const bounds = window.getBounds();
  window.setBounds({ ...bounds, width: bounds.width + 1 }, false);

  setTimeout(() => {
    if (window.isDestroyed()) {
      return;
    }

    if (!window.isMaximized() && !window.isFullScreen() && !window.isMinimized()) {
      window.setBounds(bounds, false);
    }

    restoreOpacity();
  }, 40);
}

function applyWindowAppearance(
  window: BrowserWindow | null = mainWindow,
  options: { refreshComposition?: boolean } = {}
): void {
  if (!window || window.isDestroyed()) {
    return;
  }

  window.setBackgroundColor(getBackgroundColor());

  if (process.platform !== 'win32') {
    return;
  }

  window.setBackgroundMaterial(acrylicEnabled ? 'acrylic' : 'none');

  if (options.refreshComposition && acrylicEnabled) {
    refreshWindowsAcrylicComposition(window);
  }
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
      backgroundMaterial: acrylicEnabled ? 'acrylic' : 'none',
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

  mainWindow.on('maximize', () => sendWindowMaximizedState(mainWindow));
  mainWindow.on('unmaximize', () => sendWindowMaximizedState(mainWindow));
  mainWindow.on('restore', () => sendWindowMaximizedState(mainWindow));

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    applyWindowAppearance(mainWindow);
    mainWindow?.show();

    mainWindow?.webContents.send('theme:changed', isDark ? 'dark' : 'light');
    sendWindowMaximizedState(mainWindow);

    if (mainWindow) {
      setTimeout(() => applyWindowAppearance(mainWindow, { refreshComposition: true }), 80);
    }
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

  applyWindowAppearance(mainWindow, { refreshComposition: true });

  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

// Listen for native theme changes and push to renderer
nativeTheme.on('updated', () => {
  const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme:changed', theme);
    applyWindowAppearance(mainWindow, { refreshComposition: true });
  }
});

ipcMain.handle('appearance:set-acrylic-enabled', (event, enabled: boolean) => {
  acrylicEnabled = enabled !== false;
  applyWindowAppearance(resolveWindow(event), { refreshComposition: true });
  return acrylicEnabled;
});

ipcMain.handle('appearance:get-acrylic-enabled', () => {
  return acrylicEnabled;
});

ipcMain.handle('window:minimize', (event) => {
  const targetWindow = resolveWindow(event);
  if (!targetWindow) return false;

  targetWindow.minimize();
  return true;
});

ipcMain.handle('window:toggle-maximize', (event) => {
  const targetWindow = resolveWindow(event);
  if (!targetWindow) return false;

  if (targetWindow.isMaximized()) {
    targetWindow.unmaximize();
  } else {
    targetWindow.maximize();
  }

  sendWindowMaximizedState(targetWindow);
  return targetWindow.isMaximized();
});

ipcMain.handle('window:close', (event) => {
  const targetWindow = resolveWindow(event);
  if (!targetWindow) return false;

  targetWindow.close();
  return true;
});

ipcMain.handle('window:is-maximized', (event) => {
  return resolveWindow(event)?.isMaximized() ?? false;
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
    const result = await sshManager.executeDetailed(sessionId, command);
    if (result.exitCode !== null && result.exitCode !== 0) {
      const error = result.stderr.trim() || result.stdout.trim() || `Command exited with code ${result.exitCode}`;
      return { success: false, error };
    }
    return { success: true, output: result.stdout };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// LLM Agent IPC handlers
ipcMain.handle('agent:plan', async (event, request: any) => {
  return agentManager.createPlan(request, (status, detail) => {
    if (request?.requestId) {
      event.sender.send(`agent:status:${request.requestId}`, { status, detail });
    }
  });
});

ipcMain.handle('agent:execute', async (event, request: any) => {
  return agentManager.executePlan(request, (status, detail) => {
    if (request?.requestId) {
      event.sender.send(`agent:status:${request.requestId}`, { status, detail });
    }
  });
});

ipcMain.handle('agent:context', (_event, sessionId: string) => {
  return { success: true, context: agentManager.getContext(sessionId) };
});

ipcMain.handle('agent:clear-context', (_event, sessionId: string) => {
  agentManager.clearContext(sessionId);
  return { success: true };
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

// Dialog IPC handlers
ipcMain.handle('dialog:open-folder', async (event) => {
  const targetWindow = resolveWindow(event);
  if (!targetWindow) {
    return { success: false, error: 'Window not available' };
  }

  const result = await dialog.showOpenDialog(targetWindow, {
    properties: ['openDirectory'],
    title: 'Open Project Folder',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: true, canceled: true };
  }

  return { success: true, filePaths: result.filePaths };
});

// Project IPC handlers
ipcMain.handle('project:list-files', async (_event, dirPath: string) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const files = entries.map((entry) => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
    })).sort((a, b) => {
      if (a.isDirectory === b.isDirectory) {
        return a.name.localeCompare(b.name);
      }
      return a.isDirectory ? -1 : 1;
    });
    return { success: true, files };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('project:read-file', async (_event, filePath: string) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Git IPC handlers
const execFileAsync = promisify(execFile);

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, {
    cwd,
    windowsHide: true,
    encoding: 'utf-8',
  });
  return result.stdout as string;
}

ipcMain.handle('git:status', async (_event, cwd: string) => {
  try {
    const stdout = await runGit(cwd, ['status', '--porcelain']);
    const lines = stdout.trim().split('\n').filter(Boolean);
    interface GitStatusEntry { path: string; indexStatus: string; worktreeStatus: string; }
    const entries: GitStatusEntry[] = lines.map(line => {
      const indexStatus = line[0] || ' ';
      const worktreeStatus = line[1] || ' ';
      const filePath = line.substring(3);
      const arrowIdx = filePath.indexOf(' -> ');
      const finalPath = arrowIdx > 0 ? filePath.substring(arrowIdx + 4) : filePath;
      return { path: finalPath, indexStatus, worktreeStatus };
    });
    return { success: true, entries };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git:branch', async (_event, cwd: string) => {
  try {
    const stdout = await runGit(cwd, ['branch', '--show-current']);
    return { success: true, branch: stdout.trim() || null };
  } catch (_err: any) {
    try {
      const fallback = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
      return { success: true, branch: fallback.trim() || null };
    } catch (err2: any) {
      return { success: false, error: err2.message };
    }
  }
});

ipcMain.handle('git:log', async (_event, cwd: string, count: number = 50) => {
  try {
    const stdout = await runGit(cwd, ['log', '--format=%H|%s|%an|%ad', '--date=short', `-n${count}`]);
    const lines = stdout.trim().split('\n').filter(Boolean);
    const commits = lines.map(line => {
      const [hash, message, author, date] = line.split('|');
      return { hash, shortHash: hash.substring(0, 7), message, author, date };
    });
    return { success: true, commits };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git:show', async (_event, cwd: string, hash: string) => {
  try {
    const statOut = await runGit(cwd, ['show', '--stat', '--format=%H|%s|%an|%ae|%ad', '--date=short', '-s', hash]);
    const [infoLine] = statOut.trim().split('\n');
    const [h, message, author, email, date] = infoLine.split('|');
    const diff = await runGit(cwd, ['show', hash]);
    return {
      success: true,
      commit: { hash: h, shortHash: h.substring(0, 7), message, author, email, date },
      diff: diff.trim(),
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git:diff', async (_event, cwd: string, filePath: string, staged: boolean = false) => {
  try {
    const args = staged ? ['diff', '--staged', '--', filePath] : ['diff', '--', filePath];
    const stdout = await runGit(cwd, args);
    return { success: true, diff: stdout };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('git:version', async () => {
  try {
    const stdout = await runGit(process.cwd(), ['--version']);
    return { success: true, version: stdout.trim() };
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
