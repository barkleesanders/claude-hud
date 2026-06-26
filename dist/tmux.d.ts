#!/usr/bin/env node
interface ParsedArgs {
    attach: boolean;
    codexArgs: string[];
    hudOnly: boolean;
    realCodex: string;
    sessionName: string;
    sessionPath?: string;
}
export declare function parseArgs(argv: string[], env?: NodeJS.ProcessEnv): ParsedArgs;
export declare function buildHudCommand(sessionPath?: string): string;
export declare function buildCodexCommand(realCodex: string, codexArgs: string[]): string;
export declare function run(argv?: string[], env?: NodeJS.ProcessEnv): number;
export {};
//# sourceMappingURL=tmux.d.ts.map