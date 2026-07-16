import type { StdinData, TranscriptData, UsageData } from './types.js';
export interface CodexSnapshot {
    stdin: StdinData;
    transcript: TranscriptData;
    usageData: UsageData | null;
    sessionPath: string;
}
export declare function findLatestCodexSession(root?: string): string | null;
export declare function parseCodexSession(sessionPath: string): Promise<CodexSnapshot>;
//# sourceMappingURL=codex.d.ts.map