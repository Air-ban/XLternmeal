import React, { useEffect, useMemo, useState } from 'react';
import type { LLMProviderConfig } from '../App';

interface AgentPanelProps {
  sessionId: string;
  llmProviders: LLMProviderConfig[];
  activeLlmProviderId: string;
  onActiveLlmProviderChange: (id: string) => void;
}

interface CommandRisk {
  isDangerous: boolean;
  reasons: string[];
}

interface CommandApproval {
  approved: boolean;
  risk: CommandRisk;
  required: boolean;
  mode: 'manual' | 'auto_accept';
}

interface AgentPlan {
  needExecute: boolean;
  command: string;
  explanation: string;
  risk: CommandRisk;
  approval: CommandApproval;
}

interface AgentContextMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AgentExecutionResult {
  needExecute: boolean;
  command: string;
  explanation: string;
  output: string;
  exitCode: number | null;
  signal?: string;
  approval: CommandApproval;
  attempts: Array<{ command: string; output: string; exitCode: number | null }>;
}

function requestId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatStatus(status: string, detail: string): string {
  if (status === 'thinking') return `Thinking with ${detail}`;
  if (status === 'thinking_done') return 'Plan ready';
  if (status === 'executing') return `Executing ${detail}`;
  if (status === 'executing_done') return 'Execution finished';
  if (status === 'retrying') return `Retrying command ${detail}`;
  return status;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function providerTitle(provider: LLMProviderConfig): string {
  return `${provider.name} / ${provider.llmModel}`;
}

interface SlashCommand {
  id: string;
  title: string;
  description: string;
  prompt?: string;
  action?: 'clear-context' | 'refresh-context';
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: '/status',
    title: '/status',
    description: 'Summarize host, uptime, load, disk, and memory',
    prompt: 'Check this server status: hostname, OS, uptime, load average, disk usage, memory usage, and top CPU processes.',
  },
  {
    id: '/disk',
    title: '/disk',
    description: 'Inspect filesystem capacity and large paths',
    prompt: 'Check disk usage and identify the largest directories under the current working directory and /var.',
  },
  {
    id: '/memory',
    title: '/memory',
    description: 'Inspect memory and swap pressure',
    prompt: 'Check memory and swap usage, then show the top memory-consuming processes.',
  },
  {
    id: '/cpu',
    title: '/cpu',
    description: 'Inspect load and CPU-heavy processes',
    prompt: 'Check CPU load and list the top CPU-consuming processes with command names.',
  },
  {
    id: '/logs',
    title: '/logs',
    description: 'Find recent system errors',
    prompt: 'Show recent system errors and warnings from available logs or journal entries.',
  },
  {
    id: '/network',
    title: '/network',
    description: 'Show listening ports and connections',
    prompt: 'List listening ports, active network connections, and the owning processes if available.',
  },
  {
    id: '/docker',
    title: '/docker',
    description: 'Inspect Docker containers',
    prompt: 'Show Docker container status, image names, port mappings, and recent unhealthy or restarted containers.',
  },
  {
    id: '/services',
    title: '/services',
    description: 'Inspect failed services',
    prompt: 'List failed or unhealthy system services and include short status details.',
  },
  {
    id: '/clear',
    title: '/clear',
    description: 'Clear Agent context for this SSH session',
    action: 'clear-context',
  },
  {
    id: '/refresh',
    title: '/refresh',
    description: 'Refresh Agent context from the main process',
    action: 'refresh-context',
  },
];

export function AgentPanel({
  sessionId,
  llmProviders,
  activeLlmProviderId,
  onActiveLlmProviderChange,
}: AgentPanelProps): React.ReactElement {
  const [instruction, setInstruction] = useState('');
  const [pendingInstruction, setPendingInstruction] = useState('');
  const [pendingProviderId, setPendingProviderId] = useState('');
  const [pendingPlan, setPendingPlan] = useState<AgentPlan | null>(null);
  const [contextMessages, setContextMessages] = useState<AgentContextMessage[]>([]);
  const [lastResult, setLastResult] = useState<AgentExecutionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('Idle');
  const [slashIndex, setSlashIndex] = useState(0);

  const selectedProvider = useMemo(() => {
    return llmProviders.find((provider) => provider.id === activeLlmProviderId) || llmProviders[0] || null;
  }, [activeLlmProviderId, llmProviders]);

  const slashMatch = useMemo(() => {
    return instruction.match(/(?:^|\s)\/([a-z]*)$/i);
  }, [instruction]);

  const slashQuery = slashMatch?.[1]?.toLowerCase() ?? '';
  const slashCommands = useMemo(() => {
    if (!slashMatch) {
      return [];
    }
    return SLASH_COMMANDS.filter((command) => (
      command.id.slice(1).toLowerCase().startsWith(slashQuery)
      || command.description.toLowerCase().includes(slashQuery)
    ));
  }, [slashMatch, slashQuery]);
  const showSlashCommands = slashCommands.length > 0 && !busy;

  const commandRiskText = useMemo(() => {
    if (!pendingPlan?.risk.isDangerous) {
      return 'No risk detected';
    }
    return pendingPlan.risk.reasons.join(', ');
  }, [pendingPlan]);

  useEffect(() => {
    if (selectedProvider && selectedProvider.id !== activeLlmProviderId) {
      onActiveLlmProviderChange(selectedProvider.id);
    }
  }, [activeLlmProviderId, onActiveLlmProviderChange, selectedProvider]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  const loadContext = async () => {
    const result = await window.electronAPI.agent.getContext(sessionId);
    if (result.success) {
      setContextMessages(result.context || []);
    }
  };

  useEffect(() => {
    setPendingPlan(null);
    setPendingInstruction('');
    setPendingProviderId('');
    setLastResult(null);
    setError('');
    setStatusText('Idle');
    loadContext();
  }, [sessionId]);

  const runWithStatus = async <T,>(id: string, work: () => Promise<T>): Promise<T> => {
    const cleanup = window.electronAPI.agent.onStatus(id, ({ status, detail }) => {
      setStatusText(formatStatus(status, detail));
    });
    try {
      return await work();
    } finally {
      cleanup();
    }
  };

  const executePlan = async (
    plan: AgentPlan,
    input: string,
    approved: boolean,
    provider: LLMProviderConfig | null,
  ) => {
    if (!provider) {
      setError('Configure an LLM provider in Settings first');
      return;
    }

    setBusy(true);
    setError('');
    setLastResult(null);
    const id = requestId();

    try {
      const result = await runWithStatus(id, () => window.electronAPI.agent.executePlan({
        requestId: id,
        sessionId,
        input,
        config: provider,
        plan,
        approved,
      }));

      if (!result.success || !result.result) {
        setError(result.error || 'Execution failed');
        if (result.plan) {
          setPendingPlan(result.plan);
          setPendingInstruction(input);
          setPendingProviderId(provider.id);
        }
        if (result.context) {
          setContextMessages(result.context);
        }
        return;
      }

      setLastResult(result.result);
      setContextMessages(result.context || []);
      setPendingPlan(null);
      setPendingInstruction('');
      setPendingProviderId('');
      setInstruction('');
      setStatusText(result.result.exitCode === 0 ? 'Execution finished' : `Finished with exit ${result.result.exitCode ?? 'unknown'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const provider = selectedProvider;
    const input = instruction.trim();

    if (!provider) {
      setError('Configure an LLM provider in Settings first');
      return;
    }
    if (!input) {
      setError('Instruction is required');
      return;
    }

    setBusy(true);
    setError('');
    setPendingPlan(null);
    setPendingProviderId('');
    setLastResult(null);
    const id = requestId();

    try {
      const result = await runWithStatus(id, () => window.electronAPI.agent.createPlan({
        requestId: id,
        sessionId,
        input,
        config: provider,
      }));

      if (!result.success || !result.plan) {
        setError(result.error || 'Planning failed');
        return;
      }

      setContextMessages(result.context || []);

      if (!result.plan.needExecute) {
        setInstruction('');
        setStatusText('Answered from context');
        return;
      }

      setPendingPlan(result.plan);
      setPendingInstruction(input);
      setPendingProviderId(provider.id);

      if (provider.approvalMode === 'auto_accept' && !result.plan.approval.required) {
        await executePlan(result.plan, input, true, provider);
      } else {
        setStatusText(result.plan.approval.required ? 'Waiting for approval' : 'Plan ready');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClearContext = async () => {
    await window.electronAPI.agent.clearContext(sessionId);
    setContextMessages([]);
    setPendingPlan(null);
    setPendingInstruction('');
    setPendingProviderId('');
    setLastResult(null);
    setStatusText('Context cleared');
  };

  const applySlashCommand = (command: SlashCommand) => {
    if (command.action === 'clear-context') {
      handleClearContext();
      setInstruction('');
      setSlashIndex(0);
      return;
    }

    if (command.action === 'refresh-context') {
      loadContext();
      setInstruction('');
      setStatusText('Context refreshed');
      setSlashIndex(0);
      return;
    }

    if (!command.prompt) {
      return;
    }

    const match = instruction.match(/(?:^|\s)\/([a-z]*)$/i);
    if (!match || typeof match.index !== 'number') {
      setInstruction(command.prompt);
      return;
    }

    const prefix = instruction.slice(0, match.index);
    const separator = prefix && !prefix.endsWith('\n') ? ' ' : '';
    setInstruction(`${prefix}${separator}${command.prompt}`);
    setSlashIndex(0);
  };

  const handleInstructionKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSlashCommands) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        event.currentTarget.form?.requestSubmit();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSlashIndex((index) => (index + 1) % slashCommands.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSlashIndex((index) => (index - 1 + slashCommands.length) % slashCommands.length);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      applySlashCommand(slashCommands[slashIndex] || slashCommands[0]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setInstruction((value) => value.replace(/(?:^|\s)\/([a-z]*)$/i, ''));
    }
  };

  const pendingProvider = llmProviders.find((provider) => provider.id === pendingProviderId) || selectedProvider;

  return (
    <div className="agent-panel">
      <div className="agent-toolbar acrylic">
        <div>
          <strong>AI Agent</strong>
          <span>{selectedProvider ? `${statusText} - ${providerTitle(selectedProvider)}` : statusText}</span>
        </div>
        <div className="agent-toolbar-actions">
          <button type="button" onClick={loadContext} disabled={busy}>Refresh</button>
          <button type="button" onClick={handleClearContext} disabled={busy}>Clear Context</button>
        </div>
      </div>

      {error && <div className="agent-error">{error}</div>}

      <div className="agent-history">
        {contextMessages.length === 0 && !pendingPlan && !lastResult ? (
          <div className="agent-empty">No context</div>
        ) : (
          contextMessages.map((message, index) => (
            <article className={`agent-message ${message.role}`} key={`${message.timestamp}:${index}`}>
              <header>
                <span>{message.role === 'user' ? 'Instruction' : 'Agent'}</span>
                <time>{formatTime(message.timestamp)}</time>
              </header>
              <pre>{message.content}</pre>
            </article>
          ))
        )}

        {pendingPlan && (
          <article className={`agent-plan ${pendingPlan.risk.isDangerous ? 'danger' : ''}`}>
            <header>
              <strong>Pending Command</strong>
              <span>{commandRiskText}</span>
            </header>
            <pre>{pendingPlan.command}</pre>
            <p>{pendingPlan.explanation}</p>
            <div className="agent-plan-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setPendingPlan(null);
                  setPendingInstruction('');
                  setPendingProviderId('');
                  setStatusText('Command rejected');
                }}
                disabled={busy}
              >
                Reject
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={() => executePlan(pendingPlan, pendingInstruction, true, pendingProvider)}
                disabled={busy}
              >
                Execute
              </button>
            </div>
          </article>
        )}

        {lastResult && (
          <article className={`agent-result ${lastResult.exitCode === 0 ? '' : 'danger'}`}>
            <header>
              <strong>Last Result</strong>
              <span>Exit {lastResult.exitCode ?? 'unknown'}</span>
            </header>
            <pre>{lastResult.output || '(no output)'}</pre>
          </article>
        )}
      </div>

      <form className="agent-input" onSubmit={handleSubmit}>
        <div className="agent-composer">
          {showSlashCommands && (
            <div className="slash-menu">
              {slashCommands.map((command, index) => (
                <button
                  type="button"
                  key={command.id}
                  className={`slash-item ${index === slashIndex ? 'active' : ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySlashCommand(command);
                  }}
                >
                  <strong>{command.title}</strong>
                  <span>{command.description}</span>
                </button>
              ))}
            </div>
          )}
          <div className="composer-toolbar">
            <label className="agent-model-picker">
              <span>LLM</span>
              <select
                value={selectedProvider?.id || ''}
                onChange={(event) => onActiveLlmProviderChange(event.target.value)}
                disabled={busy || llmProviders.length === 0}
              >
                {llmProviders.length === 0 ? (
                  <option value="">No LLM configured</option>
                ) : (
                  llmProviders.map((provider) => (
                    <option value={provider.id} key={provider.id}>
                      {providerTitle(provider)}
                    </option>
                  ))
                )}
              </select>
            </label>
            <span className="slash-hint">Type / for commands</span>
          </div>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleInstructionKeyDown}
            placeholder="Describe what to do on this SSH server..."
            disabled={busy || !selectedProvider}
          />
        </div>
        <button type="submit" className="primary-btn" disabled={busy || !selectedProvider}>
          {busy ? 'Running' : 'Run'}
        </button>
      </form>

      <style>{`
        .agent-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: var(--solid-surface);
          color: var(--text-primary);
          overflow: hidden;
        }

        .agent-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-top: none;
          border-left: none;
          border-right: none;
          border-radius: 0;
          box-shadow: none;
          flex-shrink: 0;
        }

        .agent-toolbar strong {
          display: block;
          font-size: 13px;
          font-weight: 700;
        }

        .agent-toolbar span {
          display: block;
          margin-top: 2px;
          color: var(--text-muted);
          font-size: 11px;
          max-width: 560px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .agent-toolbar-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        .agent-toolbar-actions button,
        .secondary-btn,
        .primary-btn {
          height: 32px;
          padding: 0 12px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
        }

        .agent-toolbar-actions button,
        .secondary-btn {
          border: 1px solid var(--border-color);
          background: var(--solid-surface-2);
          color: var(--text-primary);
        }

        .primary-btn {
          border: 1px solid var(--accent);
          background: var(--accent);
          color: var(--btn-text);
        }

        .agent-toolbar-actions button:hover:not(:disabled),
        .secondary-btn:hover:not(:disabled) {
          border-color: var(--accent);
          color: var(--accent);
        }

        .primary-btn:hover:not(:disabled) {
          background: var(--accent-hover);
        }

        .agent-toolbar-actions button:disabled,
        .secondary-btn:disabled,
        .primary-btn:disabled {
          opacity: 0.55;
          cursor: default;
        }

        .agent-error {
          margin: 10px 12px 0;
          padding: 9px 10px;
          border: 1px solid rgba(248, 81, 73, 0.3);
          border-radius: var(--radius-sm);
          background: var(--danger-subtle);
          color: var(--danger);
          font-size: 12px;
        }

        .agent-history {
          flex: 1;
          overflow: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .agent-empty {
          margin: auto;
          color: var(--text-muted);
          font-size: 13px;
        }

        .agent-message,
        .agent-plan,
        .agent-result {
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          background: var(--solid-surface-2);
          padding: 10px;
        }

        .agent-message.user {
          border-color: rgba(88, 166, 255, 0.24);
          background: var(--accent-subtle);
        }

        .agent-plan {
          border-color: rgba(210, 153, 34, 0.42);
          background: rgba(210, 153, 34, 0.08);
        }

        .agent-plan.danger,
        .agent-result.danger {
          border-color: rgba(248, 81, 73, 0.34);
          background: var(--danger-subtle);
        }

        .agent-message header,
        .agent-plan header,
        .agent-result header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }

        .agent-message pre,
        .agent-plan pre,
        .agent-result pre {
          margin: 0;
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--text-primary);
          font-family: "Cascadia Code", Consolas, monospace;
          font-size: 12px;
          line-height: 1.45;
        }

        .agent-plan p {
          margin-top: 8px;
          color: var(--text-secondary);
          font-size: 12px;
          line-height: 1.45;
        }

        .agent-plan-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 10px;
        }

        .agent-input {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: stretch;
          padding: 12px;
          border-top: 1px solid var(--border-color);
          background: var(--solid-surface);
          flex-shrink: 0;
        }

        .agent-composer {
          position: relative;
          min-width: 0;
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          background: var(--solid-surface-2);
          overflow: visible;
        }

        .agent-composer:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px var(--accent-subtle);
        }

        .composer-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 34px;
          padding: 7px 8px 6px;
          border-bottom: 1px solid var(--border-color);
        }

        .agent-model-picker {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
          max-width: min(420px, 58%);
        }

        .agent-model-picker span {
          color: var(--text-muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          flex-shrink: 0;
        }

        .agent-model-picker select {
          min-width: 170px;
          max-width: 100%;
          height: 26px;
          padding: 0 8px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--solid-surface);
          color: var(--text-primary);
          font-size: 12px;
        }

        .slash-hint {
          color: var(--text-muted);
          font-size: 11px;
          white-space: nowrap;
        }

        .agent-input textarea {
          display: block;
          width: 100%;
          min-height: 70px;
          max-height: 180px;
          padding: 10px;
          border: none;
          border-radius: 0 0 var(--radius) var(--radius);
          background: transparent;
          color: var(--text-primary);
          font-size: 12px;
          resize: vertical;
          line-height: 1.45;
        }

        .agent-model-picker select:focus,
        .agent-input textarea:focus {
          box-shadow: none;
        }

        .agent-input .primary-btn {
          min-width: 92px;
          height: 100%;
          min-height: 112px;
        }

        .slash-menu {
          position: absolute;
          left: 0;
          right: 0;
          bottom: calc(100% + 8px);
          z-index: 20;
          max-height: 260px;
          overflow: auto;
          padding: 6px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          background: var(--solid-surface);
          box-shadow: var(--shadow-sm);
        }

        .slash-item {
          width: 100%;
          display: grid;
          grid-template-columns: 110px minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          min-height: 34px;
          padding: 7px 9px;
          border: none;
          border-radius: var(--radius-sm);
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          text-align: left;
        }

        .slash-item:hover,
        .slash-item.active {
          background: var(--accent-subtle);
          color: var(--text-primary);
        }

        .slash-item strong {
          color: var(--accent);
          font-family: "Cascadia Code", Consolas, monospace;
          font-size: 12px;
        }

        .slash-item span {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
