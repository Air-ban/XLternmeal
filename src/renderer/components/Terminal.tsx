import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { SFTPPanel } from './SFTPPanel';
import { PortForwardPanel } from './PortForwardPanel';
import { AgentPanel } from './AgentPanel';
import { SystemMonitor } from './SystemMonitor';
import type { DockablePanel, LLMProviderConfig } from '../App';

declare global {
  interface Window {
    electronAPI: {
      theme: {
        get: () => Promise<'dark' | 'light'>;
        set: (theme: 'dark' | 'light') => Promise<'dark' | 'light'>;
        onChange: (callback: (theme: 'dark' | 'light') => void) => () => void;
      };
      appearance: {
        getAcrylicEnabled: () => Promise<boolean>;
        setAcrylicEnabled: (enabled: boolean) => Promise<boolean>;
      };
      window: {
        minimize: () => Promise<boolean>;
        toggleMaximize: () => Promise<boolean>;
        close: () => Promise<boolean>;
        isMaximized: () => Promise<boolean>;
        onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
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
      agent: {
        createPlan: (request: any) => Promise<{ success: boolean; plan?: any; context?: any[]; error?: string }>;
        executePlan: (request: any) => Promise<{ success: boolean; result?: any; plan?: any; context?: any[]; error?: string }>;
        getContext: (sessionId: string) => Promise<{ success: boolean; context?: any[]; error?: string }>;
        clearContext: (sessionId: string) => Promise<{ success: boolean; error?: string }>;
        onStatus: (requestId: string, callback: (event: { status: string; detail: string }) => void) => () => void;
      };
    };
  }
}

interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

interface Tab {
  connection: Connection;
}

interface TerminalProps {
  tabs: Tab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  theme: 'dark' | 'light';
  terminalOpacity: number;
  terminalFontSize: number;
  terminalCursorBlink: boolean;
  llmProviders: LLMProviderConfig[];
  activeLlmProviderId: string;
  onActiveLlmProviderChange: (id: string) => void;
  dockedSidePanel: DockablePanel;
  dockedSidePanelWidth: number;
  onSettingsChange: (patch: Partial<{ dockedSidePanel: DockablePanel; dockedSidePanelWidth: number }>) => void;
}

type TerminalStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
type ToolView = 'terminal' | 'agent' | 'sftp' | 'forward' | 'monitor';

function getTerminalTheme(theme: 'dark' | 'light', terminalOpacity: number) {
  const terminalAlpha = Math.max(0.45, Math.min(0.95, terminalOpacity)).toFixed(3);

  return theme === 'dark' ? {
    background: `rgba(3, 7, 12, ${terminalAlpha})`,
    foreground: '#e6edf3',
    cursor: '#58a6ff',
    cursorAccent: '#0d1117',
    selectionBackground: '#30363d',
    black: '#484f58',
    red: '#ff7b72',
    green: '#3fb950',
    yellow: '#d29922',
    blue: '#58a6ff',
    magenta: '#bc8cff',
    cyan: '#39c5cf',
    white: '#b1bac4',
    brightBlack: '#6e7681',
    brightRed: '#ffa198',
    brightGreen: '#56d364',
    brightYellow: '#e3b341',
    brightBlue: '#79c0ff',
    brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd',
    brightWhite: '#f0f6fc',
  } : {
    background: `rgba(255, 255, 255, ${terminalAlpha})`,
    foreground: '#1f2328',
    cursor: '#0969da',
    cursorAccent: '#ffffff',
    selectionBackground: '#d0d7de',
    black: '#57606a',
    red: '#cf222e',
    green: '#1a7f37',
    yellow: '#9a6700',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#6e7781',
    brightBlack: '#8c959f',
    brightRed: '#a40e26',
    brightGreen: '#116329',
    brightYellow: '#7d4e00',
    brightBlue: '#0550ae',
    brightMagenta: '#6e40c9',
    brightCyan: '#0a5c62',
    brightWhite: '#1f2328',
  };
}

export function Terminal({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  theme,
  terminalOpacity,
  terminalFontSize,
  terminalCursorBlink,
  llmProviders,
  activeLlmProviderId,
  onActiveLlmProviderChange,
  dockedSidePanel,
  dockedSidePanelWidth,
  onSettingsChange,
}: TerminalProps): React.ReactElement {
  const [statuses, setStatuses] = useState<Record<string, TerminalStatus>>({});
  const [activeView, setActiveView] = useState<ToolView>('terminal');
  const [localSplitWidth, setLocalSplitWidth] = useState(dockedSidePanelWidth);
  const splitWrapperRef = useRef<HTMLDivElement | null>(null);
  const [dragPreviewX, setDragPreviewX] = useState<number | null>(null);
  const dragFinalXRef = useRef(0);
  const wrapperLeftRef = useRef(0);

  useEffect(() => {
    setLocalSplitWidth(dockedSidePanelWidth);
  }, [dockedSidePanelWidth]);

  useEffect(() => {
    if (dockedSidePanel !== 'none' && activeView === dockedSidePanel) {
      setActiveView('terminal');
    }
  }, [dockedSidePanel]);

  const mainActiveView: ToolView = dockedSidePanel !== 'none' && activeView === dockedSidePanel ? 'terminal' : activeView;

  const handleStatusChange = (id: string, status: TerminalStatus) => {
    setStatuses(prev => ({ ...prev, [id]: status }));
  };

  const TOOL_TABS: { key: ToolView; label: string }[] = [
    { key: 'terminal', label: 'Terminal' },
    { key: 'agent', label: 'AI Agent' },
    { key: 'sftp', label: 'SFTP' },
    { key: 'forward', label: 'Port Forward' },
    { key: 'monitor', label: 'Monitor' },
  ];

  const PANEL_LABELS: Record<DockablePanel, string> = {
    none: '',
    monitor: 'Monitor',
    agent: 'AI Agent',
    sftp: 'SFTP',
    forward: 'Port Forward',
  };

  const switcherTabs = TOOL_TABS.filter(t => t.key !== dockedSidePanel);

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const wrapperEl = splitWrapperRef.current;
    if (!wrapperEl) return;
    const wrapperWidth = wrapperEl.clientWidth;
    const startWidth = localSplitWidth;
    dragFinalXRef.current = startX;
    wrapperLeftRef.current = wrapperEl.getBoundingClientRect().left;
    setDragPreviewX(startX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      dragFinalXRef.current = moveEvent.clientX;
      setDragPreviewX(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      setDragPreviewX(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      const delta = startX - dragFinalXRef.current;
      const finalWidth = startWidth + delta / wrapperWidth;
      const clamped = Math.max(0.15, Math.min(0.55, finalWidth));
      setLocalSplitWidth(clamped);
      onSettingsChange({ dockedSidePanelWidth: clamped });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const isSplit = dockedSidePanel !== 'none';

  const renderDockedPanel = () => {
    if (dockedSidePanel === 'monitor') return <SystemMonitor sessionId={activeTabId} theme={theme} />;
    if (dockedSidePanel === 'agent') return <AgentPanel sessionId={activeTabId} llmProviders={llmProviders} activeLlmProviderId={activeLlmProviderId} onActiveLlmProviderChange={onActiveLlmProviderChange} />;
    if (dockedSidePanel === 'sftp') return <SFTPPanel sessionId={activeTabId} />;
    if (dockedSidePanel === 'forward') return <PortForwardPanel sessionId={activeTabId} />;
    return null;
  };

  const renderMainPanel = () => {
    if (mainActiveView === 'agent' && dockedSidePanel !== 'agent') return <AgentPanel sessionId={activeTabId} llmProviders={llmProviders} activeLlmProviderId={activeLlmProviderId} onActiveLlmProviderChange={onActiveLlmProviderChange} />;
    if (mainActiveView === 'sftp' && dockedSidePanel !== 'sftp') return <SFTPPanel sessionId={activeTabId} />;
    if (mainActiveView === 'forward' && dockedSidePanel !== 'forward') return <PortForwardPanel sessionId={activeTabId} />;
    if (mainActiveView === 'monitor' && dockedSidePanel !== 'monitor') return <SystemMonitor sessionId={activeTabId} theme={theme} />;
    return null;
  };

  return (
    <div className="terminal-container">
      <div className="tab-bar">
        {tabs.map((tab) => {
          const status = statuses[tab.connection.id] || 'connecting';
          const isActive = tab.connection.id === activeTabId;

          return (
            <div
              key={tab.connection.id}
              className={`tab ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(tab.connection.id)}
            >
              <span className="tab-status">
                {status === 'connected' && <span className="tab-dot connected"></span>}
                {status === 'connecting' && <span className="tab-dot connecting"></span>}
                {status === 'error' && <span className="tab-dot error"></span>}
                {status === 'disconnected' && <span className="tab-dot disconnected"></span>}
              </span>
              <span className="tab-name">{tab.connection.name}</span>
              <button
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); onCloseTab(tab.connection.id); }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      <div className="tool-switcher">
        {switcherTabs.map(({ key, label }) => (
          <button
            key={key}
            className={`tool-tab ${mainActiveView === key ? 'active' : ''}`}
            onClick={() => setActiveView(key)}
            onDoubleClick={() => {
              if (key === 'terminal') return;
              onSettingsChange({
                dockedSidePanel: dockedSidePanel === key ? 'none' : (key as DockablePanel),
              });
            }}
            title={key === 'terminal' ? '' : '双击固定到侧边'}
          >
            {label}
          </button>
        ))}
        {isSplit && (
          <span className="tool-tab-docked-indicator">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 2h10v8H1z" stroke="var(--success)" strokeWidth="1" strokeLinejoin="round" />
              <path d="M7 2v8" stroke="var(--success)" strokeWidth="1" />
            </svg>
            {PANEL_LABELS[dockedSidePanel]}
          </span>
        )}
      </div>
      {isSplit ? (
        <div className="terminal-wrapper split-layout" ref={splitWrapperRef}>
          {dragPreviewX !== null && (
            <div
              className="split-ghost"
              style={{ left: `${dragPreviewX - wrapperLeftRef.current}px` }}
            />
          )}
          <div className="split-main">
            {tabs.map((tab) => (
              <TerminalSession
                key={tab.connection.id}
                connection={tab.connection}
                active={mainActiveView === 'terminal' && tab.connection.id === activeTabId}
                theme={theme}
                terminalOpacity={terminalOpacity}
                terminalFontSize={terminalFontSize}
                terminalCursorBlink={terminalCursorBlink}
                onStatusChange={handleStatusChange}
              />
            ))}
            {renderMainPanel()}
          </div>
          <div className="split-divider" onMouseDown={handleDividerMouseDown}>
            <div className="split-divider-handle" />
          </div>
          <div className="split-side" style={{ width: `${localSplitWidth * 100}%` }}>
            <div className="split-side-header">
              <span className="split-side-title">{PANEL_LABELS[dockedSidePanel]}</span>
              <button
                className="split-side-undock"
                onClick={() => onSettingsChange({ dockedSidePanel: 'none' })}
                title="Undock panel"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="split-side-body">
              {renderDockedPanel()}
            </div>
          </div>
        </div>
      ) : (
        <div className="terminal-wrapper">
          {tabs.map((tab) => (
            <TerminalSession
              key={tab.connection.id}
              connection={tab.connection}
              active={activeView === 'terminal' && tab.connection.id === activeTabId}
              theme={theme}
              terminalOpacity={terminalOpacity}
              terminalFontSize={terminalFontSize}
              terminalCursorBlink={terminalCursorBlink}
              onStatusChange={handleStatusChange}
            />
          ))}
          {activeView === 'agent' && (
            <AgentPanel
              sessionId={activeTabId}
              llmProviders={llmProviders}
              activeLlmProviderId={activeLlmProviderId}
              onActiveLlmProviderChange={onActiveLlmProviderChange}
            />
          )}
          {activeView === 'sftp' && <SFTPPanel sessionId={activeTabId} />}
          {activeView === 'forward' && <PortForwardPanel sessionId={activeTabId} />}
          {activeView === 'monitor' && <SystemMonitor sessionId={activeTabId} theme={theme} />}
        </div>
      )}

      <style>{`
        .terminal-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: transparent;
        }

        .tab-bar {
          display: flex;
          background: rgba(var(--acrylic-tint-rgb), var(--acrylic-opacity));
          border-bottom: 1px solid var(--border-color);
          overflow-x: auto;
          flex-shrink: 0;
          backdrop-filter: blur(var(--acrylic-blur)) saturate(var(--acrylic-saturation));
          -webkit-backdrop-filter: blur(var(--acrylic-blur)) saturate(var(--acrylic-saturation));
          -webkit-app-region: no-drag;
        }

        .tab-bar::-webkit-scrollbar { height: 2px; }

        .tool-switcher {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-color);
          background: rgba(var(--acrylic-tint-rgb), var(--acrylic-opacity));
          backdrop-filter: blur(var(--acrylic-blur)) saturate(var(--acrylic-saturation));
          -webkit-backdrop-filter: blur(var(--acrylic-blur)) saturate(var(--acrylic-saturation));
          -webkit-app-region: no-drag;
        }

        .tool-tab {
          padding: 6px 12px;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
        }

        .tool-tab:hover {
          color: var(--text-primary);
          background: var(--bg-secondary);
        }

        .tool-tab.active {
          color: var(--accent);
          background: var(--accent-subtle);
          border-color: rgba(88, 166, 255, 0.24);
        }

        .tool-tab-docked-indicator {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px 10px;
          border: 1px solid rgba(63, 185, 80, 0.28);
          border-radius: var(--radius-sm);
          background: rgba(63, 185, 80, 0.08);
          color: var(--success);
          font-size: 12px;
          font-weight: 500;
          margin-left: auto;
        }

        .tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          cursor: pointer;
          border-right: 1px solid var(--border-color);
          transition: background var(--transition);
          white-space: nowrap;
          user-select: none;
          position: relative;
        }

        .tab:hover { background: var(--bg-tertiary); }

        .tab.active {
          background: var(--terminal-panel-bg);
        }

        .tab.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: var(--accent);
        }

        .tab-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          display: inline-block;
        }

        .tab-dot.connected { background: var(--success); }
        .tab-dot.connecting { background: var(--warning); animation: pulse 1.5s infinite; }
        .tab-dot.disconnected { background: var(--text-muted); }
        .tab-dot.error { background: var(--danger); }

        .tab-name {
          font-size: 12px;
          color: var(--text-secondary);
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .tab.active .tab-name { color: var(--text-primary); }

        .tab-close {
          width: 18px;
          height: 18px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          transition: all var(--transition);
        }

        .tab:hover .tab-close { opacity: 1; }
        .tab-close:hover { background: var(--bg-tertiary); color: var(--danger); }

        .terminal-wrapper {
          flex: 1;
          position: relative;
          overflow: hidden;
          background: transparent;
          display: flex;
          flex-direction: column;
        }

        .terminal-wrapper.split-layout {
          display: flex;
          flex-direction: row;
        }

        .split-main {
          flex: 1;
          position: relative;
          overflow: hidden;
          min-width: 200px;
          display: flex;
          flex-direction: column;
        }

        .split-ghost {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 3px;
          background: var(--accent);
          pointer-events: none;
          z-index: 50;
          opacity: 0.8;
        }

        .split-divider {
          width: 6px;
          cursor: col-resize;
          background: var(--border-color);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 150ms ease;
          position: relative;
        }

        .split-divider:hover {
          background: var(--accent);
        }

        .split-divider-handle {
          width: 2px;
          height: 32px;
          border-radius: 1px;
          background: var(--text-muted);
          opacity: 0.5;
          transition: opacity 150ms ease;
        }

        .split-divider:hover .split-divider-handle {
          opacity: 1;
          background: var(--accent);
        }

        .split-side {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 180px;
          border-left: none;
        }

        .split-side-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 12px;
          border-bottom: 1px solid var(--border-color);
          background: rgba(var(--acrylic-tint-rgb), var(--acrylic-opacity));
          backdrop-filter: blur(var(--acrylic-blur)) saturate(var(--acrylic-saturation));
          -webkit-backdrop-filter: blur(var(--acrylic-blur)) saturate(var(--acrylic-saturation));
          flex-shrink: 0;
        }

        .split-side-title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          color: var(--success);
        }

        .split-side-undock {
          width: 22px;
          height: 22px;
          border: none;
          border-radius: 3px;
          background: transparent;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 150ms ease;
        }

        .split-side-undock:hover {
          background: var(--bg-tertiary);
          color: var(--danger);
        }

        .split-side-body {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .split-side-body > .system-monitor {
          flex: 1;
        }

        .terminal-session {
          position: absolute;
          inset: 0;
          background: var(--terminal-bg);
        }

        .terminal-element .xterm,
        .terminal-element .xterm-viewport,
        .terminal-element .xterm-screen {
          background: transparent !important;
        }

        .terminal-session.hidden {
          visibility: hidden;
          pointer-events: none;
        }

        .terminal-element {
          width: 100%;
          height: 100%;
        }

        .terminal-error {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--danger);
          text-align: center;
          background: var(--surface-strong);
          backdrop-filter: blur(24px) saturate(1.35);
          -webkit-backdrop-filter: blur(24px) saturate(1.35);
          z-index: 10;
        }

        .terminal-error h3 {
          font-size: 18px;
          font-weight: 600;
        }

        .terminal-error p {
          font-size: 14px;
          color: var(--text-secondary);
          max-width: 400px;
        }
      `}</style>
    </div>
  );
}

interface TerminalSessionProps {
  connection: Connection;
  active: boolean;
  theme: 'dark' | 'light';
  terminalOpacity: number;
  terminalFontSize: number;
  terminalCursorBlink: boolean;
  onStatusChange: (id: string, status: TerminalStatus) => void;
}

const TERMINAL_FONT_FAMILY = [
  '"Cascadia Mono"',
  '"Cascadia Code"',
  '"CaskaydiaCove Nerd Font"',
  '"CaskaydiaMono Nerd Font"',
  '"JetBrainsMono Nerd Font"',
  '"FiraCode Nerd Font"',
  '"Hack Nerd Font"',
  '"UbuntuMono Nerd Font"',
  '"Symbols Nerd Font Mono"',
  '"MesloLGS NF"',
  '"DejaVu Sans Mono"',
  '"Noto Sans Mono"',
  '"Noto Sans Mono CJK SC"',
  '"Noto Color Emoji"',
  '"Microsoft YaHei UI"',
  '"Microsoft YaHei"',
  '"Microsoft JhengHei UI"',
  '"Malgun Gothic"',
  '"Yu Gothic UI"',
  '"Segoe UI Symbol"',
  '"Segoe UI Emoji"',
  'Consolas',
  '"Courier New"',
  'monospace',
].join(', ');

function TerminalSession({
  connection,
  active,
  theme,
  terminalOpacity,
  terminalFontSize,
  terminalCursorBlink,
  onStatusChange,
}: TerminalSessionProps): React.ReactElement {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<TerminalStatus>('connecting');
  const [errorMsg, setErrorMsg] = useState('');

  const updateStatus = (nextStatus: TerminalStatus) => {
    setStatus(nextStatus);
    onStatusChange(connection.id, nextStatus);
  };

  useEffect(() => {
    const container = terminalRef.current;
    if (!container) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    const initTerminal = async () => {
      updateStatus('connecting');
      setErrorMsg('');

      const term = new XTerm({
        cursorBlink: terminalCursorBlink,
        cursorStyle: 'bar',
        fontSize: terminalFontSize,
        fontFamily: TERMINAL_FONT_FAMILY,
        letterSpacing: 0,
        lineHeight: 1.18,
        theme: getTerminalTheme(theme, terminalOpacity),
        allowProposedApi: true,
        scrollback: 5000,
      });

      const fitAddon = new FitAddon();
      const unicode11Addon = new Unicode11Addon();
      term.loadAddon(fitAddon);
      term.loadAddon(unicode11Addon);
      term.unicode.activeVersion = '11';
      term.open(container);
      fitAddon.fit();

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      // Connect to SSH
      try {
        const result = await window.electronAPI.ssh.connect({
          id: connection.id,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          privateKey: connection.privateKey,
        });

        if (disposed) {
          window.electronAPI.ssh.disconnect(connection.id);
          term.dispose();
          return;
        }

        if (!result.success) {
          updateStatus('error');
          setErrorMsg(result.error || 'Connection failed');
          term.write(`\r\n\x1b[31mConnection failed: ${result.error}\x1b[0m\r\n`);
          return;
        }

        updateStatus('connected');

        // Handle terminal input
        term.onData((data: string) => {
          window.electronAPI.ssh.write(connection.id, data);
        });

        // Listen for SSH data
        const unsubData = window.electronAPI.ssh.onData(connection.id, (data: string) => {
          try {
            term.write(data);
          } catch (_) {
            // ignore write errors on disposed terminal
          }
        });

        // Listen for SSH close
        const unsubClose = window.electronAPI.ssh.onClose(connection.id, () => {
          updateStatus('disconnected');
          try {
            term.write('\r\n\x1b[33mConnection closed.\x1b[0m\r\n');
          } catch (_) {
            // ignore
          }
        });

        // Resize handling
        const resizeObserver = new ResizeObserver(() => {
          try {
            fitAddon.fit();
            window.electronAPI.ssh.resize(connection.id, term.cols, term.rows);
          } catch (_) {
            // ignore
          }
        });
        resizeObserver.observe(container);

        cleanup = () => {
          unsubData();
          unsubClose();
          resizeObserver.disconnect();
          window.electronAPI.ssh.disconnect(connection.id);
          term.dispose();
          xtermRef.current = null;
          fitAddonRef.current = null;
        };
      } catch (err: any) {
        if (!disposed) {
          updateStatus('error');
          setErrorMsg(err.message || 'Failed to connect');
          term.write(`\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
        }
      }
    };

    initTerminal();

    return () => {
      disposed = true;
      if (cleanup) {
        cleanup();
      } else {
        window.electronAPI.ssh.disconnect(connection.id);
        xtermRef.current?.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      }
    };
  }, [connection.id, connection.host, connection.port, connection.username, connection.password, connection.privateKey]);

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = getTerminalTheme(theme, terminalOpacity);
    }
  }, [theme, terminalOpacity]);

  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = terminalFontSize;
      xtermRef.current.options.cursorBlink = terminalCursorBlink;
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
        } catch (_) {
          // ignore fit errors while xterm is settling
        }
      });
    }
  }, [terminalFontSize, terminalCursorBlink]);

  useEffect(() => {
    if (active && fitAddonRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
        } catch (_) {
          // ignore fit errors while xterm is settling
        }
      });
    }
  }, [active]);

  return (
    <div className={`terminal-session ${active ? '' : 'hidden'}`}>
      {status === 'error' && (
        <div className="terminal-error">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" stroke="var(--danger)" strokeWidth="1.5" />
            <path d="M16 10v8M16 22h0" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <h3>Connection Failed</h3>
          <p>{errorMsg}</p>
        </div>
      )}
      <div ref={terminalRef} className="terminal-element" />
    </div>
  );
}
