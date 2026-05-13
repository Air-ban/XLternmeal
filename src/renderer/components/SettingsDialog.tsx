import React from 'react';
import type { AcrylicTone, AppSettings } from '../App';

interface SettingsDialogProps {
  theme: 'dark' | 'light';
  settings: AppSettings;
  onThemeChange: (theme: 'dark' | 'light') => void;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
  onResetSettings: () => void;
  onClose: () => void;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function SettingsDialog({
  theme,
  settings,
  onThemeChange,
  onSettingsChange,
  onResetSettings,
  onClose,
}: SettingsDialogProps): React.ReactElement {
  const setNumber = (key: keyof AppSettings, value: string, scale = 1) => {
    onSettingsChange({ [key]: Number(value) / scale } as Partial<AppSettings>);
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-dialog acrylic" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div>
            <h2>设置</h2>
            <p>外观和终端基础选项</p>
          </div>
          <button className="settings-close" onClick={onClose} title="Close">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3>外观</h3>
            <div className="setting-row">
              <div>
                <label>主题</label>
                <p>{theme === 'dark' ? '深色' : '浅色'}</p>
              </div>
              <div className="segmented">
                <button className={theme === 'dark' ? 'active' : ''} onClick={() => onThemeChange('dark')}>深色</button>
                <button className={theme === 'light' ? 'active' : ''} onClick={() => onThemeChange('light')}>浅色</button>
              </div>
            </div>

            <div className="setting-row">
              <div>
                <label>Acrylic 色调</label>
                <p>{settings.acrylicTone === 'auto' ? '跟随主题' : settings.acrylicTone === 'dark' ? '深色' : '浅色'}</p>
              </div>
              <select
                value={settings.acrylicTone}
                onChange={(e) => onSettingsChange({ acrylicTone: e.target.value as AcrylicTone })}
              >
                <option value="auto">跟随主题</option>
                <option value="dark">深色</option>
                <option value="light">浅色</option>
              </select>
            </div>

            <div className="setting-row">
              <div>
                <label>Acrylic 不透明度</label>
                <p>{percent(settings.acrylicOpacity)}</p>
              </div>
              <input
                type="range"
                min="20"
                max="85"
                step="1"
                value={Math.round(settings.acrylicOpacity * 100)}
                onChange={(e) => setNumber('acrylicOpacity', e.target.value, 100)}
              />
            </div>

            <div className="setting-row">
              <div>
                <label>模糊强度</label>
                <p>{settings.acrylicBlur}px</p>
              </div>
              <input
                type="range"
                min="12"
                max="48"
                step="1"
                value={settings.acrylicBlur}
                onChange={(e) => setNumber('acrylicBlur', e.target.value)}
              />
            </div>

            <div className="setting-row">
              <div>
                <label>工作区底色</label>
                <p>{percent(settings.workspaceTint)}</p>
              </div>
              <input
                type="range"
                min="0"
                max="35"
                step="1"
                value={Math.round(settings.workspaceTint * 100)}
                onChange={(e) => setNumber('workspaceTint', e.target.value, 100)}
              />
            </div>
          </section>

          <section className="settings-section">
            <h3>终端</h3>
            <div className="setting-row">
              <div>
                <label>终端背景</label>
                <p>{percent(settings.terminalOpacity)}</p>
              </div>
              <input
                type="range"
                min="45"
                max="95"
                step="1"
                value={Math.round(settings.terminalOpacity * 100)}
                onChange={(e) => setNumber('terminalOpacity', e.target.value, 100)}
              />
            </div>

            <div className="setting-row">
              <div>
                <label>字号</label>
                <p>{settings.terminalFontSize}px</p>
              </div>
              <input
                type="range"
                min="12"
                max="20"
                step="1"
                value={settings.terminalFontSize}
                onChange={(e) => setNumber('terminalFontSize', e.target.value)}
              />
            </div>

            <label className="check-row">
              <span>
                <strong>光标闪烁</strong>
                <small>{settings.terminalCursorBlink ? '开启' : '关闭'}</small>
              </span>
              <input
                type="checkbox"
                checked={settings.terminalCursorBlink}
                onChange={(e) => onSettingsChange({ terminalCursorBlink: e.target.checked })}
              />
            </label>
          </section>

          <div className="settings-footer">
            <button className="secondary-btn" onClick={onResetSettings}>重置</button>
            <button className="primary-btn" onClick={onClose}>应用</button>
          </div>
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
          background: rgba(0, 0, 0, 0.48);
          backdrop-filter: blur(12px) saturate(1.15);
          -webkit-backdrop-filter: blur(12px) saturate(1.15);
          -webkit-app-region: no-drag;
          animation: overlayIn 0.18s ease;
        }

        [data-theme="light"] .settings-overlay {
          background: rgba(0, 0, 0, 0.28);
        }

        @keyframes overlayIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .settings-dialog {
          width: min(560px, calc(100vw - 32px));
          max-height: calc(100vh - 72px);
          border-radius: 12px;
          color: var(--text-primary);
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

        .settings-header p {
          margin-top: 3px;
          color: var(--text-muted);
          font-size: 12px;
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
          padding: 18px 20px 20px;
          overflow: auto;
          max-height: calc(100vh - 150px);
        }

        .settings-section {
          padding: 14px 0;
          border-bottom: 1px solid var(--border-color);
        }

        .settings-section:first-child {
          padding-top: 0;
        }

        .settings-section h3 {
          margin-bottom: 12px;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.4px;
        }

        .setting-row {
          display: grid;
          grid-template-columns: 150px minmax(0, 1fr);
          align-items: center;
          gap: 18px;
          min-height: 44px;
          margin-bottom: 10px;
        }

        .setting-row:last-child {
          margin-bottom: 0;
        }

        .setting-row label,
        .check-row strong {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .setting-row p,
        .check-row small {
          display: block;
          font-size: 12px;
          color: var(--text-muted);
        }

        .setting-row input[type="range"] {
          width: 100%;
          accent-color: var(--accent);
        }

        .setting-row select {
          width: 100%;
          height: 34px;
          padding: 0 10px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--solid-surface-2);
          color: var(--text-primary);
        }

        .segmented {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          overflow: hidden;
          background: var(--solid-surface-2);
        }

        .segmented button {
          height: 34px;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
        }

        .segmented button.active {
          background: var(--accent-subtle);
          color: var(--accent);
        }

        .check-row {
          min-height: 44px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          cursor: pointer;
        }

        .check-row input {
          width: 18px;
          height: 18px;
          accent-color: var(--accent);
        }

        .settings-footer {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-top: 16px;
        }

        .secondary-btn {
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--solid-surface-2);
          color: var(--text-primary);
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
        }

        .secondary-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }

        .primary-btn {
          padding: 8px 20px;
          border: 1px solid var(--accent);
          border-radius: var(--radius-sm);
          background: var(--accent);
          color: #fff;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          transition: all var(--transition);
        }

        .primary-btn:hover {
          background: var(--accent-hover);
        }
      `}</style>
    </div>
  );
}
