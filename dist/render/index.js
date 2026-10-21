import { renderAgentsLine } from './agents-line.js';
import { RESET } from './colors.js';
import { renderPoolLines, renderRateLimitsLine } from './rate-limits-line.js';
import { renderSessionLine } from './session-line.js';
import { renderTodosLine } from './todos-line.js';
import { renderToolsLine } from './tools-line.js';
export function render(ctx) {
    process.stdout.write(renderToString(ctx));
}
export function renderToString(ctx) {
    return `${collectRenderLines(ctx).map(formatOutputLine).join('\n')}\n`;
}
function collectRenderLines(ctx) {
    const lines = [];
    const sessionLine = renderSessionLine(ctx);
    if (sessionLine) {
        lines.push(sessionLine);
    }
    const toolsLine = renderToolsLine(ctx);
    if (toolsLine) {
        lines.push(toolsLine);
    }
    const agentsLine = renderAgentsLine(ctx);
    if (agentsLine) {
        lines.push(agentsLine);
    }
    const todosLine = renderTodosLine(ctx);
    if (todosLine) {
        lines.push(todosLine);
    }
    const rateLimitsLine = renderRateLimitsLine(ctx);
    if (rateLimitsLine) {
        lines.push('');
        lines.push(rateLimitsLine);
    }
    const poolLines = renderPoolLines(ctx);
    if (poolLines) {
        if (!rateLimitsLine)
            lines.push('');
        lines.push(poolLines);
    }
    return lines;
}
function formatOutputLine(line) {
    return `${RESET}${line.replace(/ /g, '\u00A0')}`;
}
//# sourceMappingURL=index.js.map