import React from 'react';

interface WelcomeProps {
  onNewConnection: () => void;
}

export function Welcome({ onNewConnection }: WelcomeProps): React.ReactElement {
  return (
    <div className="welcome">
      <div className="welcome-content">
        <div className="welcome-icon">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="4" y="4" width="56" height="56" rx="14" stroke="var(--accent)" strokeWidth="1.5" strokeOpacity="0.3" />
            <rect x="14" y="14" width="36" height="36" rx="8" stroke="var(--accent)" strokeWidth="1.5" strokeOpacity="0.5" />
            <path d="M24 26h16M24 32h12M24 38h8" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeOpacity="0.7" />
          </svg>
        </div>
        <h1 className="welcome-title">XLterm</h1>
        <p className="welcome-subtitle">Modern SSH Terminal Client</p>
        <p className="welcome-desc">
          Connect to your remote servers securely with a beautiful,
          modern terminal interface. Manage multiple sessions with ease.
        </p>
        <button className="welcome-btn" onClick={onNewConnection}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New Connection
        </button>
        <div className="welcome-shortcuts">
          <div className="shortcut-item">
            <kbd>Ctrl+N</kbd>
            <span>New Connection</span>
          </div>
          <div className="shortcut-item">
            <kbd>Ctrl+W</kbd>
            <span>Close Tab</span>
          </div>
          <div className="shortcut-item">
            <kbd>Ctrl+Tab</kbd>
            <span>Switch Tab</span>
          </div>
        </div>
      </div>

      <style>{`
        .welcome {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: var(--bg-primary);
        }

        .welcome-content {
          text-align: center;
          max-width: 420px;
          animation: scaleIn 0.3s ease;
        }

        .welcome-icon {
          margin-bottom: 24px;
          opacity: 0.6;
        }

        .welcome-title {
          font-size: 36px;
          font-weight: 800;
          letter-spacing: -1px;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .welcome-subtitle {
          font-size: 15px;
          color: var(--accent);
          font-weight: 500;
          margin-bottom: 16px;
        }

        .welcome-desc {
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 32px;
        }

        .welcome-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 28px;
          background: var(--accent);
          color: var(--btn-text);
          border: none;
          border-radius: var(--radius);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
          box-shadow: 0 0 20px rgba(88, 166, 255, 0.15);
        }

        .welcome-btn:hover {
          background: var(--accent-hover);
          box-shadow: 0 0 30px rgba(88, 166, 255, 0.25);
          transform: translateY(-1px);
        }

        .welcome-shortcuts {
          margin-top: 40px;
          display: flex;
          gap: 20px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .shortcut-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .shortcut-item kbd {
          padding: 2px 8px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          font-size: 11px;
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}
