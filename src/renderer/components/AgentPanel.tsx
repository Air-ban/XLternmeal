import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
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

export interface AgentContextMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface AgentSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentContextMessage[];
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

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return formatTime(timestamp);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function providerTitle(provider: LLMProviderConfig): string {
  return `${provider.name} / ${provider.llmModel}`;
}

function MarkdownContent({ text }: { text: string }): React.ReactElement {
  const html = useMemo(() => {
    return marked.parse(text, { async: false, gfm: true, breaks: true }) as string;
  }, [text]);
  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

function historyKey(sessionId: string): string {
  return `xlterm-agent-sessions-${sessionId}`;
}

function loadSessions(sessionId: string): AgentSession[] {
  try {
    const raw = localStorage.getItem(historyKey(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is AgentSession => (
      typeof s?.id === 'string' &&
      typeof s?.title === 'string' &&
      Array.isArray(s?.messages)
    ));
  } catch {
    return [];
  }
}

function saveSessions(sessionId: string, sessions: AgentSession[]) {
  localStorage.setItem(historyKey(sessionId), JSON.stringify(sessions));
}

function generateTitle(messages: AgentContextMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (firstUser) {
    const text = firstUser.content.trim();
    if (text.length > 0) {
      return text.length > 30 ? `${text.slice(0, 30)}...` : text;
    }
  }
  return 'New Session';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('Idle');
  const [slashIndex, setSlashIndex] = useState(0);

  const [sessions, setSessions] = useState<AgentSession[]>(() => loadSessions(sessionId));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

  const historyRef = useRef<HTMLDivElement>(null);

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

  const currentSessionTitle = useMemo(() => {
    if (!activeSessionId) return 'New Session';
    const s = sessions.find((x) => x.id === activeSessionId);
    return s?.title || 'New Session';
  }, [activeSessionId, sessions]);

  useEffect(() => {
    if (selectedProvider && selectedProvider.id !== activeLlmProviderId) {
      onActiveLlmProviderChange(selectedProvider.id);
    }
  }, [activeLlmProviderId, onActiveLlmProviderChange, selectedProvider]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  useEffect(() => {
    historyRef.current?.scrollTo({ top: historyRef.current.scrollHeight, behavior: 'smooth' });
  }, [contextMessages, pendingPlan, error]);

  const syncSessionToStorage = useCallback((messages: AgentContextMessage[], sessionIdToSync?: string) => {
    const sid = sessionIdToSync || activeSessionId;
    if (!sid) return;
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === sid);
      const title = existing?.title || generateTitle(messages);
      const updated: AgentSession = {
        id: sid,
        title,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
        messages: [...messages],
      };
      const next = [updated, ...prev.filter((s) => s.id !== sid)];
      saveSessions(sessionId, next);
      return next;
    });
  }, [activeSessionId, sessionId]);

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
    setError('');
    setStatusText('Idle');
    setActiveSessionId(null);
    setSessions(loadSessions(sessionId));
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
          syncSessionToStorage(result.context);
        }
        return;
      }

      const nextMessages = result.context || [];
      setContextMessages(nextMessages);
      syncSessionToStorage(nextMessages);
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

    const optimisticMessage: AgentContextMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };
    setContextMessages((prev) => [...prev, optimisticMessage]);

    setBusy(true);
    setError('');
    setPendingPlan(null);
    setPendingProviderId('');
    const id = requestId();

    let currentActiveId = activeSessionId;
    if (!currentActiveId) {
      currentActiveId = requestId();
      setActiveSessionId(currentActiveId);
    }

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

      const nextMessages = result.context || [];
      setContextMessages(nextMessages);
      syncSessionToStorage(nextMessages, currentActiveId);

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
    setActiveSessionId(null);
    setStatusText('Context cleared');
  };

  const handleNewSession = useCallback(async () => {
    await window.electronAPI.agent.clearContext(sessionId);
    setContextMessages([]);
    setPendingPlan(null);
    setPendingInstruction('');
    setPendingProviderId('');
    setActiveSessionId(null);
    setError('');
    setStatusText('Idle');
  }, [sessionId]);

  const handleLoadSession = useCallback((session: AgentSession) => {
    setActiveSessionId(session.id);
    setContextMessages([...session.messages]);
    setPendingPlan(null);
    setPendingInstruction('');
    setPendingProviderId('');
    setError('');
    setStatusText('Idle');
  }, []);

  const handleDeleteSession = useCallback((id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSessions(sessionId, next);
      return next;
    });
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setContextMessages([]);
    }
  }, [activeSessionId, sessionId]);

  const handleStartEditTitle = useCallback((session: AgentSession, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingTitleId(session.id);
    setEditTitleValue(session.title);
  }, []);

  const handleSaveTitle = useCallback(() => {
    if (!editingTitleId) return;
    const trimmed = editTitleValue.trim();
    if (!trimmed) {
      setEditingTitleId(null);
      return;
    }
    setSessions((prev) => {
      const next = prev.map((s) => s.id === editingTitleId ? { ...s, title: trimmed, updatedAt: Date.now() } : s);
      saveSessions(sessionId, next);
      return next;
    });
    setEditingTitleId(null);
  }, [editingTitleId, editTitleValue, sessionId]);

  const handleTitleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSaveTitle();
    } else if (event.key === 'Escape') {
      setEditingTitleId(null);
    }
  }, [handleSaveTitle]);

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
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
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
      <aside className="agent-sidebar">
        <div className="agent-sidebar-header">
          <button type="button" className="new-session-btn" onClick={handleNewSession} title="New Session">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>New</span>
          </button>
        </div>
        <div className="agent-sidebar-list">
          {sessions.length === 0 ? (
            <div className="agent-sidebar-empty">No history</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`agent-sidebar-item ${activeSessionId === session.id ? 'active' : ''}`}
                onClick={() => handleLoadSession(session)}
                title={session.title}
              >
                {editingTitleId === session.id ? (
                  <input
                    className="agent-sidebar-edit"
                    value={editTitleValue}
                    onChange={(e) => setEditTitleValue(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    onBlur={handleSaveTitle}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <>
                    <div className="agent-sidebar-item-top">
                      <span className="agent-sidebar-title">{session.title}</span>
                      <span className="agent-sidebar-date">{formatDate(session.updatedAt)}</span>
                    </div>
                    <div className="agent-sidebar-item-meta">
                      <span>{session.messages.length} messages</span>
                    </div>
                  </>
                )}
                {editingTitleId !== session.id && (
                  <div className="agent-sidebar-item-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={(e) => handleStartEditTitle(session, e)}
                      title="Rename"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      title="Delete"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <path d="M3 4h10M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M5.5 7v5M8 7v5M10.5 7v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="agent-main">
        <div className="agent-toolbar acrylic">
          <div>
            <strong>{currentSessionTitle}</strong>
            <span>{selectedProvider ? `${statusText} - ${providerTitle(selectedProvider)}` : statusText}</span>
          </div>
          <div className="agent-toolbar-actions">
            <button type="button" onClick={loadContext} disabled={busy}>Refresh</button>
            <button type="button" onClick={handleClearContext} disabled={busy}>Clear Context</button>
          </div>
        </div>

        {error && <div className="agent-error">{error}</div>}

        <div className="agent-history" ref={historyRef}>
          {contextMessages.length === 0 && !pendingPlan ? (
            <div className="agent-empty">
              <div className="agent-empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor" fillOpacity="0.2" />
                  <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p>Start a new conversation with the AI Agent</p>
              <p className="agent-empty-hint">Type / for quick commands</p>
            </div>
          ) : (
            contextMessages.map((message, index) => (
              <article className={`agent-message ${message.role}`} key={`${message.timestamp}:${index}`}>
                <header>
                  <span>{message.role === 'user' ? 'Instruction' : 'Agent'}</span>
                  <time>{formatTime(message.timestamp)}</time>
                </header>
                <MarkdownContent text={message.content} />
              </article>
            ))
          )}

          {pendingPlan && (
            <article className={`agent-plan ${pendingPlan.risk.isDangerous ? 'danger' : ''}`}>
              <header>
                <strong>Pending Command</strong>
                <span>{commandRiskText}</span>
              </header>
              <pre className="code-block">{pendingPlan.command}</pre>
              <MarkdownContent text={pendingPlan.explanation} />
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

          {busy && !pendingPlan && (
            <article className="agent-message assistant typing">
              <header>
                <span>Agent</span>
                <span className="typing-status">Thinking...</span>
              </header>
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
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
              <span className="slash-hint">Enter to send · Shift+Enter for newline · Type / for commands</span>
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
      </div>

      <style>{`
        .agent-panel {
          height: 100%;
          display: flex;
          background: var(--solid-surface);
          color: var(--text-primary);
          overflow: hidden;
        }

        .agent-sidebar {
          width: 220px;
          min-width: 220px;
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--border-color);
          background: var(--solid-surface-2);
          flex-shrink: 0;
        }

        .agent-sidebar-header {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-color);
          flex-shrink: 0;
        }

        .new-session-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 32px;
          padding: 0 12px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          background: var(--solid-surface);
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background var(--transition), border-color var(--transition);
        }

        .new-session-btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }

        .agent-sidebar-list {
          flex: 1;
          overflow-y: auto;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .agent-sidebar-empty {
          padding: 20px 12px;
          text-align: center;
          color: var(--text-muted);
          font-size: 12px;
        }

        .agent-sidebar-item {
          position: relative;
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background var(--transition);
          overflow: hidden;
        }

        .agent-sidebar-item:hover {
          background: var(--bg-tertiary);
        }

        .agent-sidebar-item.active {
          background: var(--accent-subtle);
        }

        .agent-sidebar-item-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 2px;
        }

        .agent-sidebar-title {
          flex: 1;
          min-width: 0;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .agent-sidebar-date {
          flex-shrink: 0;
          font-size: 10px;
          color: var(--text-muted);
          white-space: nowrap;
        }

        .agent-sidebar-item-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .agent-sidebar-item-meta span {
          font-size: 11px;
          color: var(--text-muted);
        }

        .agent-sidebar-item-actions {
          position: absolute;
          top: 4px;
          right: 4px;
          display: flex;
          gap: 2px;
          opacity: 0;
          transition: opacity var(--transition);
        }

        .agent-sidebar-item:hover .agent-sidebar-item-actions {
          opacity: 1;
        }

        .icon-btn {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: var(--radius-sm);
          background: var(--solid-surface);
          color: var(--text-secondary);
          cursor: pointer;
          padding: 0;
        }

        .icon-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .icon-btn.danger:hover {
          background: var(--danger-subtle);
          color: var(--danger);
        }

        .agent-sidebar-edit {
          width: 100%;
          height: 24px;
          padding: 0 6px;
          border: 1px solid var(--accent);
          border-radius: var(--radius-sm);
          background: var(--solid-surface);
          color: var(--text-primary);
          font-size: 12px;
          outline: none;
        }

        .agent-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
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
          flex-shrink: 0;
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
          text-align: center;
          color: var(--text-muted);
        }

        .agent-empty-icon {
          margin-bottom: 12px;
          color: var(--text-muted);
          opacity: 0.6;
        }

        .agent-empty p {
          font-size: 13px;
          margin: 0 0 4px;
        }

        .agent-empty-hint {
          font-size: 12px;
          opacity: 0.7;
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

        .agent-message.typing {
          border-color: rgba(88, 166, 255, 0.18);
          background: rgba(88, 166, 255, 0.04);
        }

        .typing-status {
          color: var(--accent);
          font-size: 11px;
          font-weight: 600;
          text-transform: none;
          letter-spacing: 0;
          animation: typing-pulse 1.5s ease-in-out infinite;
        }

        .typing-indicator {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 0;
        }

        .typing-indicator > span {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--accent);
          opacity: 0.35;
          animation: typing-bounce 1.2s ease-in-out infinite;
        }

        .typing-indicator > span:nth-child(2) {
          animation-delay: 0.15s;
        }

        .typing-indicator > span:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes typing-bounce {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.35;
          }
          30% {
            transform: translateY(-5px);
            opacity: 1;
          }
        }

        @keyframes typing-pulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }

        .markdown-body {
          font-size: 12px;
          line-height: 1.6;
          color: var(--text-primary);
        }

        .markdown-body h1,
        .markdown-body h2,
        .markdown-body h3,
        .markdown-body h4,
        .markdown-body h5,
        .markdown-body h6 {
          margin: 12px 0 8px;
          font-weight: 600;
          line-height: 1.3;
          color: var(--text-primary);
        }

        .markdown-body h1 { font-size: 16px; }
        .markdown-body h2 { font-size: 14px; }
        .markdown-body h3 { font-size: 13px; }
        .markdown-body h4,
        .markdown-body h5,
        .markdown-body h6 { font-size: 12px; }

        .markdown-body p {
          margin: 0 0 8px;
        }

        .markdown-body p:last-child {
          margin-bottom: 0;
        }

        .markdown-body pre {
          margin: 8px 0;
          padding: 10px 12px;
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.2);
          overflow-x: auto;
        }

        .markdown-body code {
          font-family: "Cascadia Code", Consolas, monospace;
          font-size: 11px;
          padding: 1px 4px;
          border-radius: 3px;
          background: rgba(0, 0, 0, 0.15);
        }

        .markdown-body pre code {
          padding: 0;
          background: transparent;
        }

        .markdown-body ul,
        .markdown-body ol {
          margin: 6px 0;
          padding-left: 20px;
        }

        .markdown-body li {
          margin: 2px 0;
        }

        .markdown-body blockquote {
          margin: 8px 0;
          padding: 6px 10px;
          border-left: 3px solid var(--accent);
          background: var(--accent-subtle);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        }

        .markdown-body blockquote p {
          margin: 0;
        }

        .markdown-body strong {
          font-weight: 600;
          color: var(--text-primary);
        }

        .markdown-body em {
          font-style: italic;
        }

        .markdown-body a {
          color: var(--accent);
          text-decoration: none;
        }

        .markdown-body a:hover {
          text-decoration: underline;
        }

        .markdown-body hr {
          border: none;
          border-top: 1px solid var(--border-color);
          margin: 10px 0;
        }

        .markdown-body table {
          border-collapse: collapse;
          margin: 8px 0;
          width: 100%;
          font-size: 11px;
        }

        .markdown-body th,
        .markdown-body td {
          border: 1px solid var(--border-color);
          padding: 5px 8px;
          text-align: left;
        }

        .markdown-body th {
          background: var(--solid-surface);
          font-weight: 600;
        }

        .code-block {
          margin: 8px 0 0;
          padding: 10px 12px;
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.2);
          color: var(--text-primary);
          font-family: "Cascadia Code", Consolas, monospace;
          font-size: 11px;
          line-height: 1.5;
          overflow-x: auto;
        }
      `}</style>
    </div>
  );
}
