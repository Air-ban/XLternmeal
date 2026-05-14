import React, { useCallback, useEffect, useState } from 'react';

interface TitleBarProps {
  mode: 'ssh' | 'code';
  onToggleMode: () => void;
  onOpenSettings: () => void;
}

export function TitleBar({ mode, onToggleMode, onOpenSettings }: TitleBarProps): React.ReactElement {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let mounted = true;

    window.electronAPI.window.isMaximized().then((maximized) => {
      if (mounted) {
        setIsMaximized(maximized);
      }
    }).catch((error) => {
      console.error('Failed to read window state', error);
    });

    const cleanup = window.electronAPI.window.onMaximizedChange((maximized) => {
      if (mounted) {
        setIsMaximized(maximized);
      }
    });

    return () => {
      mounted = false;
      cleanup();
    };
  }, []);

  const handleMinimize = useCallback(() => {
    void window.electronAPI.window.minimize().catch((error) => {
      console.error('Failed to minimize window', error);
    });
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    try {
      const maximized = await window.electronAPI.window.toggleMaximize();
      setIsMaximized(maximized);
    } catch (error) {
      console.error('Failed to toggle window maximize state', error);
    }
  }, []);

  const handleClose = useCallback(() => {
    void window.electronAPI.window.close().catch((error) => {
      console.error('Failed to close window', error);
    });
  }, []);

  const handleModeToggle = useCallback(() => {
    onToggleMode();
  }, [onToggleMode]);

  const stopWindowControlPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <header className="titlebar acrylic" data-window-state={isMaximized ? 'maximized' : 'normal'}>
      <div className="titlebar-brand">
        <svg width="18" height="18" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="6" fill="var(--accent)" fillOpacity="0.16" />
          <path d="M7 10l7-4 7 4M7 14l7-4 7 4M7 18l7-4 7 4" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>XLterm</span>
      </div>

      <div className={`mode-switch ${mode === 'code' ? 'code' : 'ssh'}`}>
        <div className={`mode-switch-indicator ${mode === 'code' ? 'code' : 'ssh'}`} />
        <button
          type="button"
          className={`mode-option ${mode === 'ssh' ? 'active' : ''}`}
          onClick={handleModeToggle}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="mode-icon">
            <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>SSH</span>
        </button>
        <button
          type="button"
          className={`mode-option ${mode === 'code' ? 'active' : ''}`}
          onClick={handleModeToggle}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="mode-icon">
            <path d="M5 2L2 14h3l.5-2h5l.5 2h3L11 2H5zm.7 7.5L7 5l1.3 4.5H5.7z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
          <span>CODE</span>
        </button>
      </div>

      <div className="titlebar-drag" onDoubleClick={handleToggleMaximize} />

      <div className="titlebar-actions">
        <button
          type="button"
          className="titlebar-button titlebar-tool"
          onPointerDown={stopWindowControlPointer}
          onClick={onOpenSettings}
          aria-label="Settings"
          title="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6.8 1.8h2.4l.4 1.6c.4.1.8.3 1.1.5l1.4-.8 1.2 2-1.2 1.1c0 .2.1.5.1.8s0 .6-.1.8l1.2 1.1-1.2 2-1.4-.8c-.3.2-.7.4-1.1.5l-.4 1.6H6.8l-.4-1.6c-.4-.1-.8-.3-1.1-.5l-1.4.8-1.2-2 1.2-1.1c0-.2-.1-.5-.1-.8s0-.6.1-.8L2.7 5.1l1.2-2 1.4.8c.3-.2.7-.4 1.1-.5l.4-1.6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar-button window-btn"
          onPointerDown={stopWindowControlPointer}
          onClick={handleMinimize}
          aria-label="Minimize"
          title="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className="titlebar-button window-btn"
          onPointerDown={stopWindowControlPointer}
          onClick={handleToggleMaximize}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
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
        <button
          type="button"
          className="titlebar-button window-btn close"
          onPointerDown={stopWindowControlPointer}
          onClick={handleClose}
          aria-label="Close"
          title="Close"
        >
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
          z-index: 13000;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 8px 0 12px;
          border-left: none;
          border-right: none;
          border-top: none;
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
          user-select: none;
          -webkit-user-select: none;
        }

        .titlebar-drag {
          flex: 1;
          height: 100%;
          min-width: 36px;
          -webkit-app-region: drag;
        }

        .titlebar-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 100%;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0;
          -webkit-app-region: no-drag;
          flex-shrink: 0;
        }

        /* ====== Mode Switch ====== */
        .mode-switch {
          position: relative;
          display: flex;
          align-items: center;
          height: 28px;
          padding: 2px;
          border-radius: 20px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          -webkit-app-region: no-drag;
          flex-shrink: 0;
          cursor: pointer;
        }

        .mode-switch-indicator {
          position: absolute;
          top: 2px;
          left: 2px;
          width: calc(50% - 2px);
          height: calc(100% - 4px);
          border-radius: 18px;
          background: var(--accent);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.08);
          transition: transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1), background 380ms cubic-bezier(0.34, 1.56, 0.64, 1);
          will-change: transform;
        }

        .mode-switch-indicator.code {
          transform: translateX(100%);
          background: #e8b620;
          box-shadow: 0 2px 8px rgba(232, 182, 32, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.08);
        }

        .mode-option {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          height: 24px;
          padding: 0 10px;
          border: none;
          border-radius: 18px;
          background: transparent;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.3px;
          cursor: pointer;
          color: var(--text-muted);
          transition: color 250ms ease;
          white-space: nowrap;
        }

        .mode-option.active {
          color: #fff;
        }

        .mode-icon {
          flex-shrink: 0;
          transition: transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .mode-option.active .mode-icon {
          transform: scale(1.08);
        }

        .mode-option:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
          border-radius: 18px;
        }

        .titlebar-actions {
          position: relative;
          z-index: 1;
          height: 100%;
          display: flex;
          align-items: center;
          gap: 2px;
          padding: 4px 0 4px 6px;
          border-left: 1px solid var(--border-color);
          -webkit-app-region: no-drag;
          pointer-events: auto;
          flex-shrink: 0;
        }

        .titlebar-button {
          width: 42px;
          height: 32px;
          border: none;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          line-height: 0;
          user-select: none;
          -webkit-user-select: none;
          touch-action: manipulation;
          transition: background var(--transition), color var(--transition);
          -webkit-app-region: no-drag;
        }

        .titlebar-button svg {
          flex: 0 0 auto;
          pointer-events: none;
        }

        .titlebar-tool {
          width: 34px;
          margin-right: 4px;
        }

        .titlebar-button:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .titlebar-button:active {
          background: rgba(var(--acrylic-tint-rgb), 0.3);
        }

        .titlebar-button:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: -2px;
        }

        .window-btn.close:hover {
          background: #c42b1c;
          color: #fff;
        }

        @media (max-width: 560px) {
          .titlebar-brand span {
            display: none;
          }

          .titlebar-actions {
            gap: 1px;
            padding-left: 4px;
          }

          .titlebar-button {
            width: 38px;
          }
        }
      `}</style>
    </header>
  );
}
