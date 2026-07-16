import type { RenderContext, RateLimitWindow } from '../types.js';
import { dim, RESET } from './colors.js';

const WHITE = '\x1b[38;2;220;220;220m';
const ORANGE = '\x1b[38;2;255;176;85m';

function colorForPct(pct: number): string {
  if (pct >= 90) return '\x1b[38;2;255;85;85m';
  if (pct >= 70) return '\x1b[33m';
  if (pct >= 50) return ORANGE;
  return '\x1b[32m';
}

function buildBar(pct: number, width: number = 10): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const color = colorForPct(clamped);
  return `${color}${'●'.repeat(filled)}${dim('○'.repeat(empty))}${RESET}`;
}

function formatResetTime(isoStr?: string, style: 'time' | 'datetime' | 'date' = 'time'): string {
  if (!isoStr) return '';
  try {
    const date = new Date(isoStr);
    if (isNaN(date.getTime())) return '';

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
  } catch {
    return '';
  }
}

function renderWindow(
  label: string,
  window: RateLimitWindow,
  resetStyle: 'time' | 'datetime' | 'date',
  padLen: number,
  barWidth: number,
): string {
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

function formatWindowDuration(minutes: number | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null;

  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function labelWithWindow(baseLabel: string, window: RateLimitWindow, fallbackMinutes: number): string {
  const duration = formatWindowDuration(window.window_minutes ?? fallbackMinutes);
  return duration ? `${duration} ${baseLabel}` : baseLabel;
}

export function renderRateLimitsLine(ctx: RenderContext): string | null {
  const { usageData } = ctx;
  if (!usageData) return null;

  const lines: string[] = [];
  const barWidth = 10;
  const currentLabel = labelWithWindow('current', usageData.five_hour, 300);
  const weeklyLabel = labelWithWindow('weekly', usageData.seven_day, 10080);
  const opusLabel = usageData.seven_day_opus
    ? labelWithWindow('opus', usageData.seven_day_opus, 10080)
    : 'opus';
  const sonnetLabel = usageData.seven_day_sonnet
    ? labelWithWindow('sonnet', usageData.seven_day_sonnet, 10080)
    : 'sonnet';

  // Determine the longest label for alignment
  const labels: string[] = [currentLabel, weeklyLabel];
  if (usageData.seven_day_opus?.utilization != null) labels.push(opusLabel);
  if (usageData.seven_day_sonnet?.utilization != null) labels.push(sonnetLabel);
  if (usageData.codex_credits) labels.push('credits');
  const padLen = Math.max(...labels.map(l => l.length));

  // 5-hour (current) window
  lines.push(renderWindow(currentLabel, usageData.five_hour, 'time', padLen, barWidth));

  // 7-day (weekly) window
  lines.push(renderWindow(weeklyLabel, usageData.seven_day, 'datetime', padLen, barWidth));

  // Model-specific weekly windows (like CodexBar shows)
  if (usageData.seven_day_opus?.utilization != null) {
    lines.push(renderWindow(opusLabel, usageData.seven_day_opus, 'datetime', padLen, barWidth));
  }
  if (usageData.seven_day_sonnet?.utilization != null) {
    lines.push(renderWindow(sonnetLabel, usageData.seven_day_sonnet, 'datetime', padLen, barWidth));
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

  const credits = usageData.codex_credits;
  if (credits) {
    const paddedLabel = 'credits'.padEnd(padLen);
    let value = 'none';
    if (credits.unlimited) {
      value = 'unlimited';
    } else if (credits.has_credits && typeof credits.balance === 'number') {
      value = credits.balance.toLocaleString();
    } else if (credits.has_credits) {
      value = 'enabled';
    }
    lines.push(`${WHITE}${paddedLabel}${RESET} ${WHITE}${value}${RESET}`);
  }

  return lines.join('\n');
}
