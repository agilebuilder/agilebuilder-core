# AgileBuilder CLI

AgileBuilder CLI is a Git-template-based project scaffolding and development resource management tool. After global npm installation, it provides the `agilebuilder` and `ag` command-line entrypoints for creating projects from direct Git template URLs or registered template resources. It supports template variables, file path and content rendering, file matching rules, and explicitly authorized post-generation hooks. AgileBuilder also provides local workspaces, AgileBuilder Cloud workspaces, template resources, document resources, and JSON output for automation. For AI-native development workflows, the `agilebuilder-mcp` server exposes resource search, document context, and project scaffolding capabilities to MCP-compatible AI IDEs and agents, helping individual developers and small teams standardize project initialization and reuse development context.

Package name: `agilebuilder`  
Commands: `agilebuilder`, `ag`, `agilebuilder-mcp`  
Runtime: Node.js `>=20.0.0`

## Capabilities

- Create projects from a direct Git URL or a saved template resource.
- Manage template and document resources in a local workspace.
- Work with AgileBuilder Cloud spaces after login.
- Store document resources and expose them through MCP resources.
- Expose resource lookup and project creation through an MCP stdio server.
- Render template variables in file contents and paths.
- Run explicitly allowed template hooks after files are written.
- Produce machine-readable JSON output for automation.

## Installation

Install globally:

```bash
npm install -g agilebuilder
```

Or run from a local checkout:

```bash
npm install
npm run build
node ./bin/agilebuilder.js --help
```

The short command `ag` points to the same CLI as `agilebuilder`.

## Quick Start

Create a project directly from a Git template:

```bash
ag create --git-url https://github.com/example/template.git --target ./my-app
```

Register a local template resource and create from it:

```bash
ag space use local
ag res add template \
  --name web-app \
  --git-url https://github.com/example/template.git \
  --branch main \
  --tags "web,starter"

ag res list
ag create 1 --target ./my-app
```

Pass template variables:

```bash
ag create 1 \
  --target ./my-app \
  --var appName=my-app \
  --var useAuth=true
```

Use JSON output in scripts:

```bash
ag res list --json
ag create 1 --target ./my-app --json
```

## Workspaces

AgileBuilder has a built-in local workspace and optional Cloud workspaces.

- `local`: stores resources on the current machine and does not require login.
- Cloud spaces: loaded from AgileBuilder Cloud and require authentication.

The current workspace is used by resource commands and by `create <resource-id>`.

```bash
ag space list
ag space list --refresh
ag space current
ag space use local
ag space use <space-id>
```

Resource write commands use the current workspace by default. Pass `--space-id <id>` to target another workspace without switching:

```bash
ag res add template --space-id <space-id> --name api --git-url https://github.com/example/api-template.git
ag res remove <resource-id> --space-id <space-id> --yes
```

`--parent-id` is only valid for Cloud resources because local resources do not have a folder tree.

## Authentication

Cloud resources, Cloud spaces, license refresh, and device management require login.

OAuth login:

```bash
ag login
```

The CLI opens a browser and listens for an OAuth callback on `127.0.0.1`, starting at port `51280` and probing up to ten ports.

API key login:

```bash
ag login --api-key <key>
```

Check or clear authentication:

```bash
ag auth status
ag auth require-token
ag logout
```

OAuth tokens are refreshed automatically when possible. API keys are stored as the active credential until logout.

## Backend Selection

The CLI chooses backend endpoints from `backend.profile`.

| Value | Behavior |
| --- | --- |
| `auto` | Detects China profile when locale/time zone indicates mainland China; otherwise uses global. |
| `china` | Uses `agilebuilder.cn` endpoints. |
| `global` | Uses `agilebuilder.net` endpoints. |

Commands:

```bash
ag config list
ag config get backend.profile
ag config set backend.profile global
```

Supported config keys:

| Key | Values |
| --- | --- |
| `backend.profile` | `auto`, `china`, `global` |
| `language` | `auto`, `zh-CN`, `en-US` |
| `template.allowHooksDefault` | `true`, `false` |

Note: `template.allowHooksDefault` is stored in config, but the current `create` command only executes hooks when `--allow-hooks` is passed.

Language detection also reads `AGILEBUILDER_LANG`, `LC_ALL`, `LC_MESSAGES`, and `LANG` when `language` is `auto`.

## Data Storage

By default, CLI data is stored under:

```text
~/.agilebuilder/core
```

Important files:

| File | Purpose |
| --- | --- |
| `config.json` | CLI configuration. |
| `current-space.json` | Selected workspace ID. |
| `resources/local.json` | Local template and document resources. |
| `auth.enc` | Encrypted authentication data. |
| `logs/` | Reserved log directory. |

Use `AGILEBUILDER_CORE1_DATA_DIR` to override the data directory:

```bash
AGILEBUILDER_CORE1_DATA_DIR=/tmp/agilebuilder-core ag res list
```

## Resource Management

AgileBuilder supports two resource types:

| Type | Purpose |
| --- | --- |
| `template` | A Git repository plus optional branch and subdirectory, used by `create`. |
| `doc` | Markdown or text content, usable as CLI-managed reference material and MCP resources. |

List, search, and inspect resources:

```bash
ag res list
ag res list --type template
ag res search auth
ag res search auth --type doc
ag res get <id>
```

`res` also has the alias `resource`, and `list` has the alias `ls`.

Add a template:

```bash
ag res add template \
  --name service-template \
  --git-url https://github.com/example/service-template.git \
  --branch main \
  --subdir templates/node \
  --description "Node.js service starter" \
  --tags "node,service"
```

Template options:

| Option | Required | Notes |
| --- | --- | --- |
| `--name <name>` | Yes | Resource display name. |
| `--git-url <url>` | Yes | Git repository URL. |
| `--branch <branch>` | No | Defaults to `main` when adding a resource. |
| `--subdir <path>` | No | Template directory inside the repository. |
| `--parent-id <id>` | No | Cloud only. |
| `--space-id <id>` | No | Defaults to current workspace. |
| `--description <text>` | No | Optional description. |
| `--tags <tags>` | No | Comma-separated tags. |
| `--json` | No | Emit JSON. |

Add a document:

```bash
ag res add doc \
  --name architecture-notes \
  --file ./docs/architecture.md \
  --format markdown \
  --tags "docs,architecture"
```

Document content can come from `--file` or `--content`. One of them is required.

Document options:

| Option | Required | Notes |
| --- | --- | --- |
| `--name <name>` | Yes | Resource display name. |
| `--file <path>` | No | Reads content from a file. |
| `--content <text>` | No | Inline content. |
| `--uri <uri>` | No | Defaults to `local-doc://<name>` for local docs. |
| `--format <format>` | No | `markdown` or `text`; defaults to `markdown`. |
| `--parent-id <id>` | No | Cloud only. |
| `--space-id <id>` | No | Defaults to current workspace. |
| `--description <text>` | No | Optional description. |
| `--tags <tags>` | No | Comma-separated tags. |
| `--json` | No | Emit JSON. |

Edit a resource:

```bash
ag res edit <id> --name new-name --description "Updated"
ag res edit <id> --tags "backend,starter"
ag res edit <doc-id> --file ./README.md --format markdown
```

Validation rules:

- At least one editable field is required.
- `--file` and `--content` cannot be used together.
- Template-only fields cannot be used on document resources.
- Document-only fields cannot be used on template resources.
- `--parent-id` is Cloud only.

Remove a resource:

```bash
ag res remove <id> --yes
ag res rm <id> --yes --json
```

`--yes` is required. The `res browse` command exists as a placeholder and is not implemented.

## Project Creation

Create from a direct Git URL:

```bash
ag create --git-url https://github.com/example/template.git --target ./app
```

Create from the current workspace's template resource:

```bash
ag create <resource-id> --target ./app
```

Options:

| Option | Required | Notes |
| --- | --- | --- |
| `[resource-id]` | Required unless `--git-url` is used | Must refer to a template resource. |
| `--git-url <url>` | Required unless resource ID is used | Creates directly from a Git repository. |
| `--branch <branch>` | No | Overrides the resource branch or clones a specific direct-Git branch. |
| `--subdir <path>` | No | Overrides the resource subdirectory or uses a direct-Git subdirectory. |
| `--target <dir>` | Yes | Output directory. |
| `--vars <path>` | No | JSON object file with variables. |
| `--var <key=value...>` | No | One or more scalar variable assignments. |
| `--overwrite` | No | Allows writing into a non-empty target directory. |
| `--keep-git` | No | Accepted by the command, but the current file walker still skips `.git` directories. |
| `--allow-hooks` | No | Allows supported template hooks to run. |
| `--json` | No | Emit JSON. |

Target safety:

- The CLI refuses unsafe root/system targets.
- Existing non-empty targets require `--overwrite`.
- The target directory is created when needed.

Variable precedence:

1. Values from `--vars <path>`.
2. Values from repeated `--var key=value`.
3. Defaults from template questions, applied only when the variable is still missing.

`--var` parses `true`, `false`, `null`, and numbers as scalar values. Other values remain strings.

The current implementation is non-interactive. Template questions are used for defaults and required-variable validation, but the CLI does not prompt for missing values.

## Template Configuration

A template should include this configuration file at its template root:

```text
.agilebuilder.config.yaml
```

If no config file is found, generation continues with a default config and reports a warning.

Supported config shape:

```yaml
version: 1
name: service-template
description: Service starter
source:
  subdir: template
variables:
  enabled: true
  delimiter: "%"
  filePatterns:
    mode: include
    patterns:
      - "**/*.ts"
      - "package.json"
  inquirerQuestions:
    - name: appName
      type: input
      message: Application name
      required: true
      default: my-app
hooks:
  after_write:
    scriptType: shell
    script: npm install
    errorHandling: warn
```

Variable rendering:

- `source.subdir` is optional. It points to the actual template file root inside the checked-out template directory, and is useful when the config file lives at the repository root but generated files live under a nested directory such as `template/`.
- `source.type` is not part of the template-file config. The template acquisition source is determined by the command, resource, or Cloud template definition.
- File contents use EJS rendering.
- The default EJS delimiter is `%`, so placeholders use forms such as `<%= appName %>`.
- Path names are rendered when variables are enabled.
- Path names support `{{ variableName }}` and EJS expressions.
- Binary files are copied without rendering.
- `.agilebuilder.config.yaml` is not copied to the target.

Built-in template helpers:

```text
camelCase, pascalCase, kebabCase, snakeCase, uppercase, lowercase
```

Example:

```text
<%= pascalCase(appName) %>
<%= helpers.kebabCase(appName) %>
```

File pattern modes:

| Mode | Behavior |
| --- | --- |
| `all` | Render all non-binary files. |
| `include` | Render files matching at least one pattern. |
| `exclude` | Render files not matching any pattern. |

Hooks:

- Only `after_write` is currently evaluated.
- Only `scriptType: shell` is currently executable.
- Hooks run in the target directory.
- Hooks run only when `--allow-hooks` is passed.
- `errorHandling: stop` fails generation when the hook fails.
- `errorHandling: warn` and `continue` record the hook as skipped and continue.

## Cloud Template Config

For Cloud template resources, the backend may return a template definition. When its config source is workspace-managed, AgileBuilder builds the template config from the Cloud resource definition. When the config source is template files, the CLI reads `.agilebuilder.config.yaml` from the cloned template.

Cloud resource access is recorded after successful resource resolution when supported by the backend.

## MCP Server

The package provides an MCP stdio server:

```bash
agilebuilder-mcp
```

Example MCP client configuration:

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "agilebuilder-mcp"
    }
  }
}
```

MCP tools:

| Tool | Description |
| --- | --- |
| `list_resources` | Lists resources in the current workspace. Optional `type`. |
| `search_resources` | Searches resources in the current workspace. Optional `keyword` and `type`. |
| `get_resource` | Reads one resource by `resourceId`. |
| `create_project` | Creates a project from `resourceId` or `gitUrl`. |

`create_project` arguments:

```json
{
  "resourceId": "1",
  "gitUrl": "https://github.com/example/template.git",
  "branch": "main",
  "subdir": "template",
  "targetPath": "./app",
  "variables": { "appName": "app" },
  "overwrite": false,
  "keepGit": false,
  "allowHooks": false
}
```

`targetPath` is required. Either `resourceId` or `gitUrl` is required.

MCP resources:

| URI | Description |
| --- | --- |
| `agilebuilder://docs/usage` | Usage guide. |
| `agilebuilder://usage/agent-policy` | Agent policy guidance. |
| `agilebuilder://docs/catalog` | Catalog of document resources in the current workspace. |
| `agilebuilder://local/docs/<id>` | Local document resource content. |
| `agilebuilder://cloud/docs/<id>` | Cloud document resource content. |

The MCP server uses the same selected workspace as the CLI.

## Device Management

Device commands require login:

```bash
ag device list
ag device revoke <device-id> --reason "No longer used"
ag device revoke-all
```

`revoke-all` revokes all other devices, not the current device.

## JSON Output and Errors

Commands with `--json` write successful output in this shape:

```json
{
  "ok": true,
  "data": {}
}
```

Errors are written to stderr:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "suggestion": "Optional suggestion",
    "category": "validation"
  }
}
```

Without `--json`, errors are printed as readable text.

## Command Reference

```text
agilebuilder [options] [command]
ag [options] [command]
```

Global options:

| Option | Description |
| --- | --- |
| `-V, --version` | Print version. |
| `-h, --help` | Show help. |

Commands:

| Command | Description |
| --- | --- |
| `config` | Manage CLI configuration. |
| `login` | Login with OAuth or API key. |
| `logout` | Clear local authentication. |
| `auth status` | Show authentication status. |
| `auth require-token` | Fail unless a valid token is available. |
| `space list` / `space ls` | List local and Cloud workspaces. |
| `space current` | Show current workspace. |
| `space use <workspace>` | Select `local` or a Cloud workspace ID. |
| `res list` / `res ls` | List resources. |
| `res search <keyword>` | Search resources. |
| `res get <id>` | Show resource detail. |
| `res add template` | Add a template resource. |
| `res add doc` | Add a document resource. |
| `res edit <id>` | Edit a resource. |
| `res remove <id>` / `res rm <id>` | Remove a resource. |
| `create [resource-id]` | Create a project from a resource or Git URL. |
| `device list` / `device ls` | List registered devices. |
| `device revoke <device-id>` | Revoke one device. |
| `device revoke-all` | Revoke all other devices. |

## Development

```bash
npm install
npm run build
npm run typecheck
npm test
npm run dev -- --help
```

The package is TypeScript ESM. Build output is written to `dist/`, and executable wrappers live in `bin/`.

## Known Limits

- `res browse` is present but not implemented.
- `create` does not currently prompt interactively for template variables.
- Only `after_write` shell hooks are executable.
- `template.allowHooksDefault` is persisted but not applied by `create`; pass `--allow-hooks`.
- Local resources are stored in a flat list and do not support folders.
- Cloud operations depend on the availability and permissions of the AgileBuilder backend APIs.

## License

MIT
