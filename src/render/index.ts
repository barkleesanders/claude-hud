import type { RenderContext } from '../types.js';
import { renderSessionLine } from './session-line.js';
import { renderToolsLine } from './tools-line.js';
import { renderAgentsLine } from './agents-line.js';
import { renderTodosLine } from './todos-line.js';
import { renderRateLimitsLine } from './rate-limits-line.js';
import { RESET } from './colors.js';

export function render(ctx: RenderContext): void {
  process.stdout.write(renderToString(ctx));
}

export function renderToString(ctx: RenderContext): string {
  return collectRenderLines(ctx).map(formatOutputLine).join('\n') + '\n';
}

function collectRenderLines(ctx: RenderContext): string[] {
  const lines: string[] = [];

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

  return lines;
}

function formatOutputLine(line: string): string {
  return `${RESET}${line.replace(/ /g, '\u00A0')}`;
}
