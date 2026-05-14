import { SSHManager, CommandExecutionDetails } from './ssh';

type ApprovalMode = 'manual' | 'auto_accept';
type AgentRole = 'user' | 'assistant';
type StatusCallback = (status: string, detail: string) => void;

export interface AgentConfig {
  llmApiKey?: string;
  llmBaseUrl?: string;
  llmModel?: string;
  approvalMode?: ApprovalMode;
  temperature?: number;
  maxContextMessages?: number;
  maxRetries?: number;
}

export interface AgentPlanRequest {
  requestId?: string;
  sessionId: string;
  input: string;
  config: AgentConfig;
}

export interface AgentExecuteRequest {
  requestId?: string;
  sessionId: string;
  input: string;
  config: AgentConfig;
  plan: LLMCommandResponse;
  approved?: boolean;
}

export interface CommandRisk {
  isDangerous: boolean;
  reasons: string[];
}

export interface CommandApproval {
  approved: boolean;
  risk: CommandRisk;
  required: boolean;
  mode: ApprovalMode;
}

export interface LLMCommandResponse {
  needExecute: boolean;
  command: string;
  explanation: string;
}

export interface AgentPlan extends LLMCommandResponse {
  risk: CommandRisk;
  approval: CommandApproval;
}

export interface AgentContextMessage {
  role: AgentRole;
  content: string;
  timestamp: number;
}

interface NormalizedAgentConfig {
  llmApiKey: string;
  llmBaseUrl: string;
  llmModel: string;
  approvalMode: ApprovalMode;
  temperature: number;
  maxContextMessages: number;
  maxRetries: number;
}

const DEFAULT_SYSTEM_PROMPT = `You are an expert SSH server assistant operating on a remote Linux server.
Your job is to help the user by analyzing their request and either:
1. Answering directly if no command execution is needed
2. Executing appropriate shell commands on the server and then explaining the results

Rules:
- Keep commands concise, non-interactive, and safe
- Prefer read-only diagnostic commands unless the user explicitly asks for changes
- Quote file paths safely when they contain spaces or special characters
- Do not run interactive commands (those that prompt for input)`;

const PLANNING_SUFFIX = `
CRITICAL: You MUST ALWAYS respond with ONLY a single valid JSON object. No natural language before or after the JSON. No greetings. No Markdown code blocks. No extra text.

The exact JSON schema is:
{"need_execute": boolean, "command": string, "explanation": string}

Rules:
- need_execute=true: when the user wants to check, inspect, or do anything on the server. Provide a valid, non-interactive shell command in the "command" field.
- need_execute=false: only for pure conversational questions that need no server interaction (e.g. "hello", "who are you", "what can you do"). Put your answer in the "explanation" field.
- If unsure, use need_execute=true with a safe diagnostic command.
- Output raw JSON only. No extra keys. No extra text.`;

const REPLY_SUFFIX = `
You have just executed a command on the server. Based on the execution results in the conversation history, provide a clear and helpful response to the user's request. Summarize what was found or done, and explain any important details. Be concise but thorough.`;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AgentManager {
  private contexts: Map<string, AgentContextMessage[]> = new Map();

  constructor(private sshManager: SSHManager) {}

  getContext(sessionId: string): AgentContextMessage[] {
    return [...(this.contexts.get(sessionId) || [])];
  }

  clearContext(sessionId: string): void {
    this.contexts.delete(sessionId);
  }

  async createPlan(request: AgentPlanRequest, onStatus?: StatusCallback): Promise<{
    success: boolean;
    plan?: AgentPlan;
    context?: AgentContextMessage[];
    error?: string;
  }> {
    try {
      const input = this.normalizeInput(request.input);
      const config = this.normalizeConfig(request.config);

      onStatus?.('thinking', config.llmModel);
      const response = await this.generatePlan(request.sessionId, input, config);
      const risk = this.analyzeCommandRisk(response.command);
      const approval = this.createApproval(config, risk, false, response.needExecute);
      const plan: AgentPlan = { ...response, risk, approval };

      this.appendContext(request.sessionId, {
        role: 'user',
        content: input,
        timestamp: Date.now(),
      }, config.maxContextMessages);

      if (!plan.needExecute) {
        this.appendContext(request.sessionId, {
          role: 'assistant',
          content: plan.explanation,
          timestamp: Date.now(),
        }, config.maxContextMessages);
      }

      onStatus?.('thinking_done', response.command || response.explanation);
      return {
        success: true,
        plan,
        context: this.getContext(request.sessionId),
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Agent plan failed' };
    }
  }

  async executePlan(request: AgentExecuteRequest, onStatus?: StatusCallback): Promise<{
    success: boolean;
    result?: {
      needExecute: boolean;
      command: string;
      explanation: string;
      output: string;
      exitCode: number | null;
      signal?: string;
      approval: CommandApproval;
      attempts: Array<{ command: string; output: string; exitCode: number | null }>;
    };
    plan?: AgentPlan;
    context?: AgentContextMessage[];
    error?: string;
  }> {
    try {
      const input = this.normalizeInput(request.input);
      const config = this.normalizeConfig(request.config);
      let plan: LLMCommandResponse = {
        needExecute: Boolean(request.plan.needExecute),
        command: String(request.plan.command || '').trim(),
        explanation: String(request.plan.explanation || '').trim(),
      };
      const initialRisk = this.analyzeCommandRisk(plan.command);
      const initialApproval = this.createApproval(config, initialRisk, Boolean(request.approved), plan.needExecute);

      if (initialApproval.required && !request.approved) {
        return {
          success: false,
          error: 'Command requires approval',
          plan: { ...plan, risk: initialRisk, approval: initialApproval },
        };
      }

      if (!plan.needExecute) {
        return {
          success: true,
          result: {
            needExecute: false,
            command: '',
            explanation: plan.explanation,
            output: plan.explanation,
            exitCode: 0,
            approval: initialApproval,
            attempts: [],
          },
          context: this.getContext(request.sessionId),
        };
      }

      const attempts: Array<{ command: string; output: string; exitCode: number | null }> = [];
      let execution: CommandExecutionDetails = { output: '', exitCode: null };
      let approval = initialApproval;

      for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
        const risk = this.analyzeCommandRisk(plan.command);
        approval = this.createApproval(config, risk, attempt === 0 && Boolean(request.approved), true);
        if (approval.required && !approval.approved) {
          return {
            success: false,
            error: attempt === 0 ? 'Command requires approval' : 'Retry command requires approval',
            plan: { ...plan, risk, approval },
          };
        }

        onStatus?.('executing', plan.command);
        execution = await this.sshManager.executeDetailed(request.sessionId, plan.command);
        attempts.push({
          command: plan.command,
          output: execution.output,
          exitCode: execution.exitCode,
        });

        if (execution.exitCode === 0 || attempt >= config.maxRetries) {
          break;
        }

        onStatus?.('retrying', String(attempt + 1));
        this.appendContext(request.sessionId, {
          role: 'assistant',
          content: [
            `Command failed: ${plan.command}`,
            `Exit code: ${execution.exitCode ?? 'unknown'}`,
            'Output:',
            truncate(execution.output || '(no output)', 3000),
          ].join('\n'),
          timestamp: Date.now(),
        }, config.maxContextMessages);

        const retryPlan = await this.generateRetryPlan(
          request.sessionId,
          input,
          plan,
          execution,
          config,
          attempt + 1,
        );

        if (!retryPlan.needExecute || !retryPlan.command.trim()) {
          break;
        }

        const retryRisk = this.analyzeCommandRisk(retryPlan.command);
        const retryApproval = this.createApproval(config, retryRisk, false, true);
        if (retryApproval.required) {
          return {
            success: false,
            error: 'Retry command requires approval',
            plan: { ...retryPlan, risk: retryRisk, approval: retryApproval },
            context: this.getContext(request.sessionId),
          };
        }

        plan = retryPlan;
      }

      const resultContent = [
        `Executed command: ${plan.command}`,
        `Exit code: ${execution.exitCode ?? 'unknown'}`,
        execution.signal ? `Signal: ${execution.signal}` : '',
        'Output:',
        truncate(execution.output || '(no output)', 5000),
      ].filter(Boolean).join('\n');

      this.appendContext(request.sessionId, {
        role: 'assistant',
        content: resultContent,
        timestamp: Date.now(),
      }, config.maxContextMessages);

      onStatus?.('thinking', config.llmModel);
      const replyContent = await this.generateReply(request.sessionId, config);

      this.appendContext(request.sessionId, {
        role: 'assistant',
        content: replyContent,
        timestamp: Date.now(),
      }, config.maxContextMessages);

      onStatus?.('executing_done', plan.command);
      return {
        success: true,
        result: {
          needExecute: true,
          command: plan.command,
          explanation: plan.explanation,
          output: execution.output,
          exitCode: execution.exitCode,
          signal: execution.signal,
          approval,
          attempts,
        },
        context: this.getContext(request.sessionId),
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Agent execution failed' };
    }
  }

  analyzeCommandRisk(command: string): CommandRisk {
    const trimmed = command.trim();
    if (!trimmed) {
      return { isDangerous: false, reasons: [] };
    }

    const rules: Array<{ pattern: RegExp; reason: string }> = [
      { pattern: /\brm\s+[^;&|]*-[^;&|]*r[^;&|]*f|rm\s+[^;&|]*-[^;&|]*f[^;&|]*r/i, reason: 'Recursive or forced delete' },
      { pattern: /\b(mkfs|fdisk|parted|wipefs|dd)\b/i, reason: 'Disk or partition modification' },
      { pattern: /\bchmod\s+(-R\s+)?777\s+\//i, reason: 'Broad permission change' },
      { pattern: /\b(chown|chmod)\s+(-R\s+)?[^;&|]*\s+\//i, reason: 'Recursive system path ownership or permission change' },
      { pattern: /\b(reboot|shutdown|halt|poweroff)\b/i, reason: 'Power or reboot operation' },
      { pattern: /\b(iptables|nft|ufw|firewall-cmd)\b/i, reason: 'Firewall modification' },
      { pattern: /\b(apt|apt-get|yum|dnf|zypper|pacman)\s+[^;&|]*(remove|purge|upgrade|dist-upgrade|autoremove|update)\b/i, reason: 'Package removal or upgrade' },
      { pattern: /\b(curl|wget)\b[^;&|]*\|\s*(sh|bash|zsh|fish)\b/i, reason: 'Downloaded script execution' },
      { pattern: /\bsudo\b/i, reason: 'Privilege escalation' },
      { pattern: />\s*\/etc\/|>>\s*\/etc\//i, reason: 'Writes to system configuration' },
    ];

    const reasons = rules
      .filter((rule) => rule.pattern.test(trimmed))
      .map((rule) => rule.reason);

    return {
      isDangerous: reasons.length > 0,
      reasons,
    };
  }

  private async generatePlan(
    sessionId: string,
    input: string,
    config: NormalizedAgentConfig,
  ): Promise<LLMCommandResponse> {
    const messages = this.buildMessages(sessionId, config, true, input);
    const content = await this.callLLM(config, messages);
    return this.parseCommandResponse(content);
  }

  private async generateRetryPlan(
    sessionId: string,
    input: string,
    plan: LLMCommandResponse,
    execution: CommandExecutionDetails,
    config: NormalizedAgentConfig,
    attempt: number,
  ): Promise<LLMCommandResponse> {
    const retryInput = [
      `Retry attempt ${attempt}.`,
      `Original request: ${input}`,
      `Previous command: ${plan.command}`,
      `Previous explanation: ${plan.explanation}`,
      `Exit code: ${execution.exitCode ?? 'unknown'}`,
      'Previous output:',
      truncate(execution.output || '(no output)', 4000),
      'Return corrected JSON for one next command, or need_execute false if no retry should be attempted.',
    ].join('\n');

    const messages = this.buildMessages(sessionId, config, true, retryInput);
    const content = await this.callLLM(config, messages);
    return this.parseCommandResponse(content);
  }

  private async generateReply(
    sessionId: string,
    config: NormalizedAgentConfig,
  ): Promise<string> {
    const messages = this.buildMessages(sessionId, config, false);
    const content = await this.callLLM(config, messages);
    return content.trim();
  }

  private buildMessages(
    sessionId: string,
    config: NormalizedAgentConfig,
    forPlanning: boolean,
    extraInput?: string,
  ): ChatMessage[] {
    const context = this.getContext(sessionId).slice(-config.maxContextMessages);
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: forPlanning
          ? `${DEFAULT_SYSTEM_PROMPT}${PLANNING_SUFFIX}`
          : `${DEFAULT_SYSTEM_PROMPT}${REPLY_SUFFIX}`,
      },
      ...context.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ];
    if (extraInput) {
      messages.push({ role: 'user', content: extraInput });
    }
    return messages;
  }

  private async callLLM(config: NormalizedAgentConfig, messages: ChatMessage[]): Promise<string> {
    const url = `${config.llmBaseUrl.replace(/\/+$/, '')}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.llmApiKey) {
      headers.Authorization = `Bearer ${config.llmApiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.llmModel,
        temperature: config.temperature,
        messages,
      }),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`LLM request failed (${response.status}): ${truncate(text, 800)}`);
    }

    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`LLM returned invalid JSON envelope: ${truncate(text, 800)}`);
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('LLM returned an empty message');
    }

    return content;
  }

  private parseCommandResponse(content: string): LLMCommandResponse {
    const jsonText = extractJson(content);
    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      // Fallback: treat natural language as a non-executable explanation
      return {
        needExecute: false,
        command: '',
        explanation: content.trim(),
      };
    }

    const needExecute = Boolean(parsed.need_execute ?? parsed.needExecute);
    const command = typeof parsed.command === 'string' ? parsed.command.trim() : '';
    const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '';

    if (needExecute && !command) {
      throw new Error('LLM requested execution but did not return a command');
    }

    return {
      needExecute,
      command,
      explanation: explanation || (needExecute ? `Run: ${command}` : 'No command is needed.'),
    };
  }

  private createApproval(
    config: NormalizedAgentConfig,
    risk: CommandRisk,
    approved: boolean,
    needExecute: boolean,
  ): CommandApproval {
    const required = needExecute && (config.approvalMode === 'manual' || risk.isDangerous);
    return {
      approved: !required || approved,
      risk,
      required,
      mode: config.approvalMode,
    };
  }

  private normalizeConfig(config: AgentConfig): NormalizedAgentConfig {
    const approvalMode = config.approvalMode === 'auto_accept' ? 'auto_accept' : 'manual';
    return {
      llmApiKey: String(config.llmApiKey || '').trim(),
      llmBaseUrl: String(config.llmBaseUrl || 'https://api.openai.com/v1').trim() || 'https://api.openai.com/v1',
      llmModel: String(config.llmModel || 'gpt-4').trim() || 'gpt-4',
      approvalMode,
      temperature: clampNumber(config.temperature, 0, 2, 0.1),
      maxContextMessages: Math.round(clampNumber(config.maxContextMessages, 0, 100, 20)),
      maxRetries: Math.round(clampNumber(config.maxRetries, 0, 5, 3)),
    };
  }

  private normalizeInput(input: string): string {
    const normalized = String(input || '').trim();
    if (!normalized) {
      throw new Error('Instruction is required');
    }
    return normalized;
  }

  private appendContext(sessionId: string, message: AgentContextMessage, maxContextMessages: number): void {
    const current = this.contexts.get(sessionId) || [];
    current.push(message);
    const limit = Math.max(0, maxContextMessages);
    this.contexts.set(sessionId, limit > 0 ? current.slice(-limit) : []);
  }

}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\n...[truncated]`;
}

function extractJson(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}
