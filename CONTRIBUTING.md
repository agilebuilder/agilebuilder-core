# Contributing

## Scope

This repository is the open-source runtime for AgileBuilder. The current upgraded runtime focuses on CLI behavior, local/cloud resource management, template generation, authentication, workspace selection, and MCP integration.

Before contributing, make sure your change fits the open-source boundary:

- Open-source scope: CLI behavior, local resource management, cloud client integration, MCP runtime, docs, build/test/release tooling.
- Out of scope here: proprietary backend implementation details and closed-source Pro internals.

## Public API

- `agilebuilder` is the public package and CLI runtime.
- Keep the public Node entrypoint intentionally small.
- Avoid exposing internal stores, clients, or command internals as stable API unless they are meant to be supported across releases.

## Development Setup

```bash
npm install
npm run build
npm test
```

## Branch and PR Expectations

- Keep changes focused and reviewable.
- Update docs when behavior changes.
- Add or update tests when release behavior changes.
- Do not commit secrets, local `.env` files, tokens, API keys, or internal-only URLs.

## Reporting Bugs

Use GitHub Issues:

- `https://github.com/agilebuilder/agilebuilder-core/issues`

Before filing a bug:

- Confirm the issue still reproduces on the latest release or main branch.
- Include `ag --version`.
- Include sanitized logs only.
- Remove tokens, private paths, workspace IDs, resource IDs, device IDs, and backend secrets.

## Pull Request Checklist

- `npm run build`
- `npm test`
- `npm audit --omit=dev`
- `npm pack --dry-run`
- Relevant docs updated
- No sensitive data added to the repository
