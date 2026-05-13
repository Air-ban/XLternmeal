import React, { useEffect, useMemo, useState } from 'react';

interface SFTPPanelProps {
  sessionId: string;
}

interface SFTPFile {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  modifyTime: number;
  permissions: number;
}

function joinRemotePath(basePath: string, name: string): string {
  if (basePath === '/') {
    return `/${name}`;
  }
  return `${basePath.replace(/\/+$/, '')}/${name}`;
}

function parentRemotePath(remotePath: string): string {
  if (remotePath === '/') {
    return '/';
  }

  const parts = remotePath.replace(/\/+$/, '').split('/');
  parts.pop();
  return parts.length <= 1 ? '/' : parts.join('/');
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(seconds: number): string {
  if (!seconds) return '-';
  return new Date(seconds * 1000).toLocaleString();
}

export function SFTPPanel({ sessionId }: SFTPPanelProps): React.ReactElement {
  const [remotePath, setRemotePath] = useState('/');
  const [files, setFiles] = useState<SFTPFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      if (a.type === 'directory' && b.type !== 'directory') return -1;
      if (a.type !== 'directory' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
  }, [files]);

  const loadFiles = async (pathToLoad = remotePath) => {
    setLoading(true);
    setError('');

    const result = await window.electronAPI.sftp.list(sessionId, pathToLoad);
    if (result.success) {
      setFiles(result.files || []);
      setRemotePath(pathToLoad);
    } else {
      setError(result.error || 'Failed to load remote directory');
    }

    setLoading(false);
  };

  useEffect(() => {
    setRemotePath('/');
    loadFiles('/');
  }, [sessionId]);

  const handleOpen = (file: SFTPFile) => {
    if (file.type === 'directory') {
      loadFiles(joinRemotePath(remotePath, file.name));
    }
  };

  const handleMkdir = async () => {
    const name = window.prompt('Directory name');
    if (!name?.trim()) return;

    const result = await window.electronAPI.sftp.mkdir(sessionId, joinRemotePath(remotePath, name.trim()));
    if (result.success) {
      loadFiles();
    } else {
      setError(result.error || 'Failed to create directory');
    }
  };

  const handleUpload = async () => {
    setError('');
    const result = await window.electronAPI.sftp.upload(sessionId, remotePath);
    if (result.success) {
      if (!result.canceled) {
        loadFiles();
      }
    } else {
      setError(result.error || 'Upload failed');
    }
  };

  const handleDownload = async (file: SFTPFile) => {
    if (file.type !== 'file') return;

    setError('');
    const result = await window.electronAPI.sftp.download(
      sessionId,
      joinRemotePath(remotePath, file.name),
      file.name
    );
    if (!result.success) {
      setError(result.error || 'Download failed');
    }
  };

  const handleDelete = async (file: SFTPFile) => {
    if (file.type !== 'file' && file.type !== 'directory') return;
    const ok = window.confirm(`Delete ${file.name}?`);
    if (!ok) return;

    const result = await window.electronAPI.sftp.delete(
      sessionId,
      joinRemotePath(remotePath, file.name),
      file.type
    );

    if (result.success) {
      loadFiles();
    } else {
      setError(result.error || 'Delete failed');
    }
  };

  return (
    <div className="sftp-panel">
      <div className="sftp-toolbar acrylic">
        <button className="tool-btn" onClick={() => loadFiles(parentRemotePath(remotePath))} disabled={remotePath === '/'}>
          Up
        </button>
        <button className="tool-btn" onClick={() => loadFiles()}>
          Refresh
        </button>
        <button className="tool-btn" onClick={handleUpload}>
          Upload
        </button>
        <button className="tool-btn" onClick={handleMkdir}>
          New Folder
        </button>
        <div className="path-box">{remotePath}</div>
      </div>

      {error && <div className="sftp-error">{error}</div>}

      <div className="file-table">
        <div className="file-row file-header">
          <span>Name</span>
          <span>Size</span>
          <span>Modified</span>
          <span></span>
        </div>

        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : sortedFiles.length === 0 ? (
          <div className="empty-state">No files</div>
        ) : (
          sortedFiles.map((file) => (
            <div className="file-row" key={`${file.type}:${file.name}`} onDoubleClick={() => handleOpen(file)}>
              <span className="file-name">
                <span className={`file-icon ${file.type}`}>{file.type === 'directory' ? 'DIR' : 'FILE'}</span>
                {file.name}
              </span>
              <span>{file.type === 'directory' ? '-' : formatSize(file.size)}</span>
              <span>{formatDate(file.modifyTime)}</span>
              <span className="file-actions">
                {file.type === 'directory' && (
                  <button className="link-btn" onClick={() => handleOpen(file)}>Open</button>
                )}
                {file.type === 'file' && (
                  <button className="link-btn" onClick={() => handleDownload(file)}>Download</button>
                )}
                {(file.type === 'file' || file.type === 'directory') && (
                  <button className="link-btn danger" onClick={() => handleDelete(file)}>Delete</button>
                )}
              </span>
            </div>
          ))
        )}
      </div>

      <style>{`
        .sftp-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--solid-surface);
          color: var(--text-primary);
        }

        .sftp-toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-color);
          border-left: none;
          border-right: none;
          border-top: none;
          box-shadow: none;
        }

        .tool-btn {
          padding: 7px 10px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--solid-surface-2);
          color: var(--text-primary);
          cursor: pointer;
          font-size: 12px;
        }

        .tool-btn:hover:not(:disabled) {
          border-color: var(--accent);
        }

        .tool-btn:disabled {
          opacity: 0.45;
          cursor: default;
        }

        .path-box {
          flex: 1;
          min-width: 0;
          padding: 7px 10px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--solid-surface-2);
          color: var(--text-secondary);
          font-family: Consolas, monospace;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .sftp-error {
          margin: 10px 12px 0;
          padding: 9px 10px;
          border: 1px solid rgba(248, 81, 73, 0.3);
          border-radius: var(--radius-sm);
          background: var(--danger-subtle);
          color: var(--danger);
          font-size: 12px;
        }

        .file-table {
          flex: 1;
          overflow: auto;
          padding: 8px 12px 12px;
        }

        .file-row {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 100px 190px 190px;
          align-items: center;
          gap: 12px;
          min-height: 34px;
          padding: 0 10px;
          border-radius: var(--radius-sm);
          font-size: 12px;
          color: var(--text-secondary);
        }

        .file-row:not(.file-header):hover {
          background: var(--solid-surface-2);
        }

        .file-header {
          color: var(--text-muted);
          font-weight: 600;
          border-bottom: 1px solid var(--border-color);
          border-radius: 0;
          margin-bottom: 6px;
        }

        .file-name {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .file-icon {
          width: 34px;
          flex: 0 0 34px;
          font-size: 10px;
          color: var(--text-muted);
        }

        .file-icon.directory {
          color: var(--accent);
        }

        .file-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .link-btn {
          border: none;
          background: transparent;
          color: var(--accent);
          cursor: pointer;
          font-size: 12px;
        }

        .link-btn.danger {
          color: var(--danger);
        }

        .empty-state {
          padding: 32px;
          text-align: center;
          color: var(--text-muted);
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}
