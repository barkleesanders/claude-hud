import { dim, RESET } from './colors.js';
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
export function renderRateLimitsLine(ctx) {
    const { usageData } = ctx;
    if (!usageData)
        return null;
    const lines = [];
    const barWidth = 10;
    // Determine the longest label for alignment
    const labels = ['current', 'weekly'];
    if (usageData.seven_day_opus?.utilization != null)
        labels.push('opus 7d');
    if (usageData.seven_day_sonnet?.utilization != null)
        labels.push('sonnet 7d');
    const padLen = Math.max(...labels.map(l => l.length));
    // 5-hour (current) window
    lines.push(renderWindow('current', usageData.five_hour, 'time', padLen, barWidth));
    // 7-day (weekly) window
    lines.push(renderWindow('weekly', usageData.seven_day, 'datetime', padLen, barWidth));
    // Model-specific weekly windows (like CodexBar shows)
    if (usageData.seven_day_opus?.utilization != null) {
        lines.push(renderWindow('opus 7d', usageData.seven_day_opus, 'datetime', padLen, barWidth));
    }
    if (usageData.seven_day_sonnet?.utilization != null) {
        lines.push(renderWindow('sonnet 7d', usageData.seven_day_sonnet, 'datetime', padLen, barWidth));
    }
    // Extra usage (if enabled)
    const extra = usageData.extra_usage;
    if (extra?.is_enabled) {
        const extraPct = Math.round(extra.utilization ?? 0);
        const extraUsed = (extra.used_credits / 100).toFixed(2);
        const extraLimit = (extra.monthly_limit / 100).toFixed(2);
        const extraBar = buildBar(extraPct, barWidth);
        const extraColor = colorForPct(extraPct);
        const paddedLabel = 'extra'.padEnd(padLen);
        lines.push(`${WHITE}${paddedLabel}${RESET} ${extraBar} ${extraColor}$${extraUsed}${dim('/')}${RESET}${WHITE}$${extraLimit}${RESET}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=rate-limits-line.js.map