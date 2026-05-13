import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Welcome } from './components/Welcome';
import { Terminal } from './components/Terminal';
import { ConnectionDialog } from './components/ConnectionDialog';
import { TitleBar } from './components/TitleBar';
import { SettingsDialog } from './components/SettingsDialog';
import { Onboarding } from './components/Onboarding';

declare global {
  interface Window {
    electronAPI: {
      theme: {
        get: () => Promise<'dark' | 'light'>;
        set: (theme: 'dark' | 'light') => Promise<'dark' | 'light'>;
        onChange: (callback: (theme: 'dark' | 'light') => void) => () => void;
      };
      window: {
        minimize: () => Promise<void>;
        toggleMaximize: () => Promise<boolean>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
      };
      ssh: {
        connect: (config: any) => Promise<{ success: boolean; error?: string }>;
        disconnect: (sessionId: string) => Promise<{ success: boolean }>;
        write: (sessionId: string, data: string) => void;
        resize: (sessionId: string, cols: number, rows: number) => void;
        execute: (sessionId: string, command: string) => Promise<{ success: boolean; output?: string; error?: string }>;
        onData: (sessionId: string, callback: (data: string) => void) => () => void;
        onClose: (sessionId: string, callback: () => void) => () => void;
      };
      sftp: {
        list: (sessionId: string, remotePath: string) => Promise<{ success: boolean; files?: any[]; error?: string }>;
        mkdir: (sessionId: string, remotePath: string) => Promise<{ success: boolean; error?: string }>;
        delete: (sessionId: string, remotePath: string, type: 'file' | 'directory') => Promise<{ success: boolean; error?: string }>;
        upload: (sessionId: string, remoteDir: string) => Promise<{ success: boolean; canceled?: boolean; remotePath?: string; error?: string }>;
        download: (sessionId: string, remotePath: string, filename: string) => Promise<{ success: boolean; canceled?: boolean; localPath?: string; error?: string }>;
      };
      forward: {
        list: (sessionId: string) => Promise<{ success: boolean; forwards?: any[]; error?: string }>;
        start: (config: any) => Promise<{ success: boolean; forward?: any; error?: string }>;
        stop: (id: string) => Promise<{ success: boolean; error?: string }>;
      };
    };
  }
}

export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export interface Tab {
  connection: Connection;
  active: boolean;
}

export type AcrylicTone = 'auto' | 'dark' | 'light';

export interface AppSettings {
  acrylicOpacity: number;
  workspaceTint: number;
  terminalOpacity: number;
  acrylicBlur: number;
  acrylicTone: AcrylicTone;
  terminalFontSize: number;
  terminalCursorBlink: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  acrylicOpacity: 0.55,
  workspaceTint: 0,
  terminalOpacity: 0.72,
  acrylicBlur: 32,
  acrylicTone: 'auto',
  terminalFontSize: 14,
  terminalCursorBlink: true,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function loadSettings(): AppSettings {
  try {
    const saved = localStorage.getItem('xlterm-settings');
    const parsed = saved ? JSON.parse(saved) : {};
    const legacyOpacity = Number(localStorage.getItem('xlterm-glass-opacity'));
    const fallbackOpacity = Number.isFinite(legacyOpacity) ? legacyOpacity : DEFAULT_SETTINGS.acrylicOpacity;
    const tone = parsed.acrylicTone === 'dark' || parsed.acrylicTone === 'light' || parsed.acrylicTone === 'auto'
      ? parsed.acrylicTone
      : DEFAULT_SETTINGS.acrylicTone;

    return {
      acrylicOpacity: clampNumber(parsed.acrylicOpacity, 0.2, 0.85, clampNumber(fallbackOpacity, 0.2, 0.85, DEFAULT_SETTINGS.acrylicOpacity)),
      workspaceTint: clampNumber(parsed.workspaceTint, 0, 0.35, DEFAULT_SETTINGS.workspaceTint),
      terminalOpacity: clampNumber(parsed.terminalOpacity, 0.45, 0.95, DEFAULT_SETTINGS.terminalOpacity),
      acrylicBlur: clampNumber(parsed.acrylicBlur, 12, 48, DEFAULT_SETTINGS.acrylicBlur),
      acrylicTone: tone,
      terminalFontSize: clampNumber(parsed.terminalFontSize, 12, 20, DEFAULT_SETTINGS.terminalFontSize),
      terminalCursorBlink: typeof parsed.terminalCursorBlink === 'boolean'
        ? parsed.terminalCursorBlink
        : DEFAULT_SETTINGS.terminalCursorBlink,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function App(): React.ReactElement {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem('xlterm-onboarding-complete') !== 'true';
  });
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [savedConnections, setSavedConnections] = useState<Connection[]>(() => {
    try {
      const saved = localStorage.getItem('xlterm-connections');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // Sync theme with OS
  useEffect(() => {
    const savedTheme = localStorage.getItem('xlterm-theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      window.electronAPI.theme.set(savedTheme).then(setTheme);
    } else {
      window.electronAPI.theme.get().then(setTheme);
    }

    const cleanup = window.electronAPI.theme.onChange((newTheme) => {
      setTheme(newTheme);
    });
    return cleanup;
  }, []);

  // Apply theme attribute to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const tone = settings.acrylicTone === 'auto' ? theme : settings.acrylicTone;
    const acrylicTintRgb = tone === 'dark' ? '24 28 36' : '245 248 252';
    const workspaceTintRgb = tone === 'dark' ? '11 16 24' : '247 250 252';
    const solidRgb = tone === 'dark' ? '13, 17, 23' : '255, 255, 255';
    const solidRgb2 = tone === 'dark' ? '22, 27, 34' : '246, 248, 250';
    const solidAlpha = tone === 'dark' ? 0.68 : 0.7;
    const solidAlpha2 = tone === 'dark' ? 0.62 : 0.66;

    root.style.setProperty('--acrylic-tint-rgb', acrylicTintRgb);
    root.style.setProperty('--acrylic-opacity', settings.acrylicOpacity.toFixed(3));
    root.style.setProperty('--acrylic-blur', `${settings.acrylicBlur}px`);
    root.style.setProperty('--app-backdrop', `rgba(${workspaceTintRgb.replaceAll(' ', ', ')}, ${settings.workspaceTint.toFixed(3)})`);
    root.style.setProperty('--main-area-opacity', Math.min(0.28, settings.workspaceTint).toFixed(3));
    root.style.setProperty('--terminal-alpha', settings.terminalOpacity.toFixed(3));
    root.style.setProperty('--terminal-panel-alpha', Math.max(0.08, settings.terminalOpacity - 0.26).toFixed(3));
    root.style.setProperty('--solid-surface', `rgba(${solidRgb}, ${solidAlpha})`);
    root.style.setProperty('--solid-surface-2', `rgba(${solidRgb2}, ${solidAlpha2})`);
    localStorage.setItem('xlterm-settings', JSON.stringify(settings));
  }, [theme, settings]);

  const handleConnect = useCallback((connection: Connection) => {
    const existing = savedConnections.find(c => c.id === connection.id);
    let updated: Connection[];
    if (existing) {
      updated = savedConnections.map(c => c.id === connection.id ? connection : c);
    } else {
      updated = [...savedConnections, connection];
    }
    setSavedConnections(updated);
    localStorage.setItem('xlterm-connections', JSON.stringify(updated));

    setTabs(prev => prev.map(t => t.connection.id === connection.id ? { ...t, connection } : t));

    const existingTab = tabs.find(t => t.connection.id === connection.id);
    if (existingTab) {
      setActiveTabId(connection.id);
    } else {
      setTabs(prev => [...prev, { connection, active: true }]);
      setActiveTabId(connection.id);
    }
    setShowDialog(false);
    setEditingConnection(null);
  }, [savedConnections, tabs]);

  const handleCloseTab = useCallback((id: string) => {
    setTabs(prev => prev.filter(t => t.connection.id !== id));
    if (activeTabId === id) {
      const remaining = tabs.filter(t => t.connection.id !== id);
      setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].connection.id : null);
    }
  }, [activeTabId, tabs]);

  const handleDeleteConnection = useCallback((id: string) => {
    const updated = savedConnections.filter(c => c.id !== id);
    setSavedConnections(updated);
    localStorage.setItem('xlterm-connections', JSON.stringify(updated));
    handleCloseTab(id);
  }, [savedConnections, handleCloseTab]);

  const handleEditConnection = useCallback((connection: Connection) => {
    setEditingConnection(connection);
    setShowDialog(true);
  }, []);

  const activeTab = tabs.find(t => t.connection.id === activeTabId);
  const handleToggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('xlterm-theme', nextTheme);
    window.electronAPI.theme.set(nextTheme).then(setTheme);
  }, [theme]);

  const handleThemeChange = useCallback((nextTheme: 'dark' | 'light') => {
    localStorage.setItem('xlterm-theme', nextTheme);
    window.electronAPI.theme.set(nextTheme).then(setTheme);
  }, []);

  const handleSettingsChange = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...patch }));
  }, []);

  return (
    <>
      <TitleBar
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={() => setShowSettings(true)}
      />
      <Sidebar
        connections={savedConnections}
        activeId={activeTabId}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onConnect={handleConnect}
        onNew={() => { setEditingConnection(null); setShowDialog(true); }}
        onSelect={(id) => setActiveTabId(id)}
        onDelete={handleDeleteConnection}
        onEdit={handleEditConnection}
      />
      <main className="main-area">
        {activeTab ? (
          <Terminal
            tabs={tabs}
            activeTabId={activeTabId!}
            onSelectTab={setActiveTabId}
            onCloseTab={handleCloseTab}
            theme={theme}
            terminalOpacity={settings.terminalOpacity}
            terminalFontSize={settings.terminalFontSize}
            terminalCursorBlink={settings.terminalCursorBlink}
          />
        ) : (
          <Welcome onNewConnection={() => { setEditingConnection(null); setShowDialog(true); }} />
        )}
      </main>
      {showDialog && (
        <ConnectionDialog
          connection={editingConnection}
          onConnect={handleConnect}
          onClose={() => { setShowDialog(false); setEditingConnection(null); }}
        />
      )}
      {showSettings && (
        <SettingsDialog
          theme={theme}
          settings={settings}
          onThemeChange={handleThemeChange}
          onSettingsChange={handleSettingsChange}
          onResetSettings={() => setSettings(DEFAULT_SETTINGS)}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showOnboarding && (
        <Onboarding
          onFinish={() => {
            localStorage.setItem('xlterm-onboarding-complete', 'true');
            setShowOnboarding(false);
          }}
        />
      )}
    </>
  );
}
