import React from 'react';

interface SettingsDialogProps {
  glassOpacity: number;
  onGlassOpacityChange: (opacity: number) => void;
  onClose: () => void;
}

export function SettingsDialog({
  glassOpacity,
  onGlassOpacityChange,
  onClose,
}: SettingsDialogProps): React.ReactElement {
  const percent = Math.round(glassOpacity * 100);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <div className="setting-row">
            <div>
              <label>Glass opacity</label>
              <p>{percent}%</p>
            </div>
            <input
              type="range"
              min="35"
              max="100"
              step="1"
              value={percent}
              onChange={(e) => onGlassOpacityChange(Number(e.target.value) / 100)}
            />
          </div>
          <button className="reset-btn" onClick={() => onGlassOpacityChange(1)}>
            Reset
          </button>
        </div>
      </div>

      <style>{`
        .settings-overlay {
          position: fixed;
          inset: 0;
          z-index: 11000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--overlay-bg);
          backdrop-filter: blur(18px) saturate(1.25);
          -webkit-backdrop-filter: blur(18px) saturate(1.25);
          -webkit-app-region: no-drag;
        }

        .settings-dialog {
          width: 420px;
          border: 1px solid var(--border-color);
          border-radius: 12px;
          background: var(--surface-strong);
          color: var(--text-primary);
          box-shadow: var(--shadow);
          backdrop-filter: blur(30px) saturate(1.45);
          -webkit-backdrop-filter: blur(30px) saturate(1.45);
          animation: scaleIn 0.16s ease;
        }

        .settings-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--border-color);
        }

        .settings-header h2 {
          font-size: 16px;
          font-weight: 600;
        }

        .settings-close {
          width: 30px;
          height: 30px;
          border: none;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        .settings-close:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .settings-body {
          padding: 20px;
        }

        .setting-row {
          display: grid;
          grid-template-columns: 120px 1fr;
          align-items: center;
          gap: 18px;
        }

        .setting-row label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .setting-row p {
          font-size: 12px;
          color: var(--text-muted);
        }

        .setting-row input[type="range"] {
          width: 100%;
          accent-color: var(--accent);
        }

        .reset-btn {
          margin-top: 18px;
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--bg-secondary);
          color: var(--text-primary);
          cursor: pointer;
          font-size: 12px;
        }

        .reset-btn:hover {
          border-color: var(--accent);
        }
      `}</style>
    </div>
  );
}
