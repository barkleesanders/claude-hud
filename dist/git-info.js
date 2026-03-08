import { execSync } from 'child_process';
export function getGitInfo(cwd) {
    if (!cwd)
        return null;
    try {
        const isGit = execSync('git rev-parse --is-inside-work-tree 2>/dev/null', {
            cwd,
            encoding: 'utf8',
            timeout: 2000,
        }).trim();
        if (isGit !== 'true')
            return null;
        const branch = execSync('git symbolic-ref --short HEAD 2>/dev/null', {
            cwd,
            encoding: 'utf8',
            timeout: 2000,
        }).trim();
        const porcelain = execSync('git status --porcelain 2>/dev/null', {
            cwd,
            encoding: 'utf8',
            timeout: 2000,
        }).trim();
        return {
            branch: branch || 'HEAD',
            dirty: porcelain.length > 0,
        };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=git-info.js.map