import React, { useEffect, useState } from 'react';

interface PortForwardPanelProps {
  sessionId: string;
}

interface PortForward {
  id: string;
  sessionId: string;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

function parsePort(value: string): number | null {
  const port = Number(value);
  if (!value.trim() || !Number.isInteger(port) || port < 0 || port > 65535) {
    return null;
  }
  return port;
}

export function PortForwardPanel({ sessionId }: PortForwardPanelProps): React.ReactElement {
  const [forwards, setForwards] = useState<PortForward[]>([]);
  const [localHost, setLocalHost] = useState('127.0.0.1');
  const [localPort, setLocalPort] = useState('8080');
  const [remoteHost, setRemoteHost] = useState('127.0.0.1');
  const [remotePort, setRemotePort] = useState('80');
  const [error, setError] = useState('');

  const loadForwards = async () => {
    const result = await window.electronAPI.forward.list(sessionId);
    if (result.success) {
      setForwards(result.forwards || []);
    } else {
      setError(result.error || 'Failed to load forwards');
    }
  };

  useEffect(() => {
    loadForwards();
  }, [sessionId]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const parsedLocalPort = parsePort(localPort);
    const parsedRemotePort = parsePort(remotePort);
    if (parsedLocalPort === null || parsedRemotePort === null) {
      setError('Ports must be integers between 0 and 65535');
      return;
    }
    if (!remoteHost.trim()) {
      setError('Remote host is required');
      return;
    }

    const result = await window.electronAPI.forward.start({
      sessionId,
      localHost: localHost.trim() || '127.0.0.1',
      localPort: parsedLocalPort,
      remoteHost: remoteHost.trim(),
      remotePort: parsedRemotePort,
    });

    if (result.success) {
      loadForwards();
    } else {
      setError(result.error || 'Failed to start port forward');
    }
  };

  const handleStop = async (id: string) => {
    const result = await window.electronAPI.forward.stop(id);
    if (result.success) {
      loadForwards();
    } else {
      setError(result.error || 'Failed to stop port forward');
    }
  };

  return (
    <div className="forward-panel">
      <form className="forward-form acrylic" onSubmit={handleStart}>
        <div className="field">
          <label>Local Host</label>
          <input value={localHost} onChange={(e) => setLocalHost(e.target.value)} />
        </div>
        <div className="field small">
          <label>Local Port</label>
          <input value={localPort} onChange={(e) => setLocalPort(e.target.value)} inputMode="numeric" />
        </div>
        <div className="arrow">to</div>
        <div className="field">
          <label>Remote Host</label>
          <input value={remoteHost} onChange={(e) => setRemoteHost(e.target.value)} />
        </div>
        <div className="field small">
          <label>Remote Port</label>
          <input value={remotePort} onChange={(e) => setRemotePort(e.target.value)} inputMode="numeric" />
        </div>
        <button className="start-btn" type="submit">Start</button>
      </form>

      {error && <div className="forward-error">{error}</div>}

      <div className="forward-list">
        <div className="forward-row forward-header">
          <span>Local</span>
          <span>Remote</span>
          <span>Status</span>
          <span></span>
        </div>
        {forwards.length === 0 ? (
          <div className="empty-state">No active port forwards</div>
        ) : (
          forwards.map((forward) => (
            <div className="forward-row" key={forward.id}>
              <span>{forward.localHost}:{forward.localPort}</span>
              <span>{forward.remoteHost}:{forward.remotePort}</span>
              <span className="active-status">Active</span>
              <span className="actions">
                <button className="stop-btn" onClick={() => handleStop(forward.id)}>Stop</button>
              </span>
            </div>
          ))
        )}
      </div>

      <style>{`
        .forward-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--solid-surface);
          color: var(--text-primary);
          padding: 14px;
        }

        .forward-form {
          display: grid;
          grid-template-columns: minmax(150px, 1fr) 110px 32px minmax(150px, 1fr) 110px auto;
          gap: 10px;
          align-items: end;
          padding: 12px;
          border-radius: var(--radius);
          box-shadow: var(--shadow-sm);
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .field label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .field input {
          height: 34px;
          padding: 0 10px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--solid-surface);
          color: var(--text-primary);
        }

        .field input:focus {
          border-color: var(--accent);
        }

        .arrow {
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-muted);
          font-size: 12px;
        }

        .start-btn,
        .stop-btn {
          height: 34px;
          padding: 0 14px;
          border: none;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
        }

        .start-btn {
          background: var(--accent);
          color: var(--btn-text);
        }

        .stop-btn {
          background: var(--danger-subtle);
          color: var(--danger);
        }

        .forward-error {
          margin-top: 12px;
          padding: 9px 10px;
          border: 1px solid rgba(248, 81, 73, 0.3);
          border-radius: var(--radius-sm);
          background: var(--danger-subtle);
          color: var(--danger);
          font-size: 12px;
        }

        .forward-list {
          margin-top: 14px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          overflow: hidden;
          background: var(--solid-surface-2);
        }

        .forward-row {
          display: grid;
          grid-template-columns: 1fr 1fr 90px 90px;
          align-items: center;
          gap: 10px;
          min-height: 40px;
          padding: 0 12px;
          font-size: 12px;
          color: var(--text-secondary);
          border-bottom: 1px solid var(--border-color);
        }

        .forward-row:last-child {
          border-bottom: none;
        }

        .forward-header {
          color: var(--text-muted);
          font-weight: 600;
          background: var(--solid-surface);
        }

        .active-status {
          color: var(--success);
        }

        .actions {
          display: flex;
          justify-content: flex-end;
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
