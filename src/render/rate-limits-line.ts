import type { RenderContext } from '../types.js';
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

export function renderRateLimitsLine(ctx: RenderContext): string | null {
  const { usageData } = ctx;
  if (!usageData) return null;

  const lines: string[] = [];
  const barWidth = 10;

  // 5-hour (current) window
  const fiveHourPct = Math.round(usageData.five_hour.utilization ?? 0);
  const fiveHourReset = formatResetTime(usageData.five_hour.resets_at, 'time');
  const fiveHourBar = buildBar(fiveHourPct, barWidth);
  const fiveHourColor = colorForPct(fiveHourPct);
  const fiveHourPctFmt = fiveHourPct.toString().padStart(3);

  let currentLine = `${WHITE}current${RESET} ${fiveHourBar} ${fiveHourColor}${fiveHourPctFmt}%${RESET}`;
  if (fiveHourReset) {
    currentLine += ` ${dim('⟳')} ${WHITE}${fiveHourReset}${RESET}`;
  }
  lines.push(currentLine);

  // 7-day (weekly) window
  const sevenDayPct = Math.round(usageData.seven_day.utilization ?? 0);
  const sevenDayReset = formatResetTime(usageData.seven_day.resets_at, 'datetime');
  const sevenDayBar = buildBar(sevenDayPct, barWidth);
  const sevenDayColor = colorForPct(sevenDayPct);
  const sevenDayPctFmt = sevenDayPct.toString().padStart(3);

  let weeklyLine = `${WHITE}weekly${RESET}  ${sevenDayBar} ${sevenDayColor}${sevenDayPctFmt}%${RESET}`;
  if (sevenDayReset) {
    weeklyLine += ` ${dim('⟳')} ${WHITE}${sevenDayReset}${RESET}`;
  }
  lines.push(weeklyLine);

  // Extra usage (if enabled)
  const extra = usageData.extra_usage;
  if (extra?.is_enabled) {
    const extraPct = Math.round(extra.utilization ?? 0);
    const extraUsed = (extra.used_credits / 100).toFixed(2);
    const extraLimit = (extra.monthly_limit / 100).toFixed(2);
    const extraBar = buildBar(extraPct, barWidth);
    const extraColor = colorForPct(extraPct);

    lines.push(`${WHITE}extra${RESET}   ${extraBar} ${extraColor}$${extraUsed}${dim('/')}${RESET}${WHITE}$${extraLimit}${RESET}`);
  }

  return lines.join('\n');
}
