import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
const CACHE_DIR = '/tmp/claude';
const CACHE_FILE = path.join(CACHE_DIR, 'statusline-usage-cache.json');
const COOLDOWN_FILE = path.join(CACHE_DIR, 'statusline-usage-cooldown');
const CACHE_MAX_AGE_MS = 300_000; // 5 minutes — rate limits change slowly
const COOLDOWN_MS = 30_000; // 30s backoff after API failure
function getOAuthToken() {
    // 1. Environment variable
    const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (envToken)
        return envToken;
    // 2. macOS Keychain
    if (process.platform === 'darwin') {
        try {
            const blob = execSync('security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null', { encoding: 'utf8', timeout: 3000 }).trim();
            if (blob) {
                const parsed = JSON.parse(blob);
                const token = parsed?.claudeAiOauth?.accessToken;
                if (token)
                    return token;
            }
        }
        catch {
            // Keychain not available or no credential
        }
    }
    // 3. Credentials file
    const credsFile = path.join(os.homedir(), '.claude', '.credentials.json');
    if (fs.existsSync(credsFile)) {
        try {
            const content = fs.readFileSync(credsFile, 'utf8');
            const parsed = JSON.parse(content);
            const token = parsed?.claudeAiOauth?.accessToken;
            if (token)
                return token;
        }
        catch {
            // Ignore
        }
    }
    // 4. Linux secret-tool
    if (process.platform === 'linux') {
        try {
            const blob = execSync('timeout 2 secret-tool lookup service "Claude Code-credentials" 2>/dev/null', { encoding: 'utf8', timeout: 3000 }).trim();
            if (blob) {
                const parsed = JSON.parse(blob);
                const token = parsed?.claudeAiOauth?.accessToken;
                if (token)
                    return token;
            }
        }
        catch {
            // secret-tool not available
        }
    }
    return null;
}
function readCache() {
    try {
        if (!fs.existsSync(CACHE_FILE))
            return null;
        const stat = fs.statSync(CACHE_FILE);
        const age = Date.now() - stat.mtimeMs;
        if (age > CACHE_MAX_AGE_MS)
            return null;
        const content = fs.readFileSync(CACHE_FILE, 'utf8');
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
function writeCache(data) {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
    }
    catch {
        // Non-critical
    }
}
function isOnCooldown() {
    try {
        if (!fs.existsSync(COOLDOWN_FILE))
            return false;
        const stat = fs.statSync(COOLDOWN_FILE);
        return (Date.now() - stat.mtimeMs) < COOLDOWN_MS;
    }
    catch {
        return false;
    }
}
function setCooldown() {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        fs.writeFileSync(COOLDOWN_FILE, '');
    }
    catch {
        // Non-critical
    }
}
async function fetchFromApi(token) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'anthropic-beta': 'oauth-2025-04-20',
            'User-Agent': 'claude-hud/1.0',
        },
        signal: controller.signal,
    });
    clearTimeout(timeout);
    if (response.status === 429) {
        // Retry once immediately (API returns retry-after: 0)
        const retry = await fetch('https://api.anthropic.com/api/oauth/usage', {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'anthropic-beta': 'oauth-2025-04-20',
                'User-Agent': 'claude-hud/1.0',
            },
        });
        if (!retry.ok)
            return null;
        return (await retry.json());
    }
    if (!response.ok)
        return null;
    return (await response.json());
}
function readStaleCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const content = fs.readFileSync(CACHE_FILE, 'utf8');
            return JSON.parse(content);
        }
    }
    catch {
        // Nothing available
    }
    return null;
}
export async function fetchUsageData() {
    // Allow tests to skip rate limits entirely
    if (process.env.CLAUDE_HUD_SKIP_RATE_LIMITS === '1')
        return null;
    // Check cache first
    const cached = readCache();
    if (cached)
        return cached;
    // Don't hammer the API if it recently failed
    if (isOnCooldown())
        return readStaleCache();
    const token = getOAuthToken();
    if (!token)
        return null;
    try {
        const data = await fetchFromApi(token);
        if (data?.five_hour) {
            writeCache(data);
            return data;
        }
    }
    catch {
        // Network error, timeout, etc.
    }
    // Mark cooldown so we don't retry for 30s
    setCooldown();
    // Fall back to stale cache
    return readStaleCache();
}
//# sourceMappingURL=rate-limits.js.map