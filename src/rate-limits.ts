import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

export interface RateLimitWindow {
  utilization: number;
  resets_at?: string;
}

export interface ExtraUsage {
  is_enabled: boolean;
  utilization: number;
  used_credits: number;
  monthly_limit: number;
  currency?: string;
}

export interface UsageData {
  five_hour: RateLimitWindow;
  seven_day: RateLimitWindow;
  seven_day_opus?: RateLimitWindow;
  seven_day_sonnet?: RateLimitWindow;
  seven_day_oauth_apps?: RateLimitWindow;
  iguana_necktie?: RateLimitWindow;
  extra_usage?: ExtraUsage;
}

const CACHE_DIR = '/tmp/claude';
const CACHE_FILE = path.join(CACHE_DIR, 'statusline-usage-cache.json');
const COOLDOWN_FILE = path.join(CACHE_DIR, 'statusline-usage-cooldown');
const CACHE_MAX_AGE_MS = 300_000; // 5 minutes — rate limits change slowly
const COOLDOWN_MS = 10_000; // 10s backoff after API failure (reduced from 30s)
const BETA_HEADER = 'oauth-2025-04-20';

/**
 * Detect the installed Claude Code version to use as User-Agent.
 * CodexBar does the same thing (ClaudeOAuthUsageFetcher.swift:92-98) -
 * the Anthropic API allows requests with "claude-code/*" User-Agent
 * even during active sessions, while other user agents get 429.
 */
function getClaudeCodeVersion(): string {
  try {
    const output = execSync('claude --version 2>/dev/null', {
      encoding: 'utf8',
      timeout: 3000,
    }).trim();
    // Output is like "2.1.71 (Claude Code)" — extract the version number
    const match = output.match(/^(\d+\.\d+\.\d+)/);
    if (match) return match[1];
  } catch {
    // claude not installed or not on PATH
  }
  return '2.1.0'; // Fallback version
}

// Cache the detected version for the process lifetime
let _cachedClaudeVersion: string | null = null;
function getUserAgent(): string {
  if (!_cachedClaudeVersion) {
    _cachedClaudeVersion = getClaudeCodeVersion();
  }
  return `claude-code/${_cachedClaudeVersion}`;
}

function getOAuthToken(): string | null {
  // 1. Environment variable
  const envToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (envToken) return envToken;

  // 2. macOS Keychain
  if (process.platform === 'darwin') {
    try {
      const blob = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
        { encoding: 'utf8', timeout: 3000 }
      ).trim();
      if (blob) {
        const parsed = JSON.parse(blob);
        const token = parsed?.claudeAiOauth?.accessToken;
        if (token) return token;
      }
    } catch {
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
      if (token) return token;
    } catch {
      // Ignore
    }
  }

  // 4. Linux secret-tool
  if (process.platform === 'linux') {
    try {
      const blob = execSync(
        'timeout 2 secret-tool lookup service "Claude Code-credentials" 2>/dev/null',
        { encoding: 'utf8', timeout: 3000 }
      ).trim();
      if (blob) {
        const parsed = JSON.parse(blob);
        const token = parsed?.claudeAiOauth?.accessToken;
        if (token) return token;
      }
    } catch {
      // secret-tool not available
    }
  }

  return null;
}

function readCache(): UsageData | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const stat = fs.statSync(CACHE_FILE);
    const age = Date.now() - stat.mtimeMs;
    if (age > CACHE_MAX_AGE_MS) return null;
    const content = fs.readFileSync(CACHE_FILE, 'utf8');
    return JSON.parse(content) as UsageData;
  } catch {
    return null;
  }
}

function writeCache(data: UsageData): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
  } catch {
    // Non-critical
  }
}

function isOnCooldown(): boolean {
  try {
    if (!fs.existsSync(COOLDOWN_FILE)) return false;
    const stat = fs.statSync(COOLDOWN_FILE);
    return (Date.now() - stat.mtimeMs) < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function setCooldown(): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(COOLDOWN_FILE, '');
  } catch {
    // Non-critical
  }
}

function makeHeaders(token: string): Record<string, string> {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'anthropic-beta': BETA_HEADER,
    'User-Agent': getUserAgent(),
  };
}

async function fetchFromApi(token: string): Promise<UsageData | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  const headers = makeHeaders(token);

  const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers,
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (response.status === 429) {
    // Respect retry-after header if present
    const retryAfter = response.headers.get('retry-after');
    const delayMs = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 5000) : 500;
    await new Promise(resolve => setTimeout(resolve, delayMs));

    const retry = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers,
    });
    if (!retry.ok) return null;
    return (await retry.json()) as UsageData;
  }

  if (!response.ok) return null;
  return (await response.json()) as UsageData;
}

function readStaleCache(): UsageData | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, 'utf8');
      return JSON.parse(content) as UsageData;
    }
  } catch {
    // Nothing available
  }
  return null;
}

export async function fetchUsageData(): Promise<UsageData | null> {
  // Allow tests to skip rate limits entirely
  if (process.env.CLAUDE_HUD_SKIP_RATE_LIMITS === '1') return null;

  // Check cache first
  const cached = readCache();
  if (cached) return cached;

  // Don't hammer the API if it recently failed
  if (isOnCooldown()) return readStaleCache();

  const token = getOAuthToken();
  if (!token) return null;

  try {
    const data = await fetchFromApi(token);
    if (data?.five_hour) {
      writeCache(data);
      return data;
    }
  } catch {
    // Network error, timeout, etc.
  }

  // Mark cooldown so we don't retry for 10s
  setCooldown();

  // Fall back to stale cache
  return readStaleCache();
}
