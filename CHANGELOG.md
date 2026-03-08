# Changelog

All notable changes to Claude HUD will be documented in this file.

## [2.1.0] - 2026-03-08

### Fixed
- **Rate limit 429 errors during active sessions**: Changed User-Agent from `claude-hud/1.0` to `claude-code/{version}`, matching what [CodexBar](https://github.com/steipete/CodexBar) does. The Anthropic usage API rate-limits unrecognized user agents during active Claude Code sessions.
- Reduced API failure cooldown from 30s to 10s for faster recovery.
- Added retry-after header support for smarter 429 backoff.

### Added
- **Model-specific rate limit windows**: Now shows Opus 7d and Sonnet 7d utilization when the API returns them (inspired by CodexBar's tertiary window display).
- `seven_day_opus`, `seven_day_sonnet`, `seven_day_oauth_apps`, `seven_day_cowork`, and `iguana_necktie` fields parsed from OAuth usage API response.
- `extra_usage.currency` field support.
- Auto-detection of installed Claude Code version for User-Agent header.
- Aligned label padding in rate limits display for visual consistency.

## [2.0.0] - 2025-01-02

### Changed
- Complete rewrite from split-pane TUI to inline statusline
- New statusline renderer with multi-line output
- Transcript-driven tool/agent/todo parsing
- Native context usage from stdin JSON

### Removed
- Hook-based capture flow
- Split-pane UI and related components

