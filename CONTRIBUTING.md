# Contributing

## Scope

This repository is the open-source `core` runtime for AgileBuilder. It includes the CLI, Web UI server, local data/runtime logic, and MCP entrypoint.

Before contributing, make sure your change fits the open-source boundary:

- Open-source scope: CLI behavior, local resource management, MCP runtime, Web UI, docs, build/test/release tooling
- Out of scope here: closed-source Pro module internals and private backend implementation details

## Public vs Internal API

- `agilebuilder` is the public stable Node entrypoint and should stay intentionally small
- `agilebuilder/internal` exists for first-party packages such as the desktop sidecar
- Do not move internal-only classes or stores into the public entrypoint unless you explicitly want to support them as stable API

## Development Setup

```bash
npm install
cd ui
npm install
cd ..
npm run build
npm test
```

## Branch and PR Expectations

- Keep changes focused and reviewable
- Update docs when behavior changes
- Add or update smoke coverage when release behavior changes
- Do not commit secrets, local `.env` files, tokens, or internal-only URLs

## Reporting Bugs

Use GitHub Issues:

- `https://github.com/agilebuilder/agilebuilder-core/issues`

Before filing a bug:

- confirm the issue still reproduces on the latest `main`
- include `ag --version`
- include sanitized logs only
- remove tokens, private paths, `spaceId`, `resourceId`, device IDs, and backend secrets

## Pull Request Checklist

- `npm run build`
- `npm test`
- `npm pack --dry-run`
- Relevant docs updated
- No sensitive data added to the repository
