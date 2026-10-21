/**
 * Pooled Claude Team seat usage, served by the Mac mini seat shim
 * (GET 127.0.0.1:4101/usage, one row per seat from /api/oauth/usage).
 *
 * The statusline must never block on the network, so this module only reads a
 * local cache and, when it is stale, launches a detached refresh over ssh.
 * ceiling: one ssh round-trip per REFRESH_AFTER_MS; the shim itself caches 120s.
 */
export interface PoolWindow {
    label: string;
    avgPct: number;
    maxPct: number;
    resetsAt?: string;
}
export interface PoolUsage {
    seatsOk: number;
    seatsTotal: number;
    windows: PoolWindow[];
    ageMs: number;
    errors: string[];
}
interface SeatLimit {
    kind: string;
    percent: number;
    resetsAt?: string;
    model?: string;
}
export interface SeatRow {
    seat: number;
    error?: string;
    limits: SeatLimit[];
}
/** Parse the shim's /usage body. Returns null when the body is not that shape. */
export declare function parsePoolResponse(text: string): SeatRow[] | null;
/** Aggregate per-seat limits into pool windows: the session window first, then weekly caps. */
export declare function aggregatePool(rows: SeatRow[], ageMs: number): PoolUsage;
/** Never blocks on the network: returns the cached pool view and refreshes it in the background. */
export declare function getPoolUsage(): PoolUsage | null;
export declare function isPoolStale(pool: PoolUsage): boolean;
export {};
//# sourceMappingURL=pool-usage.d.ts.map