#!/usr/bin/env node
import { countConfigs, readThinkingEnabled } from './config-reader.js';
import { getGitInfo } from './git-info.js';
import { getPoolUsage } from './pool-usage.js';
import { fetchUsageData } from './rate-limits.js';
import { render } from './render/index.js';
import { readStdin } from './stdin.js';
import { parseTranscript } from './transcript.js';
export type MainDeps = {
    readStdin: typeof readStdin;
    parseTranscript: typeof parseTranscript;
    countConfigs: typeof countConfigs;
    fetchUsageData: typeof fetchUsageData;
    getPoolUsage: typeof getPoolUsage;
    getGitInfo: typeof getGitInfo;
    readThinkingEnabled: typeof readThinkingEnabled;
    render: typeof render;
    now: () => number;
    args: string[];
    log: (...args: unknown[]) => void;
};
export declare function main(overrides?: Partial<MainDeps>): Promise<void>;
export declare function formatSessionDuration(sessionStart?: Date, now?: () => number): string;
//# sourceMappingURL=index.d.ts.map