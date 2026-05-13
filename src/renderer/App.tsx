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

export function App(): React.ReactElement {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [glassOpacity, setGlassOpacity] = useState(() => {
    const saved = Number(localStorage.getItem('xlterm-glass-opacity'));
    return Number.isFinite(saved) && saved >= 0.35 && saved <= 1 ? saved : 0.5;
  });
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
    const base = theme === 'dark'
      ? {
          bgPrimary: 0.54,
          bgSecondary: 0.48,
          bgTertiary: 0.56,
          surfaceGlass: 0.42,
          surfaceStrong: 0.68,
          chrome: 0.5,
          terminal: 0.7,
          terminalPanel: 0.44,
        }
      : {
          bgPrimary: 0.58,
          bgSecondary: 0.48,
          bgTertiary: 0.58,
          surfaceGlass: 0.44,
          surfaceStrong: 0.74,
          chrome: 0.58,
          terminal: 0.78,
          terminalPanel: 0.48,
        };

    const scaled = (value: number) => Math.max(0.08, Math.min(0.95, value * glassOpacity)).toFixed(3);
    const root = document.documentElement;
    root.style.setProperty('--bg-primary-alpha', scaled(base.bgPrimary));
    root.style.setProperty('--bg-secondary-alpha', scaled(base.bgSecondary));
    root.style.setProperty('--bg-tertiary-alpha', scaled(base.bgTertiary));
    root.style.setProperty('--surface-glass-alpha', scaled(base.surfaceGlass));
    root.style.setProperty('--surface-strong-alpha', scaled(base.surfaceStrong));
    root.style.setProperty('--chrome-alpha', scaled(base.chrome));
    root.style.setProperty('--terminal-alpha', scaled(base.terminal));
    root.style.setProperty('--terminal-panel-alpha', scaled(base.terminalPanel));
    localStorage.setItem('xlterm-glass-opacity', String(glassOpacity));
  }, [theme, glassOpacity]);

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
            glassOpacity={glassOpacity}
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
          glassOpacity={glassOpacity}
          onGlassOpacityChange={setGlassOpacity}
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
