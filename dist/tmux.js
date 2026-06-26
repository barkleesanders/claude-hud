#!/usr/bin/env node
import { spawnSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
const distDir = path.dirname(fileURLToPath(import.meta.url));
const hudPath = path.join(distDir, 'index.js');
export function parseArgs(argv, env = process.env) {
    const parsed = {
        attach: env.CODEX_HUD_ATTACH !== '0',
        codexArgs: [],
        hudOnly: false,
        realCodex: env.CODEX_HUD_REAL_CODEX ?? '/opt/homebrew/bin/codex',
        sessionName: env.CODEX_HUD_TMUX_SESSION ?? `codex-hud-${process.pid}`,
        sessionPath: env.CODEX_HUD_SESSION,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--hud-only') {
            parsed.hudOnly = true;
        }
        else if (arg === '--no-attach') {
            parsed.attach = false;
        }
        else if (arg === '--session' && argv[i + 1]) {
            parsed.sessionPath = argv[++i];
        }
        else if (arg === '--tmux-session' && argv[i + 1]) {
            parsed.sessionName = argv[++i];
        }
        else if (arg === '--') {
            parsed.codexArgs.push(...argv.slice(i + 1));
            break;
        }
        else {
            parsed.codexArgs.push(arg);
        }
    }
    return parsed;
}
export function buildHudCommand(sessionPath) {
    return `node ${shellQuote(hudPath)} --codex${sessionPath ? ` ${shellQuote(sessionPath)}` : ''} --watch`;
}
export function buildCodexCommand(realCodex, codexArgs) {
    const args = codexArgs.map(shellQuote).join(' ');
    const envPrefix = 'CODEX_HUD_ACTIVE=1';
    return `${envPrefix} ${shellQuote(realCodex)}${args ? ` ${args}` : ''}`;
}
export function run(argv = process.argv.slice(2), env = process.env) {
    const parsed = parseArgs(argv, env);
    const hudCommand = buildHudCommand(parsed.sessionPath);
    if (env.TMUX) {
        const split = spawnSync('tmux', ['split-window', '-h', '-l', '64', hudCommand], { stdio: 'inherit' });
        if (split.status !== 0)
            return split.status ?? 1;
        if (parsed.hudOnly)
            return 0;
        const codex = spawnSync(parsed.realCodex, parsed.codexArgs, {
            stdio: 'inherit',
            env: { ...env, CODEX_HUD_ACTIVE: '1' },
        });
        return codex.status ?? 1;
    }
    const firstCommand = parsed.hudOnly ? hudCommand : buildCodexCommand(parsed.realCodex, parsed.codexArgs);
    const create = spawnSync('tmux', ['new-session', '-d', '-s', parsed.sessionName, firstCommand], { stdio: 'inherit' });
    if (create.status !== 0)
        return create.status ?? 1;
    if (!parsed.hudOnly) {
        const split = spawnSync('tmux', ['split-window', '-t', parsed.sessionName, '-h', '-l', '64', hudCommand], {
            stdio: 'inherit',
        });
        if (split.status !== 0)
            return split.status ?? 1;
        spawnSync('tmux', ['select-pane', '-t', `${parsed.sessionName}:0.0`], { stdio: 'inherit' });
    }
    if (parsed.attach) {
        const attach = spawnSync('tmux', ['attach-session', '-t', parsed.sessionName], { stdio: 'inherit' });
        return attach.status ?? 0;
    }
    console.log(`Started tmux session ${parsed.sessionName}. Attach with: tmux attach -t ${parsed.sessionName}`);
    return 0;
}
function shellQuote(value) {
    return `'${value.replace(/'/g, "'\\''")}'`;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = run();
}
//# sourceMappingURL=tmux.js.map