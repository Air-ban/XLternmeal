import React from 'react';

interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
}

interface SidebarProps {
  mode: 'ssh' | 'code';
  visible: boolean;
  onToggleVisible: () => void;
  connections: Connection[];
  activeId: string | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onConnect: (conn: Connection) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (conn: Connection) => void;
}

export function Sidebar({
  mode,
  visible,
  onToggleVisible,
  connections,
  activeId,
  theme,
  onToggleTheme,
  onConnect,
  onNew,
  onSelect,
  onDelete,
  onEdit,
}: SidebarProps): React.ReactElement {
  return (
    <>
      <aside className={`sidebar acrylic ${visible ? 'expanded' : 'collapsed'}`}>
        <button
          className="sidebar-toggle"
          onClick={onToggleVisible}
          title={visible ? 'Hide sidebar' : 'Show sidebar'}
          aria-label={visible ? 'Hide sidebar' : 'Show sidebar'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
            style={{ transform: visible ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 250ms ease' }}
          >
            <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {visible && mode === 'ssh' && (
          <>
            <div className="sidebar-header">
              <div className="logo">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect width="28" height="28" rx="6" fill="var(--accent)" fillOpacity="0.15" />
                  <path d="M7 10l7-4 7 4M7 14l7-4 7 4M7 18l7-4 7 4" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="logo-text">XLterm</span>
              </div>
              <button className="btn btn-accent btn-sm" onClick={onNew} title="New Connection">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span>Connect</span>
              </button>
            </div>

            <div className="sidebar-section-label">CONNECTIONS</div>
            <div className="connection-list">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className={`connection-item ${activeId === conn.id ? 'active' : ''}`}
                  onClick={() => {
                    if (activeId === conn.id) {
                      onSelect(conn.id);
                    } else {
                      onConnect(conn);
                    }
                  }}
                >
                  <div className="connection-icon">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <rect x="3" y="3" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <rect x="6" y="6" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
                    </svg>
                  </div>
                  <div className="connection-info">
                    <span className="connection-name">{conn.name}</span>
                    <span className="connection-host">{conn.username}@{conn.host}</span>
                  </div>
                  <div className="connection-actions">
                    <button
                      className="conn-action-btn"
                      onClick={(e) => { e.stopPropagation(); onEdit(conn); }}
                      title="Edit"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M10.5 1.5l2 2-8.5 8.5H2v-2l8.5-8.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      className="conn-action-btn conn-action-btn-danger"
                      onClick={(e) => { e.stopPropagation(); onDelete(conn.id); }}
                      title="Delete"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 4h10M5 4V3h4v1M4.5 4v7.5h5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {connections.length === 0 && (
                <div className="sidebar-empty">
                  <p>No saved connections</p>
                  <button className="btn btn-ghost btn-sm" onClick={onNew}>
                    Add your first connection
                  </button>
                </div>
              )}
            </div>

            <div className="sidebar-footer">
              <div className="sidebar-status">
                <span className="status-dot success"></span>
                <span>Ready</span>
              </div>
              <button
                className="theme-toggle"
                onClick={onToggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? (
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <circle cx="7.5" cy="7.5" r="3.2" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M7.5 1.2v1.4M7.5 12.4v1.4M1.2 7.5h1.4M12.4 7.5h1.4M3 3l1 1M11 11l1 1M12 3l-1 1M4 11l-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <path d="M12.2 9.5A5 5 0 0 1 5.5 2.8 5.4 5.4 0 1 0 12.2 9.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
          </>
        )}

        {visible && mode === 'code' && (
          <>
            <div className="sidebar-header">
              <div className="logo">
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect width="28" height="28" rx="6" fill="#e8b620" fillOpacity="0.18" />
                  <path d="M10 18l-5-4 5-4M18 10l5 4-5 4M12 20l4-12" stroke="#e8b620" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="logo-text">Vibe Code</span>
              </div>
            </div>

            <div className="sidebar-section-label">PROJECTS</div>
            <div className="connection-list">
              <div className="sidebar-empty">
                <p>No projects yet</p>
                <button className="btn btn-ghost btn-sm">
                  Create new project
                </button>
              </div>
            </div>

            <div className="sidebar-footer">
              <div className="sidebar-status">
                <span className="status-dot"></span>
                <span>vibe mode</span>
              </div>
              <button
                className="theme-toggle"
                onClick={onToggleTheme}
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? (
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <circle cx="7.5" cy="7.5" r="3.2" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M7.5 1.2v1.4M7.5 12.4v1.4M1.2 7.5h1.4M12.4 7.5h1.4M3 3l1 1M11 11l1 1M12 3l-1 1M4 11l-1 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <path d="M12.2 9.5A5 5 0 0 1 5.5 2.8 5.4 5.4 0 1 0 12.2 9.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            </div>
          </>
        )}

        <style>{`
          .sidebar {
            position: relative;
            border-left: none;
            border-top: none;
            border-bottom: none;
            display: flex;
            flex-direction: column;
            height: 100%;
            user-select: none;
            box-shadow: 12px 0 42px rgba(0, 0, 0, 0.18);
            transition: width 280ms cubic-bezier(0.4, 0, 0.2, 1), min-width 280ms cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
          }

          .sidebar.expanded {
            width: 280px;
            min-width: 280px;
          }

          .sidebar.collapsed {
            width: 40px;
            min-width: 40px;
          }

          .sidebar-toggle {
            position: absolute;
            top: 12px;
            right: 10px;
            z-index: 10;
            width: 24px;
            height: 24px;
            border: none;
            border-radius: var(--radius-sm);
            background: transparent;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all var(--transition);
            -webkit-app-region: no-drag;
          }

          .sidebar-toggle:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
          }

          .sidebar.collapsed .sidebar-toggle {
            position: static;
            margin: 12px auto 0;
          }

          .sidebar-header {
            padding: 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border-color);
            -webkit-app-region: no-drag;
          }

          .logo {
            display: flex;
            align-items: center;
            gap: 10px;
          }

          .logo-text {
            font-size: 16px;
            font-weight: 700;
            letter-spacing: -0.3px;
            color: var(--text-primary);
          }

          .sidebar-section-label {
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.8px;
            color: var(--text-muted);
            padding: 14px 16px 8px;
          }

          .connection-list {
            flex: 1;
            overflow-y: auto;
            padding: 0 8px;
          }

          .connection-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: background var(--transition);
            margin-bottom: 2px;
            animation: slideIn 0.2s ease;
          }

          .connection-item:hover {
            background: var(--bg-tertiary);
          }

          .connection-item.active {
            background: var(--accent-subtle);
            border: 1px solid rgba(88, 166, 255, 0.2);
          }

          .connection-icon {
            flex-shrink: 0;
            color: var(--text-muted);
            display: flex;
          }

          .connection-item.active .connection-icon {
            color: var(--accent);
          }

          .connection-info {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .connection-name {
            font-size: 13px;
            font-weight: 500;
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .connection-host {
            font-size: 11px;
            color: var(--text-muted);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .connection-actions {
            display: flex;
            gap: 2px;
            opacity: 0;
            transition: opacity var(--transition);
          }

          .connection-item:hover .connection-actions {
            opacity: 1;
          }

          .conn-action-btn {
            width: 26px;
            height: 26px;
            border: none;
            background: transparent;
            color: var(--text-muted);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all var(--transition);
          }

          .conn-action-btn:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
          }

          .conn-action-btn-danger:hover {
            color: var(--danger);
            background: rgba(248, 81, 73, 0.1);
          }

          .sidebar-empty {
            padding: 24px 16px;
            text-align: center;
            color: var(--text-muted);
            font-size: 13px;
          }

          .sidebar-empty p {
            margin-bottom: 12px;
          }

          .sidebar-footer {
            padding: 12px 16px;
            border-top: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .sidebar-status {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            color: var(--text-muted);
          }

          .status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--text-muted);
          }

          .status-dot.success {
            background: var(--success);
          }

          .theme-toggle {
            width: 28px;
            height: 28px;
            border: none;
            background: transparent;
            color: var(--text-muted);
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all var(--transition);
          }

          .theme-toggle:hover {
            background: var(--bg-tertiary);
            color: var(--text-primary);
          }

          .btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            border: none;
            border-radius: var(--radius-sm);
            cursor: pointer;
            font-weight: 500;
            font-size: 13px;
            transition: all var(--transition);
          }

          .btn-sm {
            padding: 6px 12px;
            font-size: 12px;
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
            color: var(--accent);
          }

          .btn-ghost:hover {
            background: var(--accent-subtle);
          }
        `}</style>
      </aside>

    </>
  );
}
