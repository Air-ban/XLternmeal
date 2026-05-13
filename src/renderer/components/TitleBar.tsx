import React, { useEffect, useState } from 'react';

interface TitleBarProps {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export function TitleBar({ theme, onToggleTheme, onOpenSettings }: TitleBarProps): React.ReactElement {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    window.electronAPI.window.isMaximized().then(setIsMaximized);
  }, []);

  const handleToggleMaximize = async () => {
    const maximized = await window.electronAPI.window.toggleMaximize();
    setIsMaximized(maximized);
  };

  return (
    <header className="titlebar acrylic">
      <div className="titlebar-brand">
        <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="6" fill="var(--accent)" fillOpacity="0.16" />
          <path d="M7 10l7-4 7 4M7 14l7-4 7 4M7 18l7-4 7 4" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>XLterm</span>
      </div>

      <div className="titlebar-drag" />

      <div className="titlebar-actions">
        <button type="button" className="titlebar-tool" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
              <circle cx="7.5" cy="7.5" r="3.2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M7.5 1.2v1.4M7.5 12.4v1.4M1.2 7.5h1.4M12.4 7.5h1.4M3 3l1 1M11 11l1 1M12 3l-1 1M4 11l-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none">
              <path d="M12.2 9.5A5 5 0 0 1 5.5 2.8 5.4 5.4 0 1 0 12.2 9.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <button type="button" className="titlebar-tool" onClick={onOpenSettings} title="Settings">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6.8 1.8h2.4l.4 1.6c.4.1.8.3 1.1.5l1.4-.8 1.2 2-1.2 1.1c0 .2.1.5.1.8s0 .6-.1.8l1.2 1.1-1.2 2-1.4-.8c-.3.2-.7.4-1.1.5l-.4 1.6H6.8l-.4-1.6c-.4-.1-.8-.3-1.1-.5l-1.4.8-1.2-2 1.2-1.1c0-.2-.1-.5-.1-.8s0-.6.1-.8L2.7 5.1l1.2-2 1.4.8c.3-.2.7-.4 1.1-.5l.4-1.6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button type="button" className="window-btn" onClick={() => window.electronAPI.window.minimize()} title="Minimize">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className="window-btn" onClick={handleToggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4 2h6v6H8M2 4h6v6H2V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2.5" y="2.5" width="7" height="7" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          )}
        </button>
        <button type="button" className="window-btn close" onClick={() => window.electronAPI.window.close()} title="Close">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <style>{`
        .titlebar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: var(--titlebar-height);
          z-index: 10000;
          display: flex;
          align-items: center;
          padding-left: 12px;
          border-left: none;
          border-right: none;
          border-top: none;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
        }

        .titlebar-drag {
          flex: 1;
          height: 100%;
          -webkit-app-region: drag;
        }

        .titlebar-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.2px;
          -webkit-app-region: no-drag;
          flex-shrink: 0;
        }

        .titlebar-actions {
          height: 100%;
          display: flex;
          align-items: center;
          -webkit-app-region: no-drag;
          flex-shrink: 0;
        }

        .titlebar-tool,
        .window-btn {
          width: 42px;
          height: 100%;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          user-select: none;
          -webkit-user-select: none;
          transition: background var(--transition), color var(--transition);
          -webkit-app-region: no-drag;
        }

        .titlebar-tool {
          width: 36px;
          height: 28px;
          border-radius: var(--radius-sm);
          margin-right: 4px;
        }

        .titlebar-tool:hover,
        .window-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .window-btn.close:hover {
          background: #c42b1c;
          color: #fff;
        }
      `}</style>
    </header>
  );
}
