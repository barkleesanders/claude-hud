import type { StdinData } from './types.js';

export async function readStdin(): Promise<StdinData | null> {
  if (process.stdin.isTTY) {
    return null;
  }

  const chunks: string[] = [];

  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      chunks.push(chunk as string);
    }
    const raw = chunks.join('');
    if (!raw.trim()) {
      return null;
    }
    return JSON.parse(raw) as StdinData;
  } catch {
    return null;
  }
}

export function getContextPercent(stdin: StdinData): number {
  const window = stdin.context_window;
  if (!window) {
    return 0;
  }

  if (typeof window.used_percentage === 'number') {
    return Math.max(0, Math.min(100, Math.round(window.used_percentage)));
  }

  const size = window.context_window_size;
  if (size && size > 0 && typeof window.context_tokens === 'number') {
    return Math.round((window.context_tokens / size) * 100);
  }

  const usage = window.current_usage;
  if (!usage || !size || size === 0) {
    return 0;
  }

  const totalTokens =
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);

  return Math.round((totalTokens / size) * 100);
}

export function getModelName(stdin: StdinData): string {
  return stdin.model?.display_name ?? stdin.model?.id ?? 'Unknown';
}
