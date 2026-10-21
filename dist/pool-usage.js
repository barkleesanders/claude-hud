import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
const CACHE_DIR = '/tmp/claude';
const CACHE_FILE = path.join(CACHE_DIR, 'pool-usage.json');
const LOCK_FILE = path.join(CACHE_DIR, 'pool-usage.lock');
const REFRESH_AFTER_MS = 120_000;
const LOCK_MS = 45_000;
const STALE_AFTER_MS = 15 * 60_000;
const DEFAULT_HOSTS = 'mini-lan mac-mini';
function optionalString(value) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
function parseLimit(raw) {
    if (typeof raw !== 'object' || raw === null)
        return null;
    const limit = raw;
    if (typeof limit.kind !== 'string')
        return null;
    if (typeof limit.percent !== 'number' || !Number.isFinite(limit.percent))
        return null;
    return {
        kind: limit.kind,
        percent: limit.percent,
        resetsAt: optionalString(limit.resets_at),
        model: optionalString(limit.model),
    };
}
function parseSeat(raw) {
    if (typeof raw !== 'object' || raw === null)
        return null;
    const row = raw;
    if (typeof row.seat !== 'number')
        return null;
    const limits = Array.isArray(row.limits)
        ? row.limits.map(parseLimit).filter((l) => l !== null)
        : [];
    return { seat: row.seat, error: optionalString(row.error), limits };
}
/** Parse the shim's /usage body. Returns null when the body is not that shape. */
export function parsePoolResponse(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null)
        return null;
    const body = parsed;
    if (!Array.isArray(body.seats))
        return null;
    const rows = body.seats.map(parseSeat).filter((r) => r !== null);
    return rows.length > 0 ? rows : null;
}
function earliest(a, b) {
    if (!a)
        return b;
    if (!b)
        return a;
    return new Date(b).getTime() < new Date(a).getTime() ? b : a;
}
/** Aggregate per-seat limits into pool windows: the session window first, then weekly caps. */
export function aggregatePool(rows, ageMs) {
    const groups = new Map();
    const errors = [];
    let seatsOk = 0;
    for (const row of rows) {
        if (row.error || row.limits.length === 0) {
            errors.push(`s${row.seat}: ${row.error ?? 'no limits reported'}`);
            continue;
        }
        seatsOk++;
        for (const limit of row.limits) {
            const label = limit.kind === 'session' ? '5h' : (limit.model ?? 'weekly').toLowerCase();
            const group = groups.get(label) ?? { pcts: [] };
            group.pcts.push(limit.percent);
            group.resetsAt = earliest(group.resetsAt, limit.resetsAt);
            groups.set(label, group);
        }
    }
    const windows = [...groups.entries()]
        .sort(([a], [b]) => (a === '5h' ? -1 : b === '5h' ? 1 : a.localeCompare(b)))
        .map(([label, g]) => ({
        label: `pool ${label}`,
        avgPct: g.pcts.reduce((sum, p) => sum + p, 0) / g.pcts.length,
        maxPct: Math.max(...g.pcts),
        resetsAt: g.resetsAt,
    }));
    return { seatsOk, seatsTotal: rows.length, windows, ageMs, errors };
}
function fileAgeMs(file) {
    try {
        return Date.now() - fs.statSync(file).mtimeMs;
    }
    catch {
        return null;
    }
}
function startBackgroundRefresh() {
    const lockAge = fileAgeMs(LOCK_FILE);
    if (lockAge !== null && lockAge < LOCK_MS)
        return;
    try {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(LOCK_FILE, '');
    }
    catch {
        return;
    }
    const hosts = process.env.CLAUDE_HUD_POOL_HOSTS ?? DEFAULT_HOSTS;
    // Try each host; only a body the shim produced (has "seats") replaces the cache.
    const script = [
        `tmp="${CACHE_FILE}.$$"`,
        `for h in ${hosts}; do`,
        `  if ssh -o BatchMode=yes -o ConnectTimeout=5 "$h" 'curl -s -m 25 http://127.0.0.1:4101/usage' > "$tmp" 2>/dev/null && grep -q '"seats"' "$tmp"; then`,
        `    mv "$tmp" "${CACHE_FILE}"; break`,
        '  fi',
        'done',
        `rm -f "$tmp" "${LOCK_FILE}"`,
    ].join('\n');
    try {
        const child = spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' });
        child.unref();
    }
    catch {
        // ssh/sh unavailable: the line keeps showing the last cache (or "unavailable").
    }
}
/** Never blocks on the network: returns the cached pool view and refreshes it in the background. */
export function getPoolUsage() {
    if (process.env.CLAUDE_HUD_SKIP_POOL === '1')
        return null;
    if (process.env.CLAUDE_HUD_SKIP_RATE_LIMITS === '1')
        return null;
    const ageMs = fileAgeMs(CACHE_FILE);
    if (ageMs === null || ageMs > REFRESH_AFTER_MS)
        startBackgroundRefresh();
    if (ageMs === null)
        return null;
    let text;
    try {
        text = fs.readFileSync(CACHE_FILE, 'utf8');
    }
    catch {
        return null;
    }
    const rows = parsePoolResponse(text);
    return rows ? aggregatePool(rows, ageMs) : null;
}
export function isPoolStale(pool) {
    return pool.ageMs > STALE_AFTER_MS;
}
//# sourceMappingURL=pool-usage.js.map