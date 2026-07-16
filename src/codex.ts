import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import type { AgentEntry, StdinData, TodoItem, ToolEntry, TranscriptData, UsageData } from './types.js';

interface CodexLine {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

interface CodexUsagePayload {
  info?: {
    total_token_usage?: TokenUsage;
    last_token_usage?: TokenUsage;
    model_context_window?: number;
  } | null;
  rate_limits?: {
    limit_name?: string | null;
    primary?: CodexRateLimit;
    secondary?: CodexRateLimit;
    credits?: CodexCreditsPayload | null;
    plan_type?: string | null;
    rate_limit_reached_type?: string | null;
  } | null;
}

interface TokenUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  total_tokens?: number;
}

interface CodexRateLimit {
  used_percent?: number;
  resets_at?: number;
  window_minutes?: number;
}

interface CodexCreditsPayload {
  has_credits?: boolean;
  unlimited?: boolean;
  balance?: number | null;
}

export interface CodexSnapshot {
  stdin: StdinData;
  transcript: TranscriptData;
  usageData: UsageData | null;
  sessionPath: string;
}

export function findLatestCodexSession(root: string = path.join(os.homedir(), '.codex', 'sessions')): string | null {
  if (!fs.existsSync(root)) return null;

  let latest: { path: string; mtimeMs: number } | null = null;
  const stack = [root];

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        try {
          const stat = fs.statSync(fullPath);
          if (!latest || stat.mtimeMs > latest.mtimeMs) {
            latest = { path: fullPath, mtimeMs: stat.mtimeMs };
          }
        } catch {
          // Ignore files that disappear while scanning.
        }
      }
    }
  }

  return latest?.path ?? null;
}

export async function parseCodexSession(sessionPath: string): Promise<CodexSnapshot> {
  const transcript: TranscriptData = {
    tools: [],
    agents: [],
    todos: [],
  };

  const toolMap = new Map<string, ToolEntry>();
  const agentMap = new Map<string, AgentEntry>();
  let latestTodos: TodoItem[] = [];
  let cwd: string | undefined;
  let cliVersion: string | undefined;
  let usagePayload: CodexUsagePayload | null = null;

  if (!fs.existsSync(sessionPath)) {
    return {
      stdin: buildCodexStdin(undefined, undefined, null, sessionPath),
      transcript,
      usageData: null,
      sessionPath,
    };
  }

  try {
    const stream = fs.createReadStream(sessionPath);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as CodexLine;
        const timestamp = entry.timestamp ? new Date(entry.timestamp) : new Date();
        const payload = entry.payload;

        if (entry.type === 'session_meta' && payload) {
          cwd = asString(payload.cwd) ?? cwd;
          cliVersion = asString(payload.cli_version) ?? cliVersion;
          if (!transcript.sessionStart) {
            const startedAt = asString(payload.timestamp);
            transcript.sessionStart = startedAt ? new Date(startedAt) : timestamp;
          }
        }

        if (entry.type === 'turn_context' && payload) {
          cwd = asString(payload.cwd) ?? cwd;
        }

        if (payload?.type === 'token_count') {
          usagePayload = payload as CodexUsagePayload;
        }

        if (payload?.type === 'function_call') {
          processCodexFunctionCall(payload, timestamp, toolMap, agentMap, latestTodos);
        }

        if (payload?.type === 'function_call_output') {
          completeCodexCall(asString(payload.call_id), timestamp, toolMap, agentMap, false);
        }

        if (payload?.type === 'exec_command_end') {
          completeCodexExec(payload, timestamp, toolMap);
        }
      } catch {
        // Skip malformed JSONL rows.
      }
    }
  } catch {
    // Return partial data when the session file is being rotated or rewritten.
  }

  transcript.tools = Array.from(toolMap.values()).slice(-20);
  transcript.agents = Array.from(agentMap.values()).slice(-10);
  transcript.todos = latestTodos;

  return {
    stdin: buildCodexStdin(cwd, cliVersion, usagePayload, sessionPath),
    transcript,
    usageData: usagePayload ? toUsageData(usagePayload) : null,
    sessionPath,
  };
}

function buildCodexStdin(
  cwd: string | undefined,
  cliVersion: string | undefined,
  usagePayload: CodexUsagePayload | null,
  sessionPath: string,
): StdinData {
  const lastUsage = usagePayload?.info?.last_token_usage ?? usagePayload?.info?.total_token_usage;
  const cached = lastUsage?.cached_input_tokens ?? 0;
  const input = Math.max(0, (lastUsage?.input_tokens ?? lastUsage?.total_tokens ?? 0) - cached);
  const contextWindowSize = usagePayload?.info?.model_context_window;

  return {
    source: 'codex',
    cwd,
    cli_version: cliVersion,
    transcript_path: sessionPath,
    model: { display_name: readCodexModelName() },
    context_window: contextWindowSize
      ? {
          context_window_size: contextWindowSize,
          current_usage: {
            input_tokens: input,
            cache_read_input_tokens: cached,
          },
        }
      : undefined,
  };
}

function processCodexFunctionCall(
  payload: Record<string, unknown>,
  timestamp: Date,
  toolMap: Map<string, ToolEntry>,
  agentMap: Map<string, AgentEntry>,
  latestTodos: TodoItem[],
): void {
  const callId = asString(payload.call_id);
  const name = asString(payload.name);
  if (!callId || !name) return;

  const args = parseJsonObject(asString(payload.arguments));

  if (name === 'update_plan') {
    const todos = extractPlanTodos(args);
    if (todos.length > 0) {
      latestTodos.length = 0;
      latestTodos.push(...todos);
    }
    return;
  }

  if (name === 'spawn_agent') {
    agentMap.set(callId, {
      id: callId,
      type: asString(args.agent_type) ?? 'default',
      model: asString(args.model) ?? undefined,
      description: asString(args.message)?.slice(0, 120) ?? undefined,
      status: 'running',
      startTime: timestamp,
    });
    return;
  }

  toolMap.set(callId, {
    id: callId,
    name: normalizeToolName(name),
    target: extractCodexTarget(name, args),
    status: 'running',
    startTime: timestamp,
  });
}

function completeCodexExec(payload: Record<string, unknown>, timestamp: Date, toolMap: Map<string, ToolEntry>): void {
  const callId = asString(payload.call_id);
  if (!callId) return;

  const tool = toolMap.get(callId);
  if (!tool) return;

  tool.status = asNumber(payload.exit_code) === 0 ? 'completed' : 'error';
  tool.endTime = timestamp;

  if (!tool.target) {
    tool.target = extractExecTarget(payload);
  }
}

function completeCodexCall(
  callId: string | undefined,
  timestamp: Date,
  toolMap: Map<string, ToolEntry>,
  agentMap: Map<string, AgentEntry>,
  isError: boolean,
): void {
  if (!callId) return;

  const tool = toolMap.get(callId);
  if (tool && !tool.endTime) {
    tool.status = isError ? 'error' : 'completed';
    tool.endTime = timestamp;
  }

  const agent = agentMap.get(callId);
  if (agent && !agent.endTime) {
    agent.status = 'completed';
    agent.endTime = timestamp;
  }
}

function extractPlanTodos(args: Record<string, unknown>): TodoItem[] {
  const plan = Array.isArray(args.plan) ? args.plan : [];
  return plan
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const content = asString(obj.step);
      const status = asString(obj.status);
      if (!content || !isTodoStatus(status)) return null;
      return { content, status };
    })
    .filter((item): item is TodoItem => item !== null);
}

function isTodoStatus(value: string | undefined): value is TodoItem['status'] {
  return value === 'pending' || value === 'in_progress' || value === 'completed';
}

function extractCodexTarget(name: string, args: Record<string, unknown>): string | undefined {
  if (name === 'exec_command') {
    return asString(args.cmd)?.slice(0, 80);
  }
  if (name === 'apply_patch') {
    return 'patch';
  }
  if (name === 'write_stdin') {
    return asString(args.session_id);
  }
  if (name === 'wait_agent' || name === 'send_input' || name === 'close_agent') {
    return asString(args.target) ?? stringifyFirstArrayItem(args.targets);
  }
  return asString(args.path) ?? asString(args.ref_id) ?? asString(args.pattern);
}

function extractExecTarget(payload: Record<string, unknown>): string | undefined {
  const parsed = Array.isArray(payload.parsed_cmd) ? payload.parsed_cmd[0] : undefined;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    return asString(obj.path) ?? asString(obj.name) ?? asString(obj.cmd);
  }
  const command = Array.isArray(payload.command) ? payload.command : [];
  const last = command.length > 0 ? command[command.length - 1] : undefined;
  return asString(last);
}

function normalizeToolName(name: string): string {
  return name
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function toUsageData(payload: CodexUsagePayload): UsageData | null {
  const primary = payload.rate_limits?.primary;
  const secondary = payload.rate_limits?.secondary;
  if (!primary || !secondary) return null;

  return {
    five_hour: {
      utilization: primary.used_percent ?? 0,
      resets_at: epochToIso(primary.resets_at),
      window_minutes: primary.window_minutes,
    },
    seven_day: {
      utilization: secondary.used_percent ?? 0,
      resets_at: epochToIso(secondary.resets_at),
      window_minutes: secondary.window_minutes,
    },
    codex_credits: payload.rate_limits?.credits
      ? {
          has_credits: payload.rate_limits.credits.has_credits === true,
          unlimited: payload.rate_limits.credits.unlimited === true,
          balance:
            typeof payload.rate_limits.credits.balance === 'number'
              ? payload.rate_limits.credits.balance
              : null,
        }
      : undefined,
    limit_name: payload.rate_limits?.limit_name ?? null,
    plan_type: payload.rate_limits?.plan_type ?? null,
    rate_limit_reached_type: payload.rate_limits?.rate_limit_reached_type ?? null,
  };
}

function epochToIso(epochSeconds: number | undefined): string | undefined {
  return typeof epochSeconds === 'number' ? new Date(epochSeconds * 1000).toISOString() : undefined;
}

function readCodexModelName(): string {
  const configPath = path.join(os.homedir(), '.codex', 'config.toml');
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/^model\s*=\s*"([^"]+)"/m);
    if (match?.[1]) return match[1];
  } catch {
    // Fall back below.
  }
  return 'Codex';
}

function parseJsonObject(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function stringifyFirstArrayItem(value: unknown): string | undefined {
  return Array.isArray(value) && value.length > 0 ? String(value[0]) : undefined;
}
