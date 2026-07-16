import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ConfigCounts {
  claudeMdCount: number;
  rulesCount: number;
  mcpCount: number;
  hooksCount: number;
}

function getMcpServerNames(filePath: string): Set<string> {
  if (!fs.existsSync(filePath)) return new Set();
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(content);
    if (config.mcpServers && typeof config.mcpServers === 'object') {
      return new Set(Object.keys(config.mcpServers));
    }
  } catch {
    // Ignore errors
  }
  return new Set();
}

function countMcpServersInFile(filePath: string, excludeFrom?: string): number {
  const servers = getMcpServerNames(filePath);
  if (excludeFrom) {
    const exclude = getMcpServerNames(excludeFrom);
    for (const name of exclude) {
      servers.delete(name);
    }
  }
  return servers.size;
}

function countHooksInFile(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(content);
    if (config.hooks && typeof config.hooks === 'object') {
      return Object.keys(config.hooks).length;
    }
  } catch {
    // Ignore errors
  }
  return 0;
}

function countRulesInDir(rulesDir: string): number {
  if (!fs.existsSync(rulesDir)) return 0;
  let count = 0;
  try {
    const entries = fs.readdirSync(rulesDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(rulesDir, entry.name);
      if (entry.isDirectory()) {
        count += countRulesInDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        count++;
      }
    }
  } catch {
    // Ignore errors
  }
  return count;
}

export async function countConfigs(cwd?: string): Promise<ConfigCounts> {
  let claudeMdCount = 0;
  let rulesCount = 0;
  let mcpCount = 0;
  let hooksCount = 0;

  const homeDir = path.resolve(os.homedir());
  const claudeDir = path.join(homeDir, '.claude');
  const resolvedCwd = cwd ? path.resolve(cwd) : null;

  // Skip project scope if cwd is the home directory (would double-count)
  const isHomeCwd = resolvedCwd === homeDir;

  // === USER SCOPE ===

  // ~/.claude/CLAUDE.md
  if (fs.existsSync(path.join(claudeDir, 'CLAUDE.md'))) {
    claudeMdCount++;
  }

  // ~/.claude/rules/*.md
  rulesCount += countRulesInDir(path.join(claudeDir, 'rules'));

  // ~/.claude/settings.json (MCPs and hooks)
  const userSettings = path.join(claudeDir, 'settings.json');
  mcpCount += countMcpServersInFile(userSettings);
  hooksCount += countHooksInFile(userSettings);

  // ~/.claude.json (additional user-scope MCPs, dedupe by counting unique)
  const userClaudeJson = path.join(homeDir, '.claude.json');
  mcpCount += countMcpServersInFile(userClaudeJson, userSettings);

  // === PROJECT SCOPE ===

  if (resolvedCwd && !isHomeCwd) {
    // {cwd}/CLAUDE.md
    if (fs.existsSync(path.join(resolvedCwd, 'CLAUDE.md'))) {
      claudeMdCount++;
    }

    // {cwd}/CLAUDE.local.md
    if (fs.existsSync(path.join(resolvedCwd, 'CLAUDE.local.md'))) {
      claudeMdCount++;
    }

    // {cwd}/.claude/CLAUDE.md (alternative location)
    if (fs.existsSync(path.join(resolvedCwd, '.claude', 'CLAUDE.md'))) {
      claudeMdCount++;
    }

    // {cwd}/.claude/CLAUDE.local.md
    if (fs.existsSync(path.join(resolvedCwd, '.claude', 'CLAUDE.local.md'))) {
      claudeMdCount++;
    }

    // {cwd}/.claude/rules/*.md (recursive)
    rulesCount += countRulesInDir(path.join(resolvedCwd, '.claude', 'rules'));

    // {cwd}/.mcp.json (project MCP config)
    mcpCount += countMcpServersInFile(path.join(resolvedCwd, '.mcp.json'));

    // {cwd}/.claude/settings.json (project settings)
    const projectSettings = path.join(resolvedCwd, '.claude', 'settings.json');
    mcpCount += countMcpServersInFile(projectSettings);
    hooksCount += countHooksInFile(projectSettings);

    // {cwd}/.claude/settings.local.json (local project settings)
    const localSettings = path.join(resolvedCwd, '.claude', 'settings.local.json');
    mcpCount += countMcpServersInFile(localSettings);
    hooksCount += countHooksInFile(localSettings);
  } else if (resolvedCwd && isHomeCwd) {
    // When cwd is $HOME, only count project-specific files that aren't
    // already covered by user scope (e.g., ~/CLAUDE.md, ~/.mcp.json)
    if (fs.existsSync(path.join(resolvedCwd, 'CLAUDE.md'))) {
      claudeMdCount++;
    }
    if (fs.existsSync(path.join(resolvedCwd, 'CLAUDE.local.md'))) {
      claudeMdCount++;
    }
    // ~/.mcp.json is project-scoped only, not counted in user scope
    mcpCount += countMcpServersInFile(path.join(resolvedCwd, '.mcp.json'));
  }

  return { claudeMdCount, rulesCount, mcpCount, hooksCount };
}

export async function countCodexConfigs(cwd?: string): Promise<ConfigCounts> {
  const configPath = path.join(os.homedir(), '.codex', 'config.toml');
  const hooksPath = path.join(os.homedir(), '.codex', 'hooks.json');
  const content = readText(configPath);

  return {
    claudeMdCount: countAgentInstructionFiles(cwd),
    rulesCount: countEnabledFeatureFlags(content),
    mcpCount: countTomlTables(content, 'mcp_servers'),
    hooksCount: countHooksJson(hooksPath),
  };
}

export function readThinkingEnabled(): boolean {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) return false;
  try {
    const content = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(content);
    return settings.alwaysThinkingEnabled === true;
  } catch {
    return false;
  }
}

function countAgentInstructionFiles(cwd?: string): number {
  const seen = new Set<string>();
  let current = path.resolve(cwd ?? process.cwd());

  while (!seen.has(current)) {
    seen.add(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  let count = 0;
  for (const dir of seen) {
    if (fs.existsSync(path.join(dir, 'AGENTS.md'))) count++;
  }
  return count;
}

function countEnabledFeatureFlags(content: string): number {
  const body = getTomlTableBody(content, 'features');
  if (!body) return 0;
  const matches = body.match(/^\s*[A-Za-z0-9_]+\s*=\s*true\s*$/gm);
  return matches?.length ?? 0;
}

function countTomlTables(content: string, prefix: string): number {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\[${escaped}\\.[^\\]]+\\]`, 'gm');
  return new Set(content.match(re) ?? []).size;
}

function countHooksJson(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === 'object') return Object.keys(parsed).length;
  } catch {
    // Ignore malformed local config.
  }
  return 0;
}

function getTomlTableBody(content: string, tableName: string): string {
  const start = content.match(new RegExp(`^\\[${tableName}\\]\\s*$`, 'm'));
  if (!start || start.index == null) return '';

  const rest = content.slice(start.index + start[0].length);
  const nextTable = rest.search(/^\[[^\]]+\]\s*$/m);
  return nextTable === -1 ? rest : rest.slice(0, nextTable);
}

function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}
