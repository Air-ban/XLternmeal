import React, { useState, useEffect, useCallback } from 'react';

interface GitStatusEntry {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
}

interface GitPanelProps {
  projectPath: string | null;
  onOpenFile: (filePath: string, content: string, name: string) => void;
}

export function GitPanel({ projectPath, onOpenFile }: GitPanelProps) {
  const [entries, setEntries] = useState<GitStatusEntry[]>([]);
  const [branch, setBranch] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitVersion, setGitVersion] = useState<string | null>(null);
  const [expandedChanges, setExpandedChanges] = useState(true);
  const [expandedStaged, setExpandedStaged] = useState(true);

  const loadStatus = useCallback(async () => {
    if (!projectPath) return;
    setLoading(true);
    setError(null);
    try {
      const [statusResult, branchResult] = await Promise.all([
        window.electronAPI.git.status(projectPath),
        window.electronAPI.git.branch(projectPath),
      ]);

      if (!statusResult.success) {
        const msg = statusResult.error || 'Unknown error';
        if (msg.toLowerCase().includes('not a git repository')) {
          setError(`Not a Git repository: ${projectPath}`);
        } else {
          setError(`Git error: ${msg}`);
        }
        setEntries([]);
        setBranch(null);
        setLoading(false);
        return;
      }

      setEntries(statusResult.entries || []);
      if (branchResult.success) {
        setBranch(branchResult.branch || null);
      } else {
        setBranch(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load Git status.');
      setEntries([]);
      setBranch(null);
    }
    setLoading(false);
  }, [projectPath]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    window.electronAPI.git.version().then(result => {
      if (result.success) {
        setGitVersion(result.version || null);
      }
    }).catch(() => {
      // ignore
    });
  }, []);

  const handleShowDiff = async (entry: GitStatusEntry) => {
    if (!projectPath) return;
    const isStaged = entry.indexStatus !== ' ' && entry.indexStatus !== '?';
    const result = await window.electronAPI.git.diff(projectPath, entry.path, isStaged);
    if (result.success && result.diff !== undefined) {
      const fileName = entry.path.split(/[\\/]/).pop() || entry.path;
      onOpenFile(entry.path, result.diff || '(no changes)', fileName);
    }
  };

  const staged = entries.filter(e => e.indexStatus !== ' ' && e.indexStatus !== '?');
  const unstaged = entries.filter(e => e.worktreeStatus !== ' ' || e.indexStatus === '?');

  const getStatusLabel = (entry: GitStatusEntry) => {
    if (entry.indexStatus === 'A' || entry.worktreeStatus === 'A') return 'A';
    if (entry.indexStatus === 'D' || entry.worktreeStatus === 'D') return 'D';
    if (entry.indexStatus === 'M' || entry.worktreeStatus === 'M') return 'M';
    if (entry.indexStatus === 'R' || entry.worktreeStatus === 'R') return 'R';
    if (entry.indexStatus === '?' || entry.worktreeStatus === '?') return 'U';
    return entry.worktreeStatus.trim() || entry.indexStatus.trim();
  };

  const getStatusColor = (label: string) => {
    switch (label) {
      case 'A': return '#3fb950';
      case 'D': return '#f85149';
      case 'M': return '#d29922';
      case 'U': return '#8b949e';
      case 'R': return '#a371f7';
      default: return '#8b949e';
    }
  };

  if (!projectPath) {
    return (
      <div className="git-panel-empty">
        <style>{`
          .git-panel-empty {
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
        `}</style>
        <p>Open a folder to view source control.</p>
      </div>
    );
  }

  return (
    <div className="git-panel">
      <style>{`
        .git-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          user-select: none;
        }

        .git-panel-header {
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

        .git-path {
          padding: 4px 16px;
          font-size: 11px;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border-color);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .git-branch {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--text-primary);
          font-weight: 500;
          cursor: pointer;
          padding: 6px 16px;
          border-bottom: 1px solid var(--border-color);
          transition: background var(--transition);
        }

        .git-branch:hover {
          background: var(--bg-tertiary);
        }

        .git-actions {
          display: flex;
          gap: 4px;
          padding: 8px 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .git-action-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          background: var(--accent);
          color: var(--btn-text);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: background var(--transition);
          border: none;
        }

        .git-action-btn:hover {
          background: var(--accent-hover);
        }

        .git-section {
          border-bottom: 1px solid var(--border-color);
        }

        .git-section-header {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          transition: background var(--transition);
        }

        .git-section-header:hover {
          background: var(--bg-tertiary);
        }

        .git-section-chevron {
          width: 14px;
          height: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.15s;
          flex-shrink: 0;
        }

        .git-section-chevron.expanded {
          transform: rotate(90deg);
        }

        .git-section-count {
          margin-left: auto;
          font-size: 11px;
          font-weight: 500;
          color: var(--text-muted);
          background: var(--bg-tertiary);
          padding: 1px 6px;
          border-radius: 10px;
        }

        .git-file-list {
          overflow: hidden;
        }

        .git-file-item {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 3px 12px 3px 28px;
          font-size: 12px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: background var(--transition);
          white-space: nowrap;
          overflow: hidden;
        }

        .git-file-item:hover {
          background: var(--bg-tertiary);
        }

        .git-file-status {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          font-size: 10px;
          font-weight: 700;
          font-family: 'Consolas', monospace;
        }

        .git-file-icon {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          opacity: 0.7;
        }

        .git-file-name {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .git-panel-empty-inner {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 24px;
          color: var(--text-muted);
          font-size: 13px;
        }

        .git-panel-error {
          padding: 12px 16px;
          margin: 8px 16px;
          border-radius: var(--radius-sm);
          background: var(--danger-subtle);
          color: var(--danger);
          font-size: 12px;
          line-height: 1.5;
          word-break: break-word;
        }

        .git-panel-error-title {
          font-weight: 600;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .git-loading {
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

        @keyframes gitSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .git-spinner {
          animation: gitSpin 1s linear infinite;
        }

        .git-version {
          padding: 4px 16px;
          font-size: 10px;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border-color);
        }
      `}</style>

      <div className="git-panel-header">SOURCE CONTROL</div>

      <div className="git-path" title={projectPath}>{projectPath}</div>

      {gitVersion && <div className="git-version">{gitVersion}</div>}

      <div className="git-branch">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
        {branch || 'unknown'}
      </div>

      <div className="git-actions">
        <button className="git-action-btn" onClick={loadStatus}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh
        </button>
      </div>

      {loading && (
        <div className="git-loading">
          <svg className="git-spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
          </svg>
          <span>Loading Git status...</span>
        </div>
      )}

      {!loading && error && (
        <div className="git-panel-error">
          <div className="git-panel-error-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Git Error
          </div>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="git-file-list">
          {/* Staged Changes */}
          {staged.length > 0 && (
            <div className="git-section">
              <div
                className="git-section-header"
                onClick={() => setExpandedStaged(prev => !prev)}
              >
                <span className={`git-section-chevron ${expandedStaged ? 'expanded' : ''}`}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M3.5 2l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>Staged Changes</span>
                <span className="git-section-count">{staged.length}</span>
              </div>
              {expandedStaged && staged.map(entry => {
                const label = getStatusLabel(entry);
                const color = getStatusColor(label);
                const name = entry.path.split(/[\\/]/).pop() || entry.path;
                return (
                  <div key={entry.path} className="git-file-item" onClick={() => handleShowDiff(entry)}>
                    <span className="git-file-status" style={{ color }}>{label}</span>
                    <span className="git-file-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 2h8v10H3V2z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 5h4M5 8h3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="git-file-name" title={entry.path}>{name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Changes */}
          {unstaged.length > 0 && (
            <div className="git-section">
              <div
                className="git-section-header"
                onClick={() => setExpandedChanges(prev => !prev)}
              >
                <span className={`git-section-chevron ${expandedChanges ? 'expanded' : ''}`}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M3.5 2l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span>Changes</span>
                <span className="git-section-count">{unstaged.length}</span>
              </div>
              {expandedChanges && unstaged.map(entry => {
                const label = getStatusLabel(entry);
                const color = getStatusColor(label);
                const name = entry.path.split(/[\\/]/).pop() || entry.path;
                return (
                  <div key={entry.path} className="git-file-item" onClick={() => handleShowDiff(entry)}>
                    <span className="git-file-status" style={{ color }}>{label}</span>
                    <span className="git-file-icon">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 2h8v10H3V2z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M5 5h4M5 8h3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
                      </svg>
                    </span>
                    <span className="git-file-name" title={entry.path}>{name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {staged.length === 0 && unstaged.length === 0 && (
            <div className="git-panel-empty-inner">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <p>There are no changes to commit.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
