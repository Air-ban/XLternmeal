import React, { useState, useEffect, useCallback } from 'react';

interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

interface CommitDetail {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  email: string;
}

interface GitHistoryProps {
  projectPath: string;
  currentBranch: string | null;
}

export function GitHistory({ projectPath, currentBranch }: GitHistoryProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [commitDetail, setCommitDetail] = useState<CommitDetail | null>(null);
  const [diff, setDiff] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const loadLog = useCallback(async () => {
    setLoading(true);
    setSelectedCommit(null);
    setCommitDetail(null);
    setDiff(null);
    const result = await window.electronAPI.git.log(projectPath, 50);
    if (result.success && result.commits) {
      setCommits(result.commits);
    }
    setLoading(false);
  }, [projectPath, currentBranch]);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  const handleSelectCommit = async (hash: string) => {
    if (selectedCommit === hash) {
      setSelectedCommit(null);
      setCommitDetail(null);
      setDiff(null);
      return;
    }
    setSelectedCommit(hash);
    setLoadingDiff(true);
    const result = await window.electronAPI.git.show(projectPath, hash);
    if (result.success) {
      setCommitDetail(result.commit || null);
      setDiff(result.diff || null);
    }
    setLoadingDiff(false);
  };

  return (
    <div className="git-history">
      <style>{`
        .git-history {
          height: 100%;
          display: flex;
          background: var(--bg-primary);
        }

        .git-history-list {
          width: 280px;
          min-width: 200px;
          overflow-y: auto;
          border-right: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }

        .git-commit-item {
          padding: 8px 14px;
          cursor: pointer;
          border-bottom: 1px solid var(--border-color);
          transition: background 0.05s;
        }

        .git-commit-item:hover {
          background: rgba(128, 128, 128, 0.08);
        }

        .git-commit-item.active {
          background: rgba(9, 105, 218, 0.1);
          border-left: 3px solid var(--accent);
          padding-left: 11px;
        }

        .git-commit-message {
          font-size: 13px;
          font-weight: 400;
          color: var(--text-primary);
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .git-commit-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 11px;
          color: var(--text-muted);
        }

        .git-commit-hash {
          font-family: 'Cascadia Code', 'Consolas', monospace;
          font-size: 10px;
          color: var(--accent);
          background: var(--accent-subtle);
          padding: 1px 5px;
          border-radius: 3px;
        }

        .git-detail-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .git-detail-header {
          padding: 14px 20px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }

        .git-detail-msg {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 6px;
          line-height: 1.4;
        }

        .git-detail-info {
          font-size: 12px;
          color: var(--text-muted);
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }

        .git-detail-info span {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .git-diff-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        }

        .git-diff-content {
          font-family: 'Cascadia Code', 'Consolas', 'Courier New', monospace;
          font-size: 12px;
          line-height: 1.45;
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-all;
        }

        .git-diff-line {
          display: flex;
          padding: 0 20px;
          min-height: 20px;
        }

        .git-diff-line.add {
          background: rgba(63, 185, 80, 0.08);
        }

        .git-diff-line.del {
          background: rgba(248, 81, 73, 0.08);
        }

        .git-diff-line.hunk {
          background: rgba(9, 105, 218, 0.06);
        }

        .git-diff-plus {
          color: var(--success);
          font-weight: 600;
        }

        .git-diff-minus {
          color: var(--danger);
          font-weight: 600;
        }

        .git-diff-hunk {
          color: var(--accent);
        }

        .git-history-empty,
        .git-history-loading {
          padding: 40px 16px;
          text-align: center;
          color: var(--text-muted);
          font-size: 13px;
        }
      `}</style>

      <div className="git-history-list">
        {loading && commits.length === 0 ? (
          <div className="git-history-loading">Loading...</div>
        ) : commits.length === 0 ? (
          <div className="git-history-empty">No commits yet</div>
        ) : (
          commits.map((commit) => (
            <div
              key={commit.hash}
              className={`git-commit-item ${selectedCommit === commit.hash ? 'active' : ''}`}
              onClick={() => handleSelectCommit(commit.hash)}
            >
              <div className="git-commit-message">{commit.message}</div>
              <div className="git-commit-meta">
                <span className="git-commit-hash">{commit.shortHash}</span>
                <span>{commit.author}</span>
                <span>{commit.date}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="git-detail-panel">
        {selectedCommit ? (
          loadingDiff ? (
            <div className="git-history-loading" style={{ flex: 1 }}>Loading diff...</div>
          ) : (
            <>
              <div className="git-detail-header">
                <div className="git-detail-msg">{commitDetail?.message || 'Commit details'}</div>
                <div className="git-detail-info">
                  <span title="Hash">{commitDetail?.shortHash || selectedCommit.substring(0, 7)}</span>
                  <span title="Author">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <circle cx="5.5" cy="4" r="2.3" stroke="currentColor" strokeWidth="0.9" />
                      <path d="M2 10c0-2 1.5-3.5 3.5-3.5S9 8 9 10" stroke="currentColor" strokeWidth="0.9" />
                    </svg>
                    {commitDetail?.author}
                  </span>
                  <span title="Date">{commitDetail?.date}</span>
                </div>
              </div>
              <div className="git-diff-scroll">
                <pre className="git-diff-content">
                  {diff ? (
                    <DiffViewer diff={diff} />
                  ) : (
                    <span style={{ color: 'var(--text-muted)', padding: '0 20px' }}>No changes</span>
                  )}
                </pre>
              </div>
            </>
          )
        ) : (
          <div className="git-history-empty" style={{ flex: 1 }}>
            <p>Select a commit to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const isAdd = line.startsWith('+') && !line.startsWith('+++');
        const isDel = line.startsWith('-') && !line.startsWith('---');
        const isHunk = line.startsWith('@@');
        const cls = isAdd ? 'add' : isDel ? 'del' : isHunk ? 'hunk' : '';
        return (
          <span key={i} className={cls ? `git-diff-${cls}` : ''}>
            {line}
            {'\n'}
          </span>
        );
      })}
    </>
  );
}
