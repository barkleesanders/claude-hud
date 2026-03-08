import { readStdin } from './stdin.js';
import { parseTranscript } from './transcript.js';
import { render } from './render/index.js';
import { countConfigs } from './config-reader.js';
import { fetchUsageData } from './rate-limits.js';
import { getGitInfo } from './git-info.js';
import { readThinkingEnabled } from './config-reader.js';
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
export declare function main(overrides?: Partial<MainDeps>): Promise<void>;
export declare function formatSessionDuration(sessionStart?: Date, now?: () => number): string;
//# sourceMappingURL=index.d.ts.map