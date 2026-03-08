import { getContextPercent, getModelName } from '../stdin.js';
import { coloredBar, cyan, dim, red, green, magenta, getContextColor, RESET } from './colors.js';
const RED_RGB = '\x1b[38;2;255;85;85m';
export function renderSessionLine(ctx) {
    const model = getModelName(ctx.stdin);
    const percent = getContextPercent(ctx.stdin);
    const bar = coloredBar(percent);
    const parts = [];
    parts.push(`${cyan(`[${model}]`)} ${bar} ${getContextColor(percent)}${percent}%${RESET}`);
    // Git info
    if (ctx.gitInfo) {
        const dirtyMark = ctx.gitInfo.dirty ? `${RED_RGB}*${RESET}` : '';
        parts.push(`${green(ctx.gitInfo.branch)}${dirtyMark}`);
    }
    if (ctx.claudeMdCount > 0) {
        parts.push(dim(`${ctx.claudeMdCount} CLAUDE.md`));
    }
    if (ctx.rulesCount > 0) {
        parts.push(dim(`${ctx.rulesCount} rules`));
    }
    if (ctx.mcpCount > 0) {
        parts.push(dim(`${ctx.mcpCount} MCPs`));
    }
    if (ctx.hooksCount > 0) {
        parts.push(dim(`${ctx.hooksCount} hooks`));
    }
    if (ctx.sessionDuration) {
        parts.push(dim(`⏱️  ${ctx.sessionDuration}`));
    }
    // Thinking mode indicator
    if (ctx.thinkingEnabled) {
        parts.push(magenta('◐ thinking'));
    }
    else {
        parts.push(dim('◑ thinking'));
    }
    let line = parts.join(' | ');
    if (percent >= 85) {
        const usage = ctx.stdin.context_window?.current_usage;
        if (usage) {
            const input = formatTokens(usage.input_tokens ?? 0);
            const cache = formatTokens((usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0));
            line += dim(` (in: ${input}, cache: ${cache})`);
        }
    }
    if (percent >= 95) {
        line += ` ${red('⚠️ COMPACT')}`;
    }
    return line;
}
function formatTokens(n) {
    if (n >= 1000000) {
        return `${(n / 1000000).toFixed(1)}M`;
    }
    if (n >= 1000) {
        return `${(n / 1000).toFixed(0)}k`;
    }
    return n.toString();
}
//# sourceMappingURL=session-line.js.map