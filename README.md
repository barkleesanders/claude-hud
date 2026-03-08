<div align="center">

<img src="assets/claude-hud-logo.png" alt="claude-hud" width="600">

# claude-hud

**Real-time heads-up display for Claude Code**

Context health · Tool activity · Agent tracking · Rate limits · Git status

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

---

<div align="center">
<img src="assets/screenshot.png?v=2" alt="claude-hud demo" width="900">
</div>

---

## What You See

```
[Opus 4.6] ████████░░ 78% | main* | 2 CLAUDE.md | 5 MCPs | 4 hooks | ⏱️ 23m | ◐ thinking
◐ Edit: .../auth.ts | ✓ Read ×4 | ✓ Grep ×3 | ✓ Bash ×2
◐ Explore [haiku]: Finding auth patterns (1m 32s)
▸ Fix authentication token refresh (2/5)

current   ●●○○○○○○○○  21% ⟳ 3:00pm
weekly    ●●●●●○○○○○  52% ⟳ mar 12, 8:00pm
sonnet 7d ○○○○○○○○○○   0% ⟳ mar 12, 8:00pm
extra     ○○○○○○○○○○ $0.00/$50.00
```

| Line | What | Why |
|------|------|-----|
| **Session** | Model, context %, git branch, configs, thinking mode | Know when to compact before it's too late |
| **Tools** | Running + completed tools with targets | Watch Claude work in real-time |
| **Agents** | Subagent type, model, description, elapsed | See what's happening in parallel |
| **Todos** | Current task + progress counter | Track completion live |
| **Rate limits** | 5-hour, 7-day, extra usage with reset times | Never get surprised by throttling |

## Install

```bash
git clone https://github.com/barkleesanders/claude-hud
cd claude-hud
npm ci && npm run build
```

Add to your `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/claude-hud/dist/index.js"
  }
}
```

Replace `/path/to/claude-hud` with the actual path.

## Features

### Context Health

Visual meter with color coding as your context fills up.

| Threshold | Color | Action |
|-----------|-------|--------|
| <70% | Green | Normal |
| 70-85% | Yellow | Warning |
| >85% | Red | Shows token breakdown |
| >95% | Red | Shows ⚠️ COMPACT |

### Git Integration

Shows current branch and dirty status directly in the status line.

```
main*     ← dirty (uncommitted changes)
feature   ← clean
```

### Thinking Mode

Indicates whether extended thinking is enabled.

```
◐ thinking    ← enabled (magenta)
◑ thinking    ← disabled (dimmed)
```

### Rate Limits

Fetches your Anthropic API usage via OAuth and displays:

- **Current** — 5-hour rolling window with reset time
- **Weekly** — 7-day all-models window with reset time
- **Opus 7d** — Opus-specific weekly window (when present)
- **Sonnet 7d** — Sonnet-specific weekly window (when present)
- **Extra** — Overage credits used vs monthly limit

Color-coded progress bars: green at low usage, through orange and yellow, to red above 90%.

Cached for 5 minutes. Uses `claude-code/*` User-Agent to avoid 429 rate-limit errors during active sessions (learned from [CodexBar](https://github.com/steipete/CodexBar)). Token resolved from macOS Keychain, `~/.claude/.credentials.json`, or `CLAUDE_CODE_OAUTH_TOKEN` env var.

### Tool Activity

Tracks tools from the session transcript:

```
◐ Edit: .../auth.ts | ✓ Read ×4 | ✓ Grep ×3
```

- Running tools show a spinner + target file
- Completed tools aggregate by type with counts

### Agent Tracking

Shows subagent type, model, description, and elapsed time:

```
◐ Explore [haiku]: Finding auth patterns (1m 32s)
✓ code-reviewer: Review authentication changes (45s)
```

### Todo Progress

```
▸ Fix authentication token refresh (2/5)
✓ All todos complete (5/5)
```

## Architecture

```
Claude Code → stdin JSON → claude-hud → stdout → terminal
           ↘ transcript JSONL → tools, agents, todos
           ↘ OAuth API → rate limits (cached 60s)
           ↘ git CLI → branch, dirty status
           ↘ settings.json → thinking mode, configs
```

### Data Sources

| Data | Source | Accuracy |
|------|--------|----------|
| Model, tokens, context | stdin JSON from Claude Code | Native (exact) |
| Tools, agents, todos | Transcript JSONL parsing | Real-time |
| Rate limits | Anthropic OAuth usage API | Cached 60s |
| Git info | `git` CLI | Real-time |
| Config counts | File system scan | Real-time |

### File Structure

```
src/
├── index.ts              Entry point
├── stdin.ts              Parse Claude's JSON input
├── transcript.ts         Parse transcript JSONL
├── config-reader.ts      Read MCP/rules/hooks configs
├── rate-limits.ts        OAuth token + API rate limits
├── git-info.ts           Git branch + dirty status
├── types.ts              TypeScript interfaces
└── render/
    ├── index.ts           Render coordinator
    ├── session-line.ts    Model, context, git, thinking
    ├── tools-line.ts      Tool activity
    ├── agents-line.ts     Agent status
    ├── todos-line.ts      Todo progress
    ├── rate-limits-line.ts Rate limit bars
    └── colors.ts          ANSI color helpers
```

## Development

```bash
git clone https://github.com/barkleesanders/claude-hud
cd claude-hud
npm ci
npm run build
npm test
```

### Test manually

```bash
echo '{"model":{"display_name":"Opus 4.6"},"context_window":{"current_usage":{"input_tokens":45000},"context_window_size":200000},"cwd":"/your/project"}' | node dist/index.js
```

### Re-record demo video

```bash
# Requires: npm i -g webreel
webreel record demo
ffmpeg -y -i assets/demo.mp4 -vf "fps=15,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" -loop 0 assets/demo.gif
```

## Requirements

- Claude Code v1.0.80+
- Node.js 18+
- `jq`, `curl`, `git` (for rate limits and git info)

## Credits

- Originally built by [Jarrod Watts](https://github.com/jarrodwatts/claude-hud) — session, tools, agents, and todos lines
- Rate limits, git integration, and thinking mode by [Barklee Sanders](https://github.com/barkleesanders), inspired by [kamranahmedse/claude-statusline](https://github.com/kamranahmedse/claude-statusline)
- Logo generated with [nano-banana](https://github.com/kingbootoshi/nano-banana-2-skill)
- Demo video recorded with [WebReel](https://github.com/vercel-labs/webreel)

## License

MIT — see [LICENSE](LICENSE)
