import type { PoolUsage } from './pool-usage.js';
export interface StdinData {
    source?: 'claude' | 'codex' | 'grok';
    transcript_path?: string;
    cwd?: string;
    cli_version?: string;
    model?: {
        id?: string;
        display_name?: string;
    };
    context_window?: {
        context_window_size?: number;
        context_tokens?: number;
        used_percentage?: number;
        current_usage?: {
            input_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
        };
    };
    cost?: {
        total_cost_usd?: number;
    };
    grok_usage?: GrokUsage;
}
export interface GrokUsageWindow {
    utilization: number;
    resets_at?: string;
    window_minutes?: number;
    label?: string;
}
export interface GrokUsage {
    weekly?: GrokUsageWindow;
    products?: GrokUsageWindow[];
    extra_usage?: ExtraUsage;
    dollar_meters?: Array<ExtraUsage & {
        label: string;
    }>;
    prepaid?: number;
    tier?: string;
}
export interface ToolEntry {
    id: string;
    name: string;
    target?: string;
    status: 'running' | 'completed' | 'error';
    startTime: Date;
    endTime?: Date;
}
export interface AgentEntry {
    id: string;
    type: string;
    model?: string;
    description?: string;
    status: 'running' | 'completed';
    startTime: Date;
    endTime?: Date;
}
export interface TodoItem {
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
}
export interface TranscriptData {
    tools: ToolEntry[];
    agents: AgentEntry[];
    todos: TodoItem[];
    sessionStart?: Date;
}
export interface GitInfo {
    branch: string;
    dirty: boolean;
}
export interface RateLimitWindow {
    utilization: number;
    resets_at?: string;
    window_minutes?: number;
    label?: string;
}
export interface ExtraUsage {
    is_enabled: boolean;
    utilization: number;
    used_credits: number;
    monthly_limit: number;
    currency?: string;
}
export interface CodexCredits {
    has_credits: boolean;
    unlimited: boolean;
    balance: number | null;
}
export interface UsageData {
    five_hour?: RateLimitWindow;
    seven_day?: RateLimitWindow;
    seven_day_opus?: RateLimitWindow;
    seven_day_sonnet?: RateLimitWindow;
    seven_day_oauth_apps?: RateLimitWindow;
    seven_day_cowork?: RateLimitWindow;
    iguana_necktie?: RateLimitWindow;
    extra_usage?: ExtraUsage;
    dollar_meters?: Array<ExtraUsage & {
        label: string;
    }>;
    windows?: RateLimitWindow[];
    codex_credits?: CodexCredits;
    limit_name?: string | null;
    plan_type?: string | null;
    rate_limit_reached_type?: string | null;
}
export interface RenderContext {
    stdin: StdinData;
    transcript: TranscriptData;
    claudeMdCount: number;
    rulesCount: number;
    mcpCount: number;
    hooksCount: number;
    sessionDuration: string;
    gitInfo: GitInfo | null;
    thinkingEnabled: boolean;
    usageData: UsageData | null;
    poolUsage?: PoolUsage | null;
}
//# sourceMappingURL=types.d.ts.map