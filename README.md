# AgileBuilder Core

[简体中文](./README.zh-CN.md)

> Template-driven project scaffolding and AI collaboration runtime for teams, delivered through CLI, Web UI, and MCP-based AI IDE integration.

AgileBuilder Core is the installable runtime behind the AgileBuilder CLI and MCP server. It is designed around a simple idea:

- teams should be able to create projects from reusable project templates
- teams should be able to publish engineering rules and project documents as shared context
- AI IDEs should be able to read that context before generating or modifying code
- developers should be able to maintain all of this through CLI or Web UI

This repository is the open-source `core` package published as `agilebuilder`.

## Table of Contents

- [What This Project Is](#what-this-project-is)
- [Why AgileBuilder](#why-agilebuilder)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Public CLI Commands](#public-cli-commands)
- [Hidden and Advanced Commands](#hidden-and-advanced-commands)
- [Configuration and Environment Variables](#configuration-and-environment-variables)
- [Authentication and Workspace Model](#authentication-and-workspace-model)
- [Resource Model](#resource-model)
- [Web UI](#web-ui)
- [MCP and AI IDE Integration](#mcp-and-ai-ide-integration)
- [Open Source Core and SaaS](#open-source-core-and-saas)
- [Programmatic API](#programmatic-api)
- [Pro Module Boundary](#pro-module-boundary)
- [Local Data Directory](#local-data-directory)
- [Development](#development)
- [Security and Privacy Notes](#security-and-privacy-notes)
- [Open Source Scope](#open-source-scope)
- [Feedback and License](#feedback-and-license)

## What This Project Is

AgileBuilder Core is not just a scaffolding CLI and not just an MCP server. It is better understood as a **team-oriented local execution layer for project bootstrapping, resource governance, and AI-assisted development**.

At runtime it provides:

- CLI entrypoints: `agilebuilder`, `ag`, `agilebuilder-mcp`
- local state management under the user home directory
- login/logout and token refresh handling
- local and cloud workspace selection
- local and cloud resource browsing
- project creation from template resources
- a local Web UI server
- Pro module download, verification, load, and update

In practical terms, AgileBuilder Core gives teams a way to:

- maintain reusable project templates as managed resources
- create new projects from team templates instead of ad hoc copy-paste scaffolding
- publish team documentation and engineering conventions as AI-readable context
- let AI IDEs read those templates and documents through MCP before generating code
- manage templates, documents, workspaces, and runtime settings through CLI or Web UI

The package also exports a programmatic API for selected runtime capabilities, but the primary user-facing interfaces are CLI, Web UI, and MCP.

## Why AgileBuilder

The value of AgileBuilder is best understood across four connected workflows.

### 1. Team scaffolding from reusable templates

AgileBuilder treats templates as first-class resources. Teams can maintain project templates in local or cloud workspaces and use them as the standard entrypoint for new projects.

That matters because it turns project setup into a governed workflow:

- teams define the approved starting structure once
- developers and AI assistants reuse the same template catalog
- project creation becomes repeatable across languages, frameworks, and business lines
- template updates can be centrally maintained instead of copied across many repos

### 2. AI development that follows team conventions

AgileBuilder also treats documents as first-class resources and exposes them through MCP resource URIs. That allows an AI IDE to read team guidance before it starts generating or editing code.

Typical examples include:

- architecture notes
- coding conventions
- delivery checklists
- template usage guidance
- project-specific constraints

This is the key idea: **the same runtime that provides project templates also provides the rules and documents that tell AI how those projects should be built and changed**.

### 3. Resource maintenance through Web UI

The Web UI is part of the operating model, not just a demo shell. It provides a visual way to:

- browse templates and documents
- inspect local and cloud resources
- manage resource metadata and content
- review runtime settings without touching raw local files

That makes AgileBuilder usable for both terminal-first developers and teams that prefer a visual maintenance workflow.

### 4. One runtime, two delivery models

AgileBuilder can be presented as:

- an open-source, free `core` runtime for local CLI, Web UI, and MCP workflows
- an AgileBuilder SaaS platform for shared cloud workspaces, managed resources, and team-wide collaboration

That positioning is consistent with the current implementation:

- local-first workflows are available through the open-source runtime
- cloud workspaces and cloud resources are supported through backend integration
- AI IDE integration is exposed through the local MCP server
- template-driven project creation is implemented in the runtime and MCP tool layer

## Installation

### Global installation

```bash
npm install -g agilebuilder
```

This installs:

- `agilebuilder`
- `ag`
- `agilebuilder-mcp`

### Local development installation

```bash
npm install
cd ui
npm install
cd ..
```

## Quick Start

### 1. Inspect the CLI

```bash
ag --help
ag --version
```

### 2. Log in

```bash
ag login
```

The login flow uses OAuth 2.0 Authorization Code + PKCE. The CLI:

1. starts a temporary local callback server on `127.0.0.1`
2. opens the browser
3. exchanges the authorization code for tokens
4. stores encrypted auth state locally

### 3. Select a workspace

```bash
ag space
ag space list
ag space current
```

### 4. Browse templates and documents

```bash
ag res list
```

Templates and documents are both managed as resources. In the local workspace you can add, edit, and remove them interactively. In cloud workspaces you can browse the shared team catalog.

### 5. Start the Web UI

```bash
ag ui
```

Use the Web UI when you want to manage templates, documents, and runtime settings through a visual interface.
The local UI binds to `127.0.0.1` by default and is intended for on-machine use only.

### 6. Start MCP for an AI IDE

```bash
agilebuilder-mcp
```

Then connect your AI IDE to the MCP server so it can:

- discover available project templates
- read template metadata before project creation
- read team documents and usage guidance
- create projects through the controlled template workflow

## Public CLI Commands

The root help intentionally stays short. These are the commands shown in normal help output.

### `ag login`

Log in to AgileBuilder Cloud.

Notes:

- when you are logged out, `login` is shown in the root help
- when you are logged in, the root help shows `logout` instead
- both commands still exist even when one is hidden from the main help screen

### `ag logout`

Log out the current account and clear local authentication state.

### `ag space`

Manage workspaces.

Commands:

```bash
ag space
ag space list
ag space ls
ag space current
```

Behavior:

- `ag space` opens an interactive selector
- `list` and `ls` print available workspaces
- `current` prints the currently selected workspace

### `ag res`

Browse and manage resources in the current workspace.

Commands:

```bash
ag res
ag resource
ag res list
ag res list --offline
ag res add
ag res edit
ag res remove
ag res remove --force
ag res rm --force
```

Behavior:

- `ag res` and `ag resource` are equivalent
- `list` opens an interactive resource browser
- `list --offline` uses local cache when possible
- `add`, `edit`, and `remove` are available only in the local workspace
- `remove` also has alias `rm`

### `ag ui`

Start the local Web UI server.

```bash
ag ui
ag ui --port 3456
ag ui --no-open
```

### `ag config`

Open interactive CLI preferences.

Today it manages:

- CLI language: `auto`, `zh-CN`, `en-US`
- backend profile: `auto`, `china`, `global`

## Hidden and Advanced Commands

These commands are part of the runtime but are intentionally hidden from the root help by default.

### `ag status`

Show current login status and runtime summary.

It includes:

- CLI version
- current account
- email or mobile when available
- token validity
- current workspace
- current plan
- Pro access state

### `ag pro`

Interactive Pro module management entrypoint.

Available subcommands:

```bash
ag pro
ag pro info
ag pro load
ag pro unload
ag pro update
ag pro verify
```

Typical usage:

- inspect installed Pro module details
- verify integrity
- load or unload the module
- download updates

Important:

- Pro management requires login
- it also requires that at least one available workspace has Pro access

### `ag device`

Manage registered devices.

```bash
ag device list
ag device revoke <device-id>
ag device revoke-all
```

Typical usage:

- inspect registered devices for the current account
- revoke a single device
- revoke all devices except the current one

### `ag mcp-debug-resources`

Debug what templates and documents are visible to MCP.

```bash
ag mcp-debug-resources
ag mcp-debug-resources --json
ag mcp-debug-resources --all-spaces
ag mcp-debug-resources --all-spaces --json
```

This is especially useful when:

- an AI IDE cannot see a template you expect
- MCP appears to expose fewer docs than expected
- you need to compare current-space visibility with cross-space visibility

## Configuration and Environment Variables

### CLI config file

CLI preferences are stored under the local data directory in:

```text
~/.agilebuilder/v2/config.json
```

### Backend profile detection

When backend profile is set to `auto`, the runtime resolves it using locale and timezone heuristics:

- `zh-CN` locale or China timezone -> `china`
- otherwise -> `global`

You can override this interactively with:

```bash
ag config
```

### CLI environment loading

The CLI entrypoint loads environment variables in this order:

1. `.env.local`
2. `.env`

This applies to `agilebuilder` and `ag`.

### Important MCP nuance

`agilebuilder-mcp` does not automatically read `.env.local` or `.env`.

For AI IDE integration, pass environment variables directly through the IDE MCP config if you need custom backend endpoints, debugging, or proxy behavior.

### Supported environment variables

- `AG_BACKEND_CHINA_SSO_URL`
- `AG_BACKEND_CHINA_WORKSPACE_URL`
- `AG_BACKEND_GLOBAL_SSO_URL`
- `AG_BACKEND_GLOBAL_WORKSPACE_URL`
- `DEBUG`
- `AG_PROXY`

Example:

```env
AG_BACKEND_CHINA_SSO_URL=https://china-auth.example.com
AG_BACKEND_CHINA_WORKSPACE_URL=https://china-workspace.example.com
AG_BACKEND_GLOBAL_SSO_URL=https://api-auth.agilebuilder.net
AG_BACKEND_GLOBAL_WORKSPACE_URL=https://api-app.agilebuilder.net
# DEBUG=true
# AG_PROXY=http://127.0.0.1:9099
```

### Proxy support

If `AG_PROXY` is set, HTTP requests use a proxy-aware fetch layer. Debug output is sanitized to avoid exposing full proxy credentials.

## Authentication and Workspace Model

### Local-first behavior

The runtime always supports a local workspace path, even when the user is not logged in.

That means:

- you can use the CLI without cloud login for local-only workflows
- local resources remain available offline
- cloud-dependent features require login and reachable backend services

### Workspace types

The runtime works with:

- a built-in local workspace
- cloud workspaces returned from the authenticated account context

The selected workspace influences:

- which resources are visible
- whether cloud APIs are used
- which plan and features are active
- whether Pro-related capabilities may become available

## Resource Model

AgileBuilder Core treats templates and documents as resources.

### Local resources

In the local workspace, resource management is interactive and stored in the local database.

Supported local resource types:

- template
- document

Available operations:

- create
- edit
- remove
- browse

### Cloud resources

In cloud workspaces, resources are browsed through the current workspace context and backend APIs.

Current behavior includes:

- interactive browsing
- local cache fallback
- template detail reading
- document detail reading
- project creation from template resources

### Why this model matters

This resource model is what connects the scaffolding workflow and the AI workflow:

- templates define how new projects should start
- documents define how those projects should be implemented and maintained
- MCP exposes both to AI IDEs in a controlled way

## Web UI

The Web UI is served locally by the CLI runtime.

Start it with:

```bash
ag ui
```

By default the local server listens on:

```text
http://127.0.0.1:3456
```

The current UI is mainly used for:

- browsing templates and documents
- inspecting resource details
- stepping through resource creation and edit flows
- accessing runtime settings

Server-side routes currently include:

- `/api/templates`
- `/api/docs`
- `/api/resources`
- `/api/settings`

## MCP and AI IDE Integration

### What MCP exposes

The MCP runtime exposes both tools and readable resources.

### Tools

Current tools are:

- `listTemplates`
- `searchTemplates`
- `getTemplateInfo`
- `createProjectByTemplate`

`getTemplateInfo` accepts:

- preferred `resourceId` for exact lookup
- optional `spaceId` for explicit disambiguation
- fallback `name` when `resourceId` is unavailable

Recommended workflow for AI IDEs:

1. `listTemplates` or `searchTemplates`
2. `getTemplateInfo({ resourceId, spaceId? })`
3. read relevant document resources
4. `createProjectByTemplate({ resourceId, targetPath, spaceId? })`

### Resources

The MCP runtime also exposes guidance and document resources, including these URI families:

- `agilebuilder://usage/agent-policy`
- `agilebuilder://usage/guide`
- `agilebuilder://docs/catalog`
- `agilebuilder://docs/local/{id}`
- `agilebuilder://docs/cloud/{spaceId}/{resourceId}`

This is important because the project is designed so AI agents can read project-specific documents before generating or modifying code.

In other words, AgileBuilder is designed so AI IDEs do not operate from generic model priors alone. They can be grounded in:

- the team template catalog
- project creation metadata
- local documents
- cloud documents
- usage guidance exposed by the runtime itself

### Generic MCP config example

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "agilebuilder-mcp"
    }
  }
}
```

### MCP config with explicit environment

Use this form when your AI IDE needs custom endpoints or proxy settings:

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "agilebuilder-mcp",
      "env": {
        "AG_BACKEND_GLOBAL_SSO_URL": "https://api-auth.agilebuilder.net",
        "AG_BACKEND_GLOBAL_WORKSPACE_URL": "https://api-app.agilebuilder.net",
        "DEBUG": "false"
      }
    }
  }
}
```

### Development-time MCP config

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "node",
      "args": ["D:/path/to/core/dist/mcp/index.js"]
    }
  }
}
```

### How AI IDEs should use AgileBuilder

If the AI IDE is connected through MCP, the intended behavior is:

- use MCP tools to discover templates instead of guessing template names
- inspect template details before project creation
- read exposed document resources before working on an existing project
- call `createProjectByTemplate` only after the target path is clear

This is the core AI workflow that AgileBuilder enables: **select a team template, read team documentation, then generate or change code under those constraints**.

## Open Source Core and SaaS

AgileBuilder is best presented as a dual offering:

- an open-source, free `core` runtime for local CLI, Web UI, and MCP workflows
- an AgileBuilder SaaS platform for shared cloud workspaces, managed resources, and team-wide collaboration

This repository is the open-source side of that model.

The practical message for users is:

- use the open-source core if you want a local, scriptable development runtime
- use AgileBuilder SaaS when you want shared workspace resources and a managed team platform on top of that runtime

## Programmatic API

The package exposes two Node entrypoints:

- `agilebuilder`: public stable exports intended for external consumers
- `agilebuilder/internal`: internal exports for official workspace packages such as the desktop sidecar

The public entrypoint is intentionally small. It currently exposes selected runtime APIs from `dist/index.js`.

That means Node consumers can import it like this:

```ts
import { login, logout, isLoggedIn, APP_VERSION } from 'agilebuilder';
```

The internal entrypoint exists for first-party packages only:

```ts
import { TokenStore, ProcessorFactory } from 'agilebuilder/internal';
```

`agilebuilder/internal` is not part of the public semver contract and may change between releases. For most users, CLI, Web UI, MCP, and the small public Node API are the stable interfaces.

## Pro Module Boundary

This repository includes the open-source side of Pro module management:

- status checks
- download flow
- integrity verification
- load and unload behavior
- update orchestration

It does not include the closed-source Pro module implementation itself.

## Local Data Directory

Runtime data is stored by default in:

```text
~/.agilebuilder/v2/
```

Common files and directories include:

- `templates.db`
- `auth.dat`
- `license.dat`
- `current-space.json`
- `.device`
- `config.json`
- `.initialized`
- `ignored-versions.json`
- `modules/pro/index.js`

This directory may contain sensitive information and should not be shared directly.

## Development

### Build

```bash
npm run build
```

This builds:

- TypeScript output under `dist/`
- Web UI output under `ui/dist/`

### Test

```bash
npm test
```

The current automated checks cover:

- compiled unit tests for auth, license, and Pro module integrity flows
- CLI version and help output
- public command surface checks
- MCP stdio startup
- stale build artifact checks

### Run from source

```bash
npm run dev
npm run start
npm run mcp
npm run ui:dev
```

### Pre-release verification

Before publishing, at minimum run:

```bash
npm run build
npm test
npm audit --omit=dev
npm pack --dry-run
```

## Security and Privacy Notes

- do not paste tokens, refresh tokens, device IDs, or raw cache files into public issues
- do not share the entire `~/.agilebuilder/v2/` directory
- do not include private backend endpoints or internal network information in public bug reports
- CLI and MCP debug output are sanitized, but issue reports should still be manually reviewed before posting

## Open Source Scope

This repository is suitable for open-source collaboration around:

- CLI behavior
- MCP runtime and tool exposure
- Web UI runtime
- local data models
- resource browsing and project creation flows
- documentation, testing, packaging, and CI

It is not the place for proprietary backend implementation details or closed-source Pro internals.

## Feedback and License

Repository:

- `https://github.com/agilebuilder/agilebuilder-core`

Issues:

- `https://github.com/agilebuilder/agilebuilder-core/issues`

Homepage:

- `https://www.agilebuilder.net`

License:

- MIT
