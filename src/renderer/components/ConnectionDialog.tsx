import React, { useState } from 'react';

interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

interface ConnectionDialogProps {
  connection: Connection | null;
  onConnect: (conn: Connection) => void;
  onClose: () => void;
}

export function ConnectionDialog({
  connection,
  onConnect,
  onClose,
}: ConnectionDialogProps): React.ReactElement {
  const [name, setName] = useState(connection?.name || '');
  const [host, setHost] = useState(connection?.host || '');
  const [port, setPort] = useState(String(connection?.port ?? 22));
  const [username, setUsername] = useState(connection?.username || '');
  const [password, setPassword] = useState(connection?.password || '');
  const [privateKey, setPrivateKey] = useState(connection?.privateKey || '');
  const [authMethod, setAuthMethod] = useState<'password' | 'key'>(
    connection?.privateKey ? 'key' : 'password'
  );
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!host.trim()) {
      setError('Host is required');
      return;
    }
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    const parsedPort = Number(port);
    if (!port.trim() || !Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
      setError('Port must be an integer between 0 and 65535');
      return;
    }
    if (authMethod === 'password' && !password) {
      setError('Password is required');
      return;
    }
    if (authMethod === 'key' && !privateKey.trim()) {
      setError('Private key is required');
      return;
    }

    onConnect({
      id: connection?.id || `conn-${Date.now()}`,
      name: name.trim() || `${username}@${host}`,
      host: host.trim(),
      port: parsedPort,
      username: username.trim(),
      password: authMethod === 'password' ? password : undefined,
      privateKey: authMethod === 'key' ? privateKey : undefined,
    });
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>{connection ? 'Edit Connection' : 'New Connection'}</h2>
          <button className="dialog-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Connection Name</label>
            <input
              type="text"
              placeholder="My Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-row">
            <div className="form-group flex-2">
              <label>Host</label>
              <input
                type="text"
                placeholder="192.168.1.1"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
            </div>
            <div className="form-group flex-1">
              <label>Port</label>
              <input
                type="number"
                min="0"
                max="65535"
                step="1"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              placeholder="root"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Authentication</label>
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab ${authMethod === 'password' ? 'active' : ''}`}
                onClick={() => setAuthMethod('password')}
              >
                Password
              </button>
              <button
                type="button"
                className={`auth-tab ${authMethod === 'key' ? 'active' : ''}`}
                onClick={() => setAuthMethod('key')}
              >
                Private Key
              </button>
            </div>
          </div>

          {authMethod === 'password' ? (
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          ) : (
            <div className="form-group">
              <label>Private Key</label>
              <textarea
                placeholder="Paste your private key here..."
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                rows={5}
              />
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          <div className="dialog-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-accent">
              {connection ? 'Save & Connect' : 'Connect'}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .dialog-overlay {
          position: fixed;
          inset: 0;
          background: var(--overlay-bg);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          animation: fadeIn 0.15s ease;
          -webkit-app-region: no-drag;
        }

        .dialog {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          width: 480px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: var(--shadow);
          animation: scaleIn 0.2s ease;
        }

        .dialog-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border-color);
        }

        .dialog-header h2 {
          font-size: 17px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .dialog-close {
          width: 32px;
          height: 32px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all var(--transition);
        }

        .dialog-close:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .dialog form {
          padding: 24px;
        }

        .form-group {
          margin-bottom: 18px;
        }

        .form-group label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 10px 12px;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 14px;
          transition: border-color var(--transition);
        }

        .form-group input:focus,
        .form-group textarea:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-subtle);
        }

        .form-group textarea {
          resize: vertical;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 12px;
        }

        .form-row {
          display: flex;
          gap: 12px;
        }

        .flex-1 { flex: 1; }
        .flex-2 { flex: 2; }

        .auth-tabs {
          display: flex;
          background: var(--bg-primary);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-color);
          overflow: hidden;
        }

        .auth-tab {
          flex: 1;
          padding: 8px 16px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--transition);
        }

        .auth-tab.active {
          background: var(--accent-subtle);
          color: var(--accent);
        }

        .auth-tab:hover:not(.active) {
          color: var(--text-primary);
        }

        .form-error {
          background: rgba(248, 81, 73, 0.1);
          border: 1px solid rgba(248, 81, 73, 0.3);
          color: var(--danger);
          padding: 10px 14px;
          border-radius: var(--radius-sm);
          font-size: 13px;
          margin-bottom: 18px;
        }

        .dialog-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-top: 16px;
          border-top: 1px solid var(--border-color);
        }

        .btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 20px;
          border: none;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--transition);
        }

        .btn-accent {
          background: var(--accent);
          color: var(--btn-text);
        }

        .btn-accent:hover {
          background: var(--accent-hover);
        }

        .btn-ghost {
          background: transparent;
          color: var(--text-secondary);
        }

        .btn-ghost:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
