# AgileBuilder Core

[简体中文](./README.zh-CN.md)

> AI-native developer tooling for template-based project creation and document-guided development through CLI and MCP.

AgileBuilder Core is the installable runtime behind the AgileBuilder command line and MCP server. It gives teams a local-first way to manage reusable templates, keep project documents as structured resources, and let AI IDEs discover that context before creating or changing code.

This package is published to npm as `agilebuilder`.

## Table Of Contents

- [What It Provides](#what-it-provides)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Commands](#cli-commands)
- [Workspaces](#workspaces)
- [Resource Model](#resource-model)
- [Creating Projects](#creating-projects)
- [Template Configuration](#template-configuration)
- [Authentication And Cloud Access](#authentication-and-cloud-access)
- [MCP Integration](#mcp-integration)
- [Configuration](#configuration)
- [Environment Variables](#environment-variables)
- [Local Data Directory](#local-data-directory)
- [Programmatic API](#programmatic-api)
- [Development](#development)
- [Release Checks](#release-checks)
- [Current Limits](#current-limits)
- [Security And Privacy](#security-and-privacy)
- [Open Source Scope](#open-source-scope)
- [Feedback And License](#feedback-and-license)

## What It Provides

AgileBuilder Core is a lightweight runtime for project bootstrapping, resource management, and AI-assisted development.

It currently provides:

- CLI entrypoints: `agilebuilder`, `ag`, and `agilebuilder-mcp`
- local workspace support that works without cloud login
- cloud workspace selection after authentication
- local and cloud resource operations for templates and documents
- Git template generation with variables, optional hooks, and subdirectory support
- API key and OAuth login flows
- device management for authenticated accounts
- MCP tools and readable MCP resources for AI IDEs
- JSON output for automation-friendly command usage

The intended workflow is:

1. Register templates and documents as resources.
2. Select a local or cloud workspace.
3. Create projects from managed template resources or direct Git URLs.
4. Expose templates and documents to AI IDEs through MCP so generated code can follow team context.

## Installation

Install globally:

```bash
npm install -g agilebuilder
```

The package installs three binaries:

```text
agilebuilder
ag
agilebuilder-mcp
```

Requirements:

- Node.js `>=20.0.0`
- Git available on `PATH` for template cloning

Verify installation:

```bash
ag --version
ag --help
```

## Quick Start

Use the built-in local workspace:

```bash
ag space list --json
ag space current --json
ag space use local --json
```

Add a local template resource:

```bash
ag res add template \
  --name basic-copy \
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git \
  --branch main \
  --description "Basic copy case" \
  --tags "case,basic" \
  --json
```

List resources:

```bash
ag res list --json
ag res search basic --type template --json
```

Create a project from a direct Git URL:

```bash
ag create \
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git \
  --target ./output/basic-copy \
  --json
```

Create a project from a managed template resource:

```bash
ag create <template-resource-id> --target ./output/app --json
```

Start MCP for an AI IDE:

```bash
agilebuilder-mcp
```

## CLI Commands

The root command exposes:

```text
config
login
logout
auth
space
res, resource
create
device
```

Common command forms:

```bash
ag config list --json
ag login --api-key <API_KEY>
ag auth status --json
ag logout --json

ag space list --json
ag space list --refresh --json
ag space current --json
ag space use local --json
ag space use <space-id> --json

ag res list --json
ag res search <keyword> --json
ag res get <resource-id> --json
ag res add template --name <name> --git-url <url> --json
ag res add doc --name <name> --file <path> --json
ag res edit <resource-id> --name <new-name> --json
ag res remove <resource-id> --yes --json

ag create --git-url <url> --target <dir> --json
ag create <template-resource-id> --target <dir> --json

ag device list --json
ag device revoke <device-id> --reason <text> --json
ag device revoke-all --json
```

There is also a hidden diagnostic command for MCP visibility:

```bash
ag mcp-debug-resources --json
```

## Workspaces

AgileBuilder Core always has a built-in local workspace:

```bash
ag space use local --json
```

Local workspace behavior:

- available without login
- stores resources in local JSON files
- supports template and document resource writes
- does not have a folder tree, so `--parent-id` is not supported

Cloud workspace behavior:

- requires login and a reachable backend
- uses the selected cloud workspace as command context
- supports resource list, search, get, add, edit, remove, and template-based project creation when the backend implements the required client APIs
- supports `--parent-id` for placing cloud resources under folder nodes

Resource write commands use the current workspace by default. Pass `--space-id <id>` to target a different workspace explicitly.

## Resource Model

AgileBuilder Core treats templates and documents as first-class resources.

Supported resource types:

- `template`
- `doc`

List and search:

```bash
ag res list --json
ag res list --type template --json
ag res search react --json
ag res search guide --type doc --json
```

Read one resource:

```bash
ag res get <resource-id> --json
```

### Template Resources

Add a template resource:

```bash
ag res add template \
  --name basic-copy \
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git \
  --branch main \
  --subdir templates/app \
  --description "Basic application template" \
  --tags "case,basic" \
  --json
```

Options:

```text
--name <name>          required
--git-url <url>        required
--branch <branch>      optional, defaults to main
--subdir <path>        optional
--parent-id <id>       optional, cloud only
--space-id <id>        optional, defaults to current workspace
--description <text>   optional
--tags <tags>          optional, comma-separated
--json                 optional
```

Editable template fields:

```text
--name
--description
--tags
--git-url
--branch
--subdir
```

### Document Resources

Add a document from a file:

```bash
ag res add doc \
  --name local-guide \
  --file ./README.md \
  --format markdown \
  --description "Local guide" \
  --tags "docs,local" \
  --json
```

Add a document from inline content:

```bash
ag res add doc \
  --name note \
  --content "Hello AgileBuilder" \
  --format text \
  --json
```

Options:

```text
--name <name>          required
--file <path>          optional
--content <text>       optional
--uri <uri>            optional, defaults to local-doc://<name>
--format <format>      optional, markdown or text; defaults to markdown
--parent-id <id>       optional, cloud only
--space-id <id>        optional, defaults to current workspace
--description <text>   optional
--tags <tags>          optional, comma-separated
--json                 optional
```

`--file` or `--content` is required when adding a document.

Editable document fields:

```text
--name
--description
--tags
--uri
--file
--content
--format
```

### Edit And Remove

Edit a resource:

```bash
ag res edit <resource-id> --name new-name --description "Updated" --json
```

Remove a resource:

```bash
ag res remove <resource-id> --yes --json
ag res remove <resource-id> --space-id <space-id> --yes --json
```

Validation rules:

- At least one editable field is required.
- `--file` and `--content` cannot be used together.
- Template-only fields cannot be used on document resources.
- Document-only fields cannot be used on template resources.
- `--parent-id` is cloud-only.

## Creating Projects

Create directly from a Git URL:

```bash
ag create \
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git \
  --branch main \
  --target ./output/basic-copy \
  --json
```

Create from a template resource in the current workspace:

```bash
ag create <template-resource-id> --target ./output/app --json
```

Use a template subdirectory:

```bash
ag create \
  --git-url https://github.com/agilebuilder/template-case-multi-template-repo.git \
  --subdir templates/api \
  --target ./output/api \
  --json
```

Pass template variables:

```bash
ag create \
  --git-url https://github.com/agilebuilder/template-case-vars-paths.git \
  --target ./output/demo-api \
  --var projectName=demo-api \
  --var packageName=@demo/api \
  --json
```

Load variables from a JSON file:

```bash
ag create \
  --git-url https://github.com/agilebuilder/template-case-vars-paths.git \
  --target ./output/demo-api \
  --vars ./sample-vars.json \
  --json
```

Useful options:

```text
--git-url <url>        direct Git template URL
--branch <branch>      Git branch
--subdir <path>        template subdirectory
--target <dir>         required output directory
--var <key=value>      template variable assignment; can be repeated
--vars <path>          JSON file containing template variables
--overwrite            allow writing into a non-empty target directory
--keep-git             keep the cloned .git directory
--allow-hooks          allow template hooks
--json                 output JSON
```

By default:

- `.git` is stripped from generated output
- template hooks are not executed
- writing into a non-empty target directory fails unless `--overwrite` is passed

## Template Configuration

Templates can include an AgileBuilder configuration file in the template root. If no config file is found, generation continues with a warning and the default config.

The template engine supports:

- variable replacement in file contents
- variable replacement in file and directory names
- optional file pattern rules
- optional hooks when explicitly allowed
- workspace-provided template definitions for cloud resources

For cloud template resources, `template.definition.configSource` controls where variables and hooks come from:

- `workspace` uses the definition returned by the workspace/backend
- `template_files` reads the template root configuration file

Hooks are disabled by default. Use `--allow-hooks` only for templates you trust.

## Authentication And Cloud Access

Login with an API key:

```bash
ag login --api-key <API_KEY>
```

Start browser OAuth login:

```bash
ag login
```

Inspect auth status:

```bash
ag auth status --json
```

Log out:

```bash
ag logout --json
```

Authentication notes:

- Local workspace operations do not require login.
- Cloud workspace and device operations require valid authentication.
- API key sessions are suitable for automation and non-browser environments.
- OAuth uses Authorization Code + PKCE.

Device management:

```bash
ag device list --json
ag device revoke <device-id> --reason "No longer used" --json
ag device revoke-all --json
```

## MCP Integration

Start the MCP server:

```bash
agilebuilder-mcp
```

Generic MCP configuration:

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "agilebuilder-mcp"
    }
  }
}
```

Development-time MCP configuration:

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "node",
      "args": ["D:/path/to/agilebuilder/dist/mcp/index.js"]
    }
  }
}
```

Available MCP tools:

```text
list_resources
search_resources
get_resource
create_project
```

Tool input summary:

```text
list_resources:   { type?: "template" | "doc" }
search_resources: { keyword?: string, type?: "template" | "doc" }
get_resource:     { resourceId: string }
create_project:   { resourceId?: string, gitUrl?: string, branch?: string, subdir?: string, targetPath: string, variables?: object, overwrite?: boolean, keepGit?: boolean, allowHooks?: boolean }
```

MCP resources:

- expose the AgileBuilder usage guide
- expose local document resources
- expose document resources in the current cloud workspace when authenticated and selected

MCP uses the selected workspace. To change what MCP sees, select a workspace with the CLI before starting the MCP server:

```bash
ag space use local --json
agilebuilder-mcp
```

or:

```bash
ag login --api-key <API_KEY>
ag space use <space-id> --json
agilebuilder-mcp
```

## Configuration

List current configuration:

```bash
ag config list --json
```

Read one key:

```bash
ag config get language --json
```

Set a key:

```bash
ag config set language en-US --json
ag config set backend.profile global --json
ag config set template.allowHooksDefault true --json
```

Supported config keys:

```text
backend.profile              auto | china | global
language                     auto | zh-CN | en-US
template.allowHooksDefault   true | false
```

When `backend.profile` is `auto`, the runtime resolves it using locale and timezone heuristics:

- `zh-CN` locale or China timezone -> `china`
- otherwise -> `global`

## Environment Variables

Data directory:

```text
AGILEBUILDER_CORE1_DATA_DIR
```

Language:

```text
AGILEBUILDER_LANG
LC_ALL
LC_MESSAGES
LANG
```

Backend endpoints are built in and always point to official AgileBuilder services.
They cannot be changed through environment variables.

## Local Data Directory

By default, AgileBuilder Core stores local data under:

```text
~/.agilebuilder/core
```

Override it for tests or isolated experiments:

```bash
AGILEBUILDER_CORE1_DATA_DIR=/tmp/agilebuilder-core1-data
```

Common local files:

```text
config.json
current-space.json
device.json
auth.enc
license-cache.json
resources/local.json
```

The data directory may contain sensitive information and should not be shared publicly.

## Programmatic API

The package exposes a small ESM entrypoint:

```ts
import { APP_VERSION } from "agilebuilder";
```

The public API is intentionally minimal. For most integrations, use the CLI or MCP server rather than importing internal modules.

## Development

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Type-check without emitting files:

```bash
npm run typecheck
```

Run the CLI from TypeScript source:

```bash
npm run dev -- --help
```

Run the compiled CLI:

```bash
node dist/cli/index.js --help
```

Run the compiled MCP server:

```bash
node dist/mcp/index.js
```

## Release Checks

Before publishing, run:

```bash
npm run build
npm test
npm audit --omit=dev
npm pack --dry-run
```

The npm package is configured to include:

- `bin/`
- compiled `dist/`
- `docs/`
- README files
- license and open-source maintenance documents

Compiled test files are excluded from the published package.

## Current Limits

- `res browse` is present but not implemented; use `res list`, `res search`, and `res get`.
- Resource add/edit commands use flags only; JSON input files for resource definitions are not currently supported.
- `--parent-id` is cloud-only because local resources do not have a directory tree.
- Cloud resource writes require compatible backend client APIs.
- This upgraded runtime focuses on CLI and MCP. It does not package the legacy local Web UI runtime.
- Pro module management is not part of this upgraded CLI package.

## Security And Privacy

- Do not share access tokens, refresh tokens, API keys, device IDs, or raw cache files.
- Do not publish the full local data directory.
- Review CLI and MCP output before pasting logs into public issues.
- Use `--allow-hooks` only with trusted templates.
- Treat generated project output as potentially sensitive if variables contain private business data.

For security reporting guidance, see [SECURITY.md](./SECURITY.md).

## Open Source Scope

This repository is suitable for open-source collaboration around:

- CLI behavior
- MCP runtime and tool exposure
- local data models
- cloud client integration boundaries
- resource management and project creation flows
- documentation, testing, packaging, and CI

It is not the place for proprietary backend implementation details or closed-source Pro internals.

## Feedback And License

Repository:

- `https://github.com/agilebuilder/agilebuilder-core`

Issues:

- `https://github.com/agilebuilder/agilebuilder-core/issues`

Homepage:

- `https://www.agilebuilder.net`

License:

- MIT

Additional references:

- [Current CLI Reference](./docs/core1-current-cli-reference.md)
- [Production Test Plan](./docs/production-test-plan.md)
