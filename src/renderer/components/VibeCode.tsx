import React, { useState, useCallback } from 'react';
import { FileExplorer } from './FileExplorer';
import { GitPanel } from './GitPanel';

interface VibeCodeProps {
  activeProjectPath: string | null;
  onOpenProject: () => void;
}

interface OpenFile {
  path: string;
  name: string;
  content: string;
}

export function VibeCode({ activeProjectPath, onOpenProject }: VibeCodeProps): React.ReactElement {
  const [activeView, setActiveView] = useState<'explorer' | 'search' | 'git'>('explorer');
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const handleOpenFile = useCallback((filePath: string, content: string, name: string) => {
    const existing = openFiles.find(f => f.path === filePath);
    if (existing) {
      setActiveFilePath(filePath);
      return;
    }
    setOpenFiles(prev => [...prev, { path: filePath, name, content }]);
    setActiveFilePath(filePath);
  }, [openFiles]);

  const handleSelectFile = useCallback(async (filePath: string) => {
    const existing = openFiles.find(f => f.path === filePath);
    if (existing) {
      setActiveFilePath(filePath);
      return;
    }

    try {
      const result = await window.electronAPI.project.readFile(filePath);
      if (result.success && result.content !== undefined) {
        const name = filePath.split(/[\/]/).pop() || filePath;
        handleOpenFile(filePath, result.content, name);
      }
    } catch (err) {
      console.error('Failed to read file:', err);
    }
  }, [openFiles, handleOpenFile]);

  const handleCloseFile = useCallback((filePath: string) => {
    setOpenFiles(prev => {
      const filtered = prev.filter(f => f.path !== filePath);
      return filtered;
    });
    if (activeFilePath === filePath) {
      const remaining = openFiles.filter(f => f.path !== filePath);
      const lastFile = remaining[remaining.length - 1];
      setActiveFilePath(lastFile ? lastFile.path : null);
    }
  }, [activeFilePath, openFiles]);

  const activeFile = openFiles.find(f => f.path === activeFilePath);
  const projectName = activeProjectPath ? activeProjectPath.split(/[\\/]/).pop() || activeProjectPath : 'No Folder Opened';

  return (
    <div className="vscode-layout">
      <style>{`
        .vscode-layout {
          flex: 1;
          display: flex;
          flex-direction: row;
          height: 100%;
          min-width: 0;
          overflow: hidden;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .vscode-activity-bar {
          width: 48px;
          min-width: 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 8px 0;
          gap: 4px;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          user-select: none;
        }

        .vscode-activity-item {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--transition);
          position: relative;
        }

        .vscode-activity-item:hover {
          color: var(--text-primary);
          background: var(--bg-tertiary);
        }

        .vscode-activity-item.active {
          color: var(--text-primary);
        }

        .vscode-activity-item.active::before {
          content: '';
          position: absolute;
          left: -8px;
          top: 50%;
          transform: translateY(-50%);
          width: 2px;
          height: 20px;
          background: var(--text-primary);
          border-radius: 0 2px 2px 0;
        }

        .vscode-sidebar {
          width: 260px;
          min-width: 200px;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
          border-right: 1px solid var(--border-color);
          user-select: none;
          overflow: hidden;
        }

        .vscode-sidebar-header {
          padding: 10px 16px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.4px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-color);
        }

        .vscode-sidebar-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 24px;
          color: var(--text-muted);
          font-size: 13px;
        }

        .vscode-editor-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          overflow: hidden;
        }

        .vscode-tabs {
          display: flex;
          flex-direction: row;
          height: 36px;
          min-height: 36px;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-color);
          overflow-x: auto;
          overflow-y: hidden;
        }

        .vscode-tabs::-webkit-scrollbar { height: 2px; }
        .vscode-tabs::-webkit-scrollbar-thumb { background: transparent; }
        .vscode-tabs:hover::-webkit-scrollbar-thumb { background: var(--border-color); }

        .vscode-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 12px;
          min-width: 120px;
          max-width: 220px;
          font-size: 12px;
          color: var(--text-muted);
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          cursor: pointer;
          white-space: nowrap;
          transition: background var(--transition);
          position: relative;
        }

        .vscode-tab:hover {
          background: var(--bg-tertiary);
        }

        .vscode-tab.active {
          color: var(--text-primary);
          background: var(--bg-primary);
          border-top: 1px solid var(--accent);
        }

        .vscode-tab-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .vscode-tab-close {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 3px;
          opacity: 0;
          transition: opacity var(--transition);
          color: var(--text-muted);
        }

        .vscode-tab:hover .vscode-tab-close {
          opacity: 1;
        }

        .vscode-tab-close:hover {
          background: var(--danger-subtle);
          color: var(--danger);
        }

        .vscode-editor-content {
          flex: 1;
          overflow: auto;
          background: var(--bg-primary);
          padding: 16px 24px;
          font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
          font-size: 13px;
          line-height: 1.6;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: var(--text-primary);
        }

        .vscode-welcome {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          color: var(--text-muted);
          font-size: 14px;
        }

        .vscode-welcome h2 {
          font-size: 24px;
          font-weight: 300;
          color: var(--text-primary);
        }

        .vscode-welcome-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }

        .vscode-welcome-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: var(--radius-sm);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          cursor: pointer;
          transition: background var(--transition);
          border: 1px solid var(--border-color);
        }

        .vscode-welcome-btn:hover {
          background: var(--bg-tertiary);
        }

        .vscode-status-bar {
          height: 22px;
          min-height: 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 12px;
          background: var(--accent);
          color: var(--btn-text);
          font-size: 12px;
          user-select: none;
        }

        .vscode-status-left, .vscode-status-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .vscode-status-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }
      `}</style>

      {/* Activity Bar */}
      <div className="vscode-activity-bar">
        <div
          className={`vscode-activity-item ${activeView === 'explorer' ? 'active' : ''}`}
          onClick={() => { setActiveView('explorer'); setSidebarVisible(true); }}
          title="Explorer"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
        </div>
        <div
          className={`vscode-activity-item ${activeView === 'search' ? 'active' : ''}`}
          onClick={() => { setActiveView('search'); setSidebarVisible(true); }}
          title="Search"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        <div
          className={`vscode-activity-item ${activeView === 'git' ? 'active' : ''}`}
          onClick={() => { setActiveView('git'); setSidebarVisible(true); }}
          title="Source Control"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="6" r="3" />
            <path d="M6 9v3a3 3 0 003 3h6a3 3 0 003-3V9" />
            <path d="M12 15V9" />
          </svg>
        </div>
        <div style={{ flex: 1 }} />
        <div
          className="vscode-activity-item"
          onClick={onOpenProject}
          title="Open Folder"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
          </svg>
        </div>
        <div
          className="vscode-activity-item"
          onClick={() => setSidebarVisible(prev => !prev)}
          title={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </div>
      </div>

      {/* Sidebar */}
      {sidebarVisible && (
        <div className="vscode-sidebar">
          {activeView === 'explorer' && (
            <>
              {activeProjectPath ? (
                <FileExplorer rootPath={activeProjectPath} onSelectFile={handleSelectFile} title={projectName} onOpenFolder={onOpenProject} />
              ) : (
                <div className="vscode-sidebar-empty">
                  <p>You have not yet opened a folder.</p>
                  <button className="vscode-welcome-btn" onClick={onOpenProject}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                    </svg>
                    Open Folder
                  </button>
                </div>
              )}
            </>
          )}
          {activeView === 'search' && (
            <div className="vscode-sidebar-empty">
              <p>Search functionality coming soon.</p>
            </div>
          )}
          {activeView === 'git' && (
            <GitPanel projectPath={activeProjectPath} onOpenFile={handleOpenFile} />
          )}
        </div>
      )}

      {/* Editor Area */}
      <div className="vscode-editor-area">
        {openFiles.length > 0 ? (
          <>
            <div className="vscode-tabs">
              {openFiles.map(file => (
                <div
                  key={file.path}
                  className={`vscode-tab ${activeFilePath === file.path ? 'active' : ''}`}
                  onClick={() => setActiveFilePath(file.path)}
                >
                  <span className="vscode-tab-name">{file.name}</span>
                  <span
                    className="vscode-tab-close"
                    onClick={(e) => { e.stopPropagation(); handleCloseFile(file.path); }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </span>
                </div>
              ))}
            </div>
            <div className="vscode-editor-content">
              {activeFile ? activeFile.content : 'Select a file to view its contents.'}
            </div>
          </>
        ) : (
          <div className="vscode-welcome">
            <h2>Vibe Code</h2>
            <p>{activeProjectPath ? 'Select a file from the explorer to start editing.' : 'Open a folder to get started.'}</p>
            {!activeProjectPath && (
              <div className="vscode-welcome-actions">
                <button className="vscode-welcome-btn" onClick={onOpenProject}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                  </svg>
                  Open Folder
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="vscode-status-bar">
        <div className="vscode-status-left">
          <span className="vscode-status-item" onClick={onOpenProject} style={{ cursor: 'pointer' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            {projectName}
          </span>
        </div>
        <div className="vscode-status-right">
          <span className="vscode-status-item">
            {activeFile ? activeFile.name : 'Ready'}
          </span>
        </div>
      </div>
    </div>
  );
}
