import React from 'react';

interface OnboardingProps {
  onFinish: () => void;
}

const features = [
  {
    title: '连接服务器',
    desc: '保存常用主机，单击即可打开 SSH 会话。',
  },
  {
    title: '多标签终端',
    desc: '多个会话并行运行，切换标签不会断开连接。',
  },
  {
    title: 'SFTP 文件',
    desc: '浏览远程目录，上传、下载和整理文件。',
  },
  {
    title: '端口转发',
    desc: '将本地端口安全转发到远程服务。',
  },
];

export function Onboarding({ onFinish }: OnboardingProps): React.ReactElement {
  return (
    <div className="onboarding">
      <div className="onboarding-shell">
        <section className="onboarding-visual" aria-hidden="true">
          <div className="terminal-card">
            <div className="terminal-top">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="terminal-body">
              <p><span className="prompt">$</span> ssh root@server</p>
              <p className="line delay-1">正在建立安全连接...</p>
              <p className="line delay-2">SFTP 通道已就绪</p>
              <p className="line delay-3">本地端口 8080 已转发</p>
              <div className="cursor-line">
                <span className="prompt">$</span>
                <span className="typing">欢迎使用 XLterm</span>
                <span className="cursor"></span>
              </div>
            </div>
          </div>

          <div className="orbit orbit-one"></div>
          <div className="orbit orbit-two"></div>
          <div className="node node-a">SSH</div>
          <div className="node node-b">SFTP</div>
          <div className="node node-c">TCP</div>
        </section>

        <section className="onboarding-content">
          <div className="eyebrow">首次启动</div>
          <h1>欢迎来到 XLterm</h1>
          <p className="lead">
            一个带云母玻璃效果的 SSH 工作台，适合日常连接服务器、传输文件和调试远程服务。
          </p>

          <div className="feature-list">
            {features.map((feature, index) => (
              <div className="feature-item" key={feature.title} style={{ animationDelay: `${120 + index * 70}ms` }}>
                <div className="feature-index">{index + 1}</div>
                <div>
                  <h2>{feature.title}</h2>
                  <p>{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="onboarding-actions">
            <button className="primary-action" onClick={onFinish}>
              开始使用
            </button>
          </div>
        </section>
      </div>

      <style>{`
        .onboarding {
          --onboarding-overlay-bg: rgba(9, 13, 20, 0.12);
          --onboarding-shell-bg: rgba(13, 17, 23, 0.36);
          --onboarding-visual-bg: rgba(3, 7, 12, 0.18);
          --onboarding-terminal-bg: rgba(3, 7, 12, 0.52);
          --onboarding-chip-bg: rgba(13, 17, 23, 0.48);
          --onboarding-feature-bg: rgba(22, 27, 34, 0.26);
          position: fixed;
          inset: 0;
          z-index: 12000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px;
          background: var(--onboarding-overlay-bg);
          backdrop-filter: blur(42px) saturate(1.75);
          -webkit-backdrop-filter: blur(42px) saturate(1.75);
          -webkit-app-region: no-drag;
          animation: onboardingFade 0.24s ease;
        }

        [data-theme="light"] .onboarding {
          --onboarding-overlay-bg: rgba(248, 250, 252, 0.1);
          --onboarding-shell-bg: rgba(255, 255, 255, 0.42);
          --onboarding-visual-bg: rgba(246, 248, 250, 0.2);
          --onboarding-terminal-bg: rgba(255, 255, 255, 0.58);
          --onboarding-chip-bg: rgba(255, 255, 255, 0.5);
          --onboarding-feature-bg: rgba(246, 248, 250, 0.32);
        }

        .onboarding-shell {
          width: min(960px, 100%);
          min-height: 560px;
          display: grid;
          grid-template-columns: minmax(360px, 1fr) minmax(360px, 0.9fr);
          overflow: hidden;
          border: 1px solid var(--border-color);
          border-radius: 18px;
          background: var(--onboarding-shell-bg);
          box-shadow: var(--shadow);
          backdrop-filter: blur(36px) saturate(1.65);
          -webkit-backdrop-filter: blur(36px) saturate(1.65);
        }

        .onboarding-visual {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 560px;
          overflow: hidden;
          background: var(--onboarding-visual-bg);
          border-right: 1px solid var(--border-color);
          backdrop-filter: blur(26px) saturate(1.45);
          -webkit-backdrop-filter: blur(26px) saturate(1.45);
        }

        .terminal-card {
          position: relative;
          z-index: 2;
          width: 78%;
          max-width: 420px;
          border: 1px solid var(--border-color);
          border-radius: 14px;
          background: var(--onboarding-terminal-bg);
          box-shadow: var(--shadow-sm);
          overflow: hidden;
          backdrop-filter: blur(28px) saturate(1.45);
          -webkit-backdrop-filter: blur(28px) saturate(1.45);
          animation: terminalFloat 4.8s ease-in-out infinite;
        }

        .terminal-top {
          height: 38px;
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 0 14px;
          border-bottom: 1px solid var(--border-color);
          background: var(--chrome-bg);
        }

        .terminal-top span {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--text-muted);
          opacity: 0.75;
        }

        .terminal-top span:first-child { background: #f85149; }
        .terminal-top span:nth-child(2) { background: #d29922; }
        .terminal-top span:nth-child(3) { background: #3fb950; }

        .terminal-body {
          padding: 22px;
          min-height: 260px;
          font-family: Consolas, 'Cascadia Code', monospace;
          font-size: 13px;
          color: var(--text-primary);
        }

        .terminal-body p,
        .cursor-line {
          margin-bottom: 14px;
          opacity: 0;
          animation: lineIn 0.44s ease forwards;
        }

        .terminal-body p:first-child {
          opacity: 1;
          animation: none;
        }

        .delay-1 { animation-delay: 420ms !important; }
        .delay-2 { animation-delay: 820ms !important; }
        .delay-3 { animation-delay: 1220ms !important; }

        .prompt {
          color: var(--accent);
          margin-right: 8px;
        }

        .cursor-line {
          display: flex;
          align-items: center;
          animation-delay: 1680ms;
        }

        .typing {
          color: var(--text-secondary);
        }

        .cursor {
          width: 8px;
          height: 16px;
          margin-left: 4px;
          background: var(--accent);
          animation: blink 1s steps(1) infinite;
        }

        .orbit {
          position: absolute;
          border: 1px solid var(--border-color);
          border-radius: 50%;
          opacity: 0.65;
        }

        .orbit-one {
          width: 440px;
          height: 440px;
          animation: spin 18s linear infinite;
        }

        .orbit-two {
          width: 300px;
          height: 300px;
          animation: spin 12s linear infinite reverse;
        }

        .node {
          position: absolute;
          z-index: 3;
          min-width: 58px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-color);
          border-radius: 999px;
          background: var(--onboarding-chip-bg);
          color: var(--accent);
          font-size: 11px;
          font-weight: 700;
          box-shadow: var(--shadow-sm);
          backdrop-filter: blur(24px) saturate(1.35);
          -webkit-backdrop-filter: blur(24px) saturate(1.35);
          animation: nodePulse 2.4s ease-in-out infinite;
        }

        .node-a { top: 95px; left: 76px; }
        .node-b { right: 70px; top: 150px; animation-delay: 220ms; }
        .node-c { left: 110px; bottom: 118px; animation-delay: 420ms; }

        .onboarding-content {
          padding: 56px 48px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .eyebrow {
          color: var(--accent);
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 12px;
        }

        .onboarding-content h1 {
          font-size: 34px;
          line-height: 1.15;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 14px;
          letter-spacing: 0;
        }

        .lead {
          font-size: 14px;
          line-height: 1.7;
          color: var(--text-secondary);
          margin-bottom: 28px;
        }

        .feature-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .feature-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 12px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          background: var(--onboarding-feature-bg);
          backdrop-filter: blur(20px) saturate(1.3);
          -webkit-backdrop-filter: blur(20px) saturate(1.3);
          opacity: 0;
          transform: translateY(10px);
          animation: featureIn 0.42s ease forwards;
        }

        .feature-index {
          width: 24px;
          height: 24px;
          flex: 0 0 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--accent-subtle);
          color: var(--accent);
          font-size: 12px;
          font-weight: 800;
        }

        .feature-item h2 {
          font-size: 14px;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .feature-item p {
          font-size: 12px;
          line-height: 1.5;
          color: var(--text-secondary);
        }

        .onboarding-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 28px;
        }

        .primary-action {
          min-width: 116px;
          height: 38px;
          padding: 0 18px;
          border: none;
          border-radius: var(--radius-sm);
          background: var(--accent);
          color: var(--btn-text);
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          box-shadow: 0 10px 26px var(--accent-subtle);
          transition: transform var(--transition), background var(--transition);
        }

        .primary-action:hover {
          background: var(--accent-hover);
          transform: translateY(-1px);
        }

        @keyframes onboardingFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes terminalFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        @keyframes lineIn {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes nodePulse {
          0%, 100% { transform: scale(1); opacity: 0.88; }
          50% { transform: scale(1.06); opacity: 1; }
        }

        @keyframes featureIn {
          to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 900px) {
          .onboarding {
            padding: 18px;
          }

          .onboarding-shell {
            grid-template-columns: 1fr;
            min-height: auto;
          }

          .onboarding-visual {
            min-height: 300px;
            border-right: none;
            border-bottom: 1px solid var(--border-color);
          }

          .onboarding-content {
            padding: 32px 28px;
          }
        }
      `}</style>
    </div>
  );
}
