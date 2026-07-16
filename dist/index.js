#!/usr/bin/env node
import { readStdin } from './stdin.js';
import { parseTranscript } from './transcript.js';
import { render, renderToString } from './render/index.js';
import { countCodexConfigs, countConfigs } from './config-reader.js';
import { fetchUsageData } from './rate-limits.js';
import { getGitInfo } from './git-info.js';
import { readThinkingEnabled } from './config-reader.js';
import { fileURLToPath } from 'node:url';
import { findLatestCodexSession, parseCodexSession } from './codex.js';
export async function main(overrides = {}) {
    const deps = {
        readStdin,
        parseTranscript,
        countConfigs,
        fetchUsageData,
        getGitInfo,
        readThinkingEnabled,
        render,
        now: () => Date.now(),
        args: process.argv.slice(2),
        log: console.log,
        ...overrides,
    };
    try {
        const codexArgs = parseCodexArgs(deps.args);
        if (codexArgs.enabled) {
            await runCodexHud(deps, codexArgs);
            return;
        }
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
        const ctx = {
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
    }
    catch (error) {
        deps.log('[claude-hud] Error:', error instanceof Error ? error.message : 'Unknown error');
    }
}
function parseCodexArgs(args) {
    const enabledByEnv = process.env.CODEX_HUD_MODE === 'codex';
    const result = {
        enabled: enabledByEnv,
        watch: args.includes('--watch'),
        sessionPath: process.env.CODEX_HUD_SESSION,
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--codex') {
            result.enabled = true;
            const next = args[i + 1];
            if (next && !next.startsWith('--')) {
                result.sessionPath = next;
                i++;
            }
        }
        else if (arg.startsWith('--codex=')) {
            result.enabled = true;
            result.sessionPath = arg.slice('--codex='.length);
        }
    }
    return result;
}
async function runCodexHud(deps, args) {
    const buildOutput = async () => {
        const sessionPath = args.sessionPath ?? findLatestCodexSession();
        if (!sessionPath) {
            return '[claude-hud] No Codex session found.\n';
        }
        const snapshot = await parseCodexSession(sessionPath);
        const { claudeMdCount, rulesCount, mcpCount, hooksCount } = await countCodexConfigs(snapshot.stdin.cwd);
        const ctx = {
            stdin: snapshot.stdin,
            transcript: snapshot.transcript,
            claudeMdCount,
            rulesCount,
            mcpCount,
            hooksCount,
            sessionDuration: formatSessionDuration(snapshot.transcript.sessionStart, deps.now),
            gitInfo: deps.getGitInfo(snapshot.stdin.cwd),
            thinkingEnabled: false,
            usageData: snapshot.usageData,
        };
        return renderToString(ctx);
    };
    if (!args.watch) {
        process.stdout.write(await buildOutput());
        return;
    }
    let previous = '';
    const refreshMs = getRefreshMs();
    process.stdout.write('\x1b[?25l');
    const restoreCursor = () => {
        process.stdout.write('\x1b[?25h');
    };
    process.once('SIGINT', () => {
        restoreCursor();
        process.exit(130);
    });
    process.once('SIGTERM', () => {
        restoreCursor();
        process.exit(143);
    });
    for (;;) {
        const output = await buildOutput();
        if (output !== previous) {
            process.stdout.write('\x1b[H');
            process.stdout.write(output);
            process.stdout.write('\x1b[J');
            previous = output;
        }
        await new Promise((resolve) => setTimeout(resolve, refreshMs));
    }
}
function getRefreshMs() {
    const parsed = Number.parseInt(process.env.CODEX_HUD_REFRESH_MS ?? '', 10);
    if (Number.isFinite(parsed) && parsed >= 250) {
        return parsed;
    }
    return 1000;
}
export function formatSessionDuration(sessionStart, now = () => Date.now()) {
    if (!sessionStart) {
        return '';
    }
    const ms = now() - sessionStart.getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1)
        return '<1m';
    if (mins < 60)
        return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    void main();
}
//# sourceMappingURL=index.js.map