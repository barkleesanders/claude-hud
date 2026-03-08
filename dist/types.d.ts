export interface StdinData {
    transcript_path?: string;
    cwd?: string;
    model?: {
        id?: string;
        display_name?: string;
    };
    context_window?: {
        context_window_size?: number;
        current_usage?: {
            input_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
        };
    };
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
}
export interface ExtraUsage {
    is_enabled: boolean;
    utilization: number;
    used_credits: number;
    monthly_limit: number;
    currency?: string;
}
export interface UsageData {
    five_hour: RateLimitWindow;
    seven_day: RateLimitWindow;
    seven_day_opus?: RateLimitWindow;
    seven_day_sonnet?: RateLimitWindow;
    seven_day_oauth_apps?: RateLimitWindow;
    seven_day_cowork?: RateLimitWindow;
    iguana_necktie?: RateLimitWindow;
    extra_usage?: ExtraUsage;
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
}
//# sourceMappingURL=types.d.ts.map