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
    iguana_necktie?: RateLimitWindow;
    extra_usage?: ExtraUsage;
}
export declare function fetchUsageData(): Promise<UsageData | null>;
//# sourceMappingURL=rate-limits.d.ts.map