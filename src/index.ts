import { readStdin } from './stdin.js';
import { parseTranscript } from './transcript.js';
import { render } from './render/index.js';
import { countConfigs } from './config-reader.js';
import { fetchUsageData } from './rate-limits.js';
import { getGitInfo } from './git-info.js';
import { readThinkingEnabled } from './config-reader.js';
import type { RenderContext } from './types.js';
import { fileURLToPath } from 'node:url';

export type MainDeps = {
  readStdin: typeof readStdin;
  parseTranscript: typeof parseTranscript;
  countConfigs: typeof countConfigs;
  fetchUsageData: typeof fetchUsageData;
  getGitInfo: typeof getGitInfo;
  readThinkingEnabled: typeof readThinkingEnabled;
  render: typeof render;
  now: () => number;
  log: (...args: unknown[]) => void;
};

export async function main(overrides: Partial<MainDeps> = {}): Promise<void> {
  const deps: MainDeps = {
    readStdin,
    parseTranscript,
    countConfigs,
    fetchUsageData,
    getGitInfo,
    readThinkingEnabled,
    render,
    now: () => Date.now(),
    log: console.log,
    ...overrides,
  };

  try {
    const stdin = await deps.readStdin();

    if (!stdin) {
      deps.log('[claude-hud] Initializing...');
      return;
    }

    const transcriptPath = stdin.transcript_path ?? '';
    const transcript = await deps.parseTranscript(transcriptPath);

    const { claudeMdCount, rulesCount, mcpCount, hooksCount } = await deps.countConfigs(stdin.cwd);

    const sessionDuration = formatSessionDuration(transcript.sessionStart, deps.now);

    const [usageData, gitInfo, thinkingEnabled] = await Promise.all([
      deps.fetchUsageData(),
      Promise.resolve(deps.getGitInfo(stdin.cwd)),
      Promise.resolve(deps.readThinkingEnabled()),
    ]);

    const ctx: RenderContext = {
      stdin,
      transcript,
      claudeMdCount,
      rulesCount,
      mcpCount,
      hooksCount,
      sessionDuration,
      gitInfo,
      thinkingEnabled,
      usageData,
    };

    deps.render(ctx);
  } catch (error) {
    deps.log('[claude-hud] Error:', error instanceof Error ? error.message : 'Unknown error');
  }
}

export function formatSessionDuration(sessionStart?: Date, now: () => number = () => Date.now()): string {
  if (!sessionStart) {
    return '';
  }

  const ms = now() - sessionStart.getTime();
  const mins = Math.floor(ms / 60000);

  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;

  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
