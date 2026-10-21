# Contributing

Thanks for contributing to Claude HUD. This repo is small and fast-moving, so we optimize for clarity and quick review.

## How to Contribute

1) Fork and clone the repo
2) Create a branch
3) Make your changes
4) Run tests and update docs if needed
5) Open a pull request

## Development

```bash
npm ci
npm run build
npm test
```

## Tests

See `TESTING.md` for the full testing strategy, fixtures, and snapshot updates.

The HUD and `npm test` support Node 18+. Coverage uses c8 12 and requires
Node 20.19+, Node 22.12+, or a newer supported Node release. CI runs the full
suite on Node 18, 20, 24, and 26, with coverage on the newer versions.

## Code Style

- Keep changes focused and small.
- Prefer tests for behavior changes.
- Avoid introducing dependencies unless necessary.

## Pull Requests

- Describe the problem and the fix.
- Include tests or explain why they are not needed.
- Link issues when relevant.
