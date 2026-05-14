import React from 'react';

export function VibeCode(): React.ReactElement {
  return (
    <div className="vibe-code-area">
      <style>{`
        .vibe-code-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-width: 0;
          position: relative;
          overflow: hidden;
          --vibe-accent: #e8b620;
          --vibe-accent-dim: rgba(232, 182, 32, 0.06);
        }

        .vibe-code-glow {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .vibe-code-glow::before {
          content: '';
          position: absolute;
          top: -20%;
          left: 10%;
          width: 50%;
          height: 60%;
          background: radial-gradient(ellipse, var(--vibe-accent) 0%, transparent 70%);
          opacity: 0.05;
          border-radius: 50%;
          filter: blur(80px);
        }

        .vibe-code-glow::after {
          content: '';
          position: absolute;
          bottom: -10%;
          right: 5%;
          width: 40%;
          height: 50%;
          background: radial-gradient(ellipse, var(--vibe-accent) 0%, transparent 70%);
          opacity: 0.04;
          border-radius: 50%;
          filter: blur(80px);
        }
      `}</style>
      <div className="vibe-code-glow" />
    </div>
  );
}
