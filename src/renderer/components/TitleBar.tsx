import React, { useCallback, useEffect, useState } from 'react';

interface TitleBarProps {
  onOpenSettings: () => void;
}

export function TitleBar({ onOpenSettings }: TitleBarProps): React.ReactElement {
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
