import { dim, RESET } from './colors.js';
import { isPoolStale } from '../pool-usage.js';
const WHITE = '\x1b[38;2;220;220;220m';
const ORANGE = '\x1b[38;2;255;176;85m';
function colorForPct(pct) {
    if (pct >= 90)
        return '\x1b[38;2;255;85;85m';
    if (pct >= 70)
        return '\x1b[33m';
    if (pct >= 50)
        return ORANGE;
    return '\x1b[32m';
}
function buildBar(pct, width = 10) {
    const clamped = Math.max(0, Math.min(100, pct));
    const filled = Math.round((clamped / 100) * width);
    const empty = width - filled;
    const color = colorForPct(clamped);
    return `${color}${'●'.repeat(filled)}${dim('○'.repeat(empty))}${RESET}`;
}
function formatResetTime(isoStr, style = 'time') {
    if (!isoStr)
        return '';
    try {
        const date = new Date(isoStr);
        if (isNaN(date.getTime()))
            return '';
        switch (style) {
            case 'time': {
                const h = date.getHours();
                const m = date.getMinutes().toString().padStart(2, '0');
                const period = h >= 12 ? 'pm' : 'am';
                const h12 = h % 12 || 12;
                return `${h12}:${m}${period}`;
            }
            case 'datetime': {
                const month = date.toLocaleString('en', { month: 'short' }).toLowerCase();
                const day = date.getDate();
                const h = date.getHours();
                const m = date.getMinutes().toString().padStart(2, '0');
                const period = h >= 12 ? 'pm' : 'am';
                const h12 = h % 12 || 12;
                return `${month} ${day}, ${h12}:${m}${period}`;
            }
            default: {
                const month = date.toLocaleString('en', { month: 'short' }).toLowerCase();
                return `${month} ${date.getDate()}`;
            }
        }
    }
    catch {
        return '';
    }
}
function renderWindow(label, window, resetStyle, padLen, barWidth) {
    const pct = Math.round(window.utilization ?? 0);
    const reset = formatResetTime(window.resets_at, resetStyle);
    const bar = buildBar(pct, barWidth);
    const color = colorForPct(pct);
    const pctFmt = pct.toString().padStart(3);
    const paddedLabel = label.padEnd(padLen);
    let line = `${WHITE}${paddedLabel}${RESET} ${bar} ${color}${pctFmt}%${RESET}`;
    if (reset) {
        line += ` ${dim('\u27F3')} ${WHITE}${reset}${RESET}`;
    }
    return line;
}
function formatWindowDuration(minutes) {
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0)
        return null;
    if (minutes % 1440 === 0)
        return `${minutes / 1440}d`;
    if (minutes % 60 === 0)
        return `${minutes / 60}h`;
    return `${minutes}m`;
}
function labelWithWindow(baseLabel, window, fallbackMinutes) {
    const duration = formatWindowDuration(window.window_minutes ?? fallbackMinutes);
    return duration ? `${duration} ${baseLabel}` : baseLabel;
}
export function renderRateLimitsLine(ctx) {
    const { usageData } = ctx;
    if (!usageData)
        return null;
    const lines = [];
    const barWidth = 10;
    const currentLabel = usageData.five_hour
        ? labelWithWindow('current', usageData.five_hour, 300)
        : '';
    const weeklyLabel = usageData.seven_day
        ? (usageData.seven_day.label ?? labelWithWindow('weekly', usageData.seven_day, 10080))
        : '';
    const opusLabel = usageData.seven_day_opus
        ? (usageData.seven_day_opus.label ?? labelWithWindow('opus', usageData.seven_day_opus, 10080))
        : 'opus';
    const sonnetLabel = usageData.seven_day_sonnet
        ? (usageData.seven_day_sonnet.label ?? labelWithWindow('sonnet', usageData.seven_day_sonnet, 10080))
        : 'sonnet';
    // Determine the longest label for alignment
    const labels = [];
    if (usageData.five_hour)
        labels.push(currentLabel);
    if (usageData.seven_day)
        labels.push(weeklyLabel);
    if (usageData.seven_day_opus?.utilization != null)
        labels.push(opusLabel);
    if (usageData.seven_day_sonnet?.utilization != null)
        labels.push(sonnetLabel);
    for (const window of usageData.windows ?? []) {
        if (window.label)
            labels.push(window.label);
    }
    if (usageData.extra_usage?.is_enabled)
        labels.push('extra');
    for (const meter of usageData.dollar_meters ?? []) {
        labels.push(meter.label || 'meter');
    }
    if (usageData.codex_credits)
        labels.push('credits');
    const padLen = Math.max(1, ...labels.map(l => l.length));
    if (usageData.five_hour) {
        lines.push(renderWindow(currentLabel, usageData.five_hour, 'time', padLen, barWidth));
    }
    if (usageData.seven_day) {
        lines.push(renderWindow(weeklyLabel, usageData.seven_day, 'datetime', padLen, barWidth));
    }
    // Model-specific weekly windows (like CodexBar shows)
    if (usageData.seven_day_opus?.utilization != null) {
        lines.push(renderWindow(opusLabel, usageData.seven_day_opus, 'datetime', padLen, barWidth));
    }
    if (usageData.seven_day_sonnet?.utilization != null) {
        lines.push(renderWindow(sonnetLabel, usageData.seven_day_sonnet, 'datetime', padLen, barWidth));
    }
    for (const window of usageData.windows ?? []) {
        const label = window.label ?? 'usage';
        lines.push(renderWindow(label, window, 'datetime', padLen, barWidth));
    }
    function renderDollarMeter(label, meter) {
        const extraPct = Math.round(meter.utilization ?? 0);
        const extraUsed = (meter.used_credits / 100).toFixed(2);
        const extraLimit = (meter.monthly_limit / 100).toFixed(2);
        const extraBar = buildBar(extraPct, barWidth);
        const extraColor = colorForPct(extraPct);
        const paddedLabel = label.padEnd(padLen);
        lines.push(`${WHITE}${paddedLabel}${RESET} ${extraBar} ${extraColor}$${extraUsed}${dim('/')}${RESET}${WHITE}$${extraLimit}${RESET}`);
    }
    const extra = usageData.extra_usage;
    if (extra?.is_enabled) {
        renderDollarMeter('extra', extra);
    }
    for (const meter of usageData.dollar_meters ?? []) {
        renderDollarMeter(meter.label || 'meter', meter);
    }
    const credits = usageData.codex_credits;
    if (credits) {
        const paddedLabel = 'credits'.padEnd(padLen);
        let value = 'none';
        if (credits.unlimited) {
            value = 'unlimited';
        }
        else if (credits.has_credits && typeof credits.balance === 'number') {
            value = credits.balance.toLocaleString();
        }
        else if (credits.has_credits) {
            value = 'enabled';
        }
        lines.push(`${WHITE}${paddedLabel}${RESET} ${WHITE}${value}${RESET}`);
    }
    return lines.join('\n');
}
/** Pool lines: average use across the Team seats behind the LLM front door. */
export function renderPoolLines(ctx) {
    const pool = ctx.poolUsage;
    if (!pool)
        return null;
    const barWidth = 10;
    const padLen = Math.max(10, ...pool.windows.map(w => w.label.length));
    const seats = `${pool.seatsOk}/${pool.seatsTotal} seats`;
    const staleNote = isPoolStale(pool) ? ` ${dim(`stale ${Math.round(pool.ageMs / 60_000)}m`)}` : '';
    if (pool.windows.length === 0) {
        return `${WHITE}${'pool'.padEnd(padLen)}${RESET} ${dim(`unavailable (${seats})`)}${staleNote}`;
    }
    return pool.windows
        .map((w, i) => {
        const window = { utilization: w.avgPct, resets_at: w.resetsAt };
        const style = w.label === 'pool 5h' ? 'time' : 'datetime';
        let line = renderWindow(w.label, window, style, padLen, barWidth);
        line += ` ${dim(`peak ${Math.round(w.maxPct)}%`)}`;
        if (i === 0)
            line += ` ${dim('·')} ${WHITE}${seats}${RESET}${staleNote}`;
        return line;
    })
        .join('\n');
}
//# sourceMappingURL=rate-limits-line.js.map