import React, { useState, useEffect, useCallback } from 'react';

interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

interface FileExplorerProps {
  rootPath: string;
  onSelectFile: (filePath: string) => void;
  title?: string;
  onOpenFolder?: () => void;
}

export function FileExplorer({ rootPath, onSelectFile, title, onOpenFolder }: FileExplorerProps) {
  return (
    <div className="file-explorer">
      <style>{`
        .file-explorer {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          user-select: none;
        }

        .file-explorer-header {
          padding: 10px 12px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.4px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--border-color);
        }

        .file-explorer-header-actions {
          display: flex;
          align-items: center;
          gap: 2px;
        }

        .file-explorer-header-btn {
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: var(--radius-sm);
          color: var(--text-muted);
          cursor: pointer;
          transition: all var(--transition);
          background: transparent;
          border: none;
        }

        .file-explorer-header-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .file-explorer-list {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 2px 0;
        }

        .file-tree-entry {
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 2px 0;
          padding-left: 4px;
          padding-right: 12px;
          font-size: 13px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: background var(--transition);
          white-space: nowrap;
          height: 22px;
        }

        .file-tree-entry:hover {
          background: var(--bg-tertiary);
        }

        .file-tree-entry.active {
          background: var(--accent-subtle);
          color: var(--accent);
        }

        .file-tree-chevron {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          opacity: 0.5;
          transition: transform 0.15s;
          cursor: pointer;
        }

        .file-tree-chevron.expanded {
          transform: rotate(90deg);
        }

        .file-tree-icon {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          opacity: 0.7;
        }

        .file-tree-name {
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      <div className="file-explorer-header">
        <span>{title || 'EXPLORER'}</span>
        <div className="file-explorer-header-actions">
          {onOpenFolder && (
            <button className="file-explorer-header-btn" onClick={onOpenFolder} title="Open Folder">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="file-explorer-list">
        <TreeFolder
          dirPath={rootPath}
          onSelectFile={onSelectFile}
          isRoot
        />
      </div>
    </div>
  );
}

function TreeFolder({ dirPath, onSelectFile, isRoot, depth = 0 }: { dirPath: string; onSelectFile: (p: string) => void; isRoot?: boolean; depth?: number }) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [expanded, setExpanded] = useState(isRoot);
  const [loading, setLoading] = useState(true);
  const [activePath, setActivePath] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI.project.listFiles(dirPath).then((result) => {
      if (result.success && result.files) {
        setFiles(result.files);
      }
      setLoading(false);
    });
  }, [dirPath]);

  const handleFileClick = (entry: FileEntry) => {
    if (entry.isDirectory) {
      setExpanded((prev) => !prev);
    } else {
      setActivePath(entry.path);
      onSelectFile(entry.path);
    }
  };

  if (!isRoot) {
    const name = dirPath.split(/[\\/]/).pop() || dirPath;
    return (
      <>
        <div
          className="file-tree-entry"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span className={`file-tree-chevron ${expanded ? 'expanded' : ''}`}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M3.5 2l4 3-4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="file-tree-icon">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4V2h3l1 1h5v1H2zm0 1v6h10V5H2z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="file-tree-name">{name}</span>
        </div>
        {expanded && (
          <TreeItems files={files} loading={loading} depth={depth + 1} onSelectFile={onSelectFile} activePath={activePath} onFileClick={handleFileClick} />
        )}
      </>
    );
  }

  return (
    <TreeItems files={files} loading={loading} depth={0} onSelectFile={onSelectFile} activePath={activePath} onFileClick={handleFileClick} />
  );
}

function TreeItems({ files, loading, depth, onSelectFile, activePath, onFileClick }: {
  files: FileEntry[];
  loading: boolean;
  depth: number;
  onSelectFile: (p: string) => void;
  activePath: string | null;
  onFileClick: (entry: FileEntry) => void;
}) {
  if (loading) {
    return <div className="file-tree-entry" style={{ paddingLeft: `${8 + depth * 14}px`, color: 'var(--text-muted)', cursor: 'default' }}>Loading...</div>;
  }

  return (
    <>
      {files.map((entry) => (
        <React.Fragment key={entry.path}>
          {entry.isDirectory ? (
            <TreeFolder dirPath={entry.path} onSelectFile={onSelectFile} depth={depth} />
          ) : (
            <div
              className={`file-tree-entry ${activePath === entry.path ? 'active' : ''}`}
              style={{ paddingLeft: `${8 + depth * 14}px` }}
              onClick={() => onFileClick(entry)}
            >
              <span className="file-tree-chevron" style={{ visibility: 'hidden' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M3.5 2l4 3-4 3" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </span>
              <span className="file-tree-icon">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 2h8v10H3V2z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 5h4M5 8h3" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
                </svg>
              </span>
              <span className="file-tree-name">{entry.name}</span>
            </div>
          )}
        </React.Fragment>
      ))}
    </>
  );
}
