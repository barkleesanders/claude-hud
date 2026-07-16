import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
export function findLatestCodexSession(root = path.join(os.homedir(), '.codex', 'sessions')) {
    if (!fs.existsSync(root))
        return null;
    let latest = null;
    const stack = [root];
    while (stack.length > 0) {
        const dir = stack.pop();
        if (!dir)
            continue;
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
            }
            else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                try {
                    const stat = fs.statSync(fullPath);
                    if (!latest || stat.mtimeMs > latest.mtimeMs) {
                        latest = { path: fullPath, mtimeMs: stat.mtimeMs };
                    }
                }
                catch {
                    // Ignore files that disappear while scanning.
                }
            }
        }
    }
    return latest?.path ?? null;
}
export async function parseCodexSession(sessionPath) {
    const transcript = {
        tools: [],
        agents: [],
        todos: [],
    };
    const toolMap = new Map();
    const agentMap = new Map();
    let latestTodos = [];
    let cwd;
    let cliVersion;
    let usagePayload = null;
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
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
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
                    usagePayload = payload;
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
            }
            catch {
                // Skip malformed JSONL rows.
            }
        }
    }
    catch {
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
function buildCodexStdin(cwd, cliVersion, usagePayload, sessionPath) {
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
function processCodexFunctionCall(payload, timestamp, toolMap, agentMap, latestTodos) {
    const callId = asString(payload.call_id);
    const name = asString(payload.name);
    if (!callId || !name)
        return;
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
function completeCodexExec(payload, timestamp, toolMap) {
    const callId = asString(payload.call_id);
    if (!callId)
        return;
    const tool = toolMap.get(callId);
    if (!tool)
        return;
    tool.status = asNumber(payload.exit_code) === 0 ? 'completed' : 'error';
    tool.endTime = timestamp;
    if (!tool.target) {
        tool.target = extractExecTarget(payload);
    }
}
function completeCodexCall(callId, timestamp, toolMap, agentMap, isError) {
    if (!callId)
        return;
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
function extractPlanTodos(args) {
    const plan = Array.isArray(args.plan) ? args.plan : [];
    return plan
        .map((item) => {
        if (!item || typeof item !== 'object')
            return null;
        const obj = item;
        const content = asString(obj.step);
        const status = asString(obj.status);
        if (!content || !isTodoStatus(status))
            return null;
        return { content, status };
    })
        .filter((item) => item !== null);
}
function isTodoStatus(value) {
    return value === 'pending' || value === 'in_progress' || value === 'completed';
}
function extractCodexTarget(name, args) {
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
function extractExecTarget(payload) {
    const parsed = Array.isArray(payload.parsed_cmd) ? payload.parsed_cmd[0] : undefined;
    if (parsed && typeof parsed === 'object') {
        const obj = parsed;
        return asString(obj.path) ?? asString(obj.name) ?? asString(obj.cmd);
    }
    const command = Array.isArray(payload.command) ? payload.command : [];
    const last = command.length > 0 ? command[command.length - 1] : undefined;
    return asString(last);
}
function normalizeToolName(name) {
    return name
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
}
function toUsageData(payload) {
    const primary = payload.rate_limits?.primary;
    const secondary = payload.rate_limits?.secondary;
    if (!primary || !secondary)
        return null;
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
                balance: typeof payload.rate_limits.credits.balance === 'number'
                    ? payload.rate_limits.credits.balance
                    : null,
            }
            : undefined,
        limit_name: payload.rate_limits?.limit_name ?? null,
        plan_type: payload.rate_limits?.plan_type ?? null,
        rate_limit_reached_type: payload.rate_limits?.rate_limit_reached_type ?? null,
    };
}
function epochToIso(epochSeconds) {
    return typeof epochSeconds === 'number' ? new Date(epochSeconds * 1000).toISOString() : undefined;
}
function readCodexModelName() {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    try {
        const content = fs.readFileSync(configPath, 'utf8');
        const match = content.match(/^model\s*=\s*"([^"]+)"/m);
        if (match?.[1])
            return match[1];
    }
    catch {
        // Fall back below.
    }
    return 'Codex';
}
function parseJsonObject(raw) {
    if (!raw)
        return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
function asString(value) {
    return typeof value === 'string' ? value : undefined;
}
function asNumber(value) {
    return typeof value === 'number' ? value : undefined;
}
function stringifyFirstArrayItem(value) {
    return Array.isArray(value) && value.length > 0 ? String(value[0]) : undefined;
}
//# sourceMappingURL=codex.js.map