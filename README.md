# AgileBuilder Core1

Lightweight AgileBuilder CLI for local/cloud resources, Git template generation, and MCP.

## Build And Test

```powershell
npm install
npm run build
npm test
```

During development, run the CLI through TypeScript:

```powershell
npm run dev -- --help
```

After build, run the compiled CLI:

```powershell
node dist/cli/index.js --help
```

The package exposes these binaries when installed:

```text
agilebuilder
ag
agilebuilder-mcp
```

## Storage

By default, core1 stores local data under:

```text
~/.agilebuilder/core1
```

For isolated tests or local experiments, override the data directory:

```powershell
$env:AGILEBUILDER_CORE1_DATA_DIR = "D:\tmp\agilebuilder-core1-data"
```

Local resources are stored as JSON at:

```text
<data-dir>/resources/local.json
```

## Workspaces

Core1 always has a built-in local workspace. Local resource writes only work in this workspace.

```powershell
ag space list --json
ag space current --json
ag space use local --json
```

After login, cloud workspaces can be selected:

```powershell
ag login --api-key <API_KEY>
ag space list --json
ag space use <space-id> --json
```

Resource commands use the current workspace by default. Use `--space-id <id>` on write commands when you need to target a different workspace.

## Resources

Supported resource types:

- `template`
- `doc`

List, search, and get resources in the current workspace:

```powershell
ag res list --json
ag res list --type template --json
ag res search react --json
ag res search guide --type doc --json
ag res get <resource-id> --json
```

### Add Template Resource

Template resources are added with flags. In the local workspace they are written to local JSON storage; in a cloud workspace they are written through the client API.

```powershell
ag space use local
ag res add template `
  --name basic-copy `
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git `
  --branch main `
  --description "Basic copy case" `
  --tags "case,basic" `
  --json
```

For a template located in a subdirectory:

```powershell
ag res add template `
  --name multi-api `
  --git-url https://github.com/agilebuilder/template-case-multi-template-repo.git `
  --branch main `
  --subdir templates/api `
  --json
```

For a cloud workspace, pass `--parent-id` to place the resource under a folder node. If omitted, the resource is created at the root:

```powershell
ag res add template `
  --space-id <space-id> `
  --parent-id <folder-node-id> `
  --name basic-copy `
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git `
  --json
```

Template add options:

```text
--name <name>          required
--git-url <url>        required
--branch <branch>      optional, defaults to main
--subdir <path>        optional
--parent-id <id>       optional, cloud only
--space-id <id>        optional, defaults to current workspace
--description <text>   optional
--tags <tags>          optional, comma-separated
--json                 optional, output JSON
```

### Add Doc Resource

Doc resources use the same workspace targeting rules as template resources.

```powershell
ag res add doc `
  --name local-guide `
  --file .\README.md `
  --format markdown `
  --description "Local guide" `
  --tags "docs,local" `
  --json
```

You can also pass content directly:

```powershell
ag res add doc --name note --content "Hello AgileBuilder" --format text --json
```

Doc add options:

```text
--name <name>          required
--file <path>          optional, reads content from file
--content <text>       optional, inline content
--uri <uri>            optional, defaults to local-doc://<name>
--format <format>      optional, markdown or text; defaults to markdown
--parent-id <id>       optional, cloud only
--space-id <id>        optional, defaults to current workspace
--description <text>   optional
--tags <tags>          optional, comma-separated
--json                 optional, output JSON
```

`--file` or `--content` is required for doc resources.

### Edit Local Resource

`res edit` updates the current workspace by default. Use `--space-id <id>` to edit a resource in another workspace.

```powershell
ag space use local
ag res edit <resource-id> --name new-name --description "Updated" --tags "updated,local" --json
```

Template resources can edit:

```text
--name
--description
--tags
--git-url
--branch
--subdir
```

Example:

```powershell
ag res edit 1 `
  --name basic-copy-v2 `
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git `
  --branch main `
  --tags "case,basic,v2" `
  --json
```

Doc resources can edit:

```text
--name
--description
--tags
--uri
--file
--content
--format
```

Cloud resources can also be moved by passing `--parent-id <folder-node-id>`. Passing an empty `--parent-id ""` moves the resource to the cloud workspace root.

Example:

```powershell
ag res edit 2 --file .\docs\guide.md --format markdown --json
```

Validation rules:

- At least one editable field is required.
- `--file` and `--content` cannot be used together.
- Template-only fields cannot be used on doc resources.
- Doc-only fields cannot be used on template resources.

### Remove Resource

Remove uses the current workspace by default and requires explicit confirmation:

```powershell
ag res remove <resource-id> --yes --json
ag res remove <resource-id> --space-id <space-id> --yes --json
```

## Create Project

Create directly from a Git URL:

```powershell
ag create `
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git `
  --target .\output\basic-copy `
  --json
```

Create from a local template resource:

```powershell
ag space use local
ag create <local-template-resource-id> --target .\output\app --json
```

Create from a cloud template resource after selecting a cloud workspace:

```powershell
ag space use <space-id>
ag create <cloud-template-resource-id> --target .\output\cloud-app --json
```

Useful create options:

```text
--git-url <url>        direct Git template URL
--branch <branch>      Git branch
--subdir <path>        template subdirectory
--target <dir>         output directory
--var <key=value>      template variable; can be repeated
--vars <path>          JSON file containing template variables
--interactive          prompt for missing variables
--overwrite            allow writing into a non-empty target directory
--keep-git             keep the cloned .git directory
--allow-hooks          allow template hooks
--json                 output JSON
```

By default, `.git` is stripped from generated output and hooks are not executed unless `--allow-hooks` is passed.
If no AgileBuilder config file is found in the template root, `create` emits a warning and continues with the default config.
For cloud template resources, `template.definition.configSource` controls where variables and hooks come from: `workspace` uses the workspace-provided definition, while `template_files` reads the template root config file.

## Config

```powershell
ag config list --json
ag config get language --json
ag config set language en-US --json
ag config set template.allowHooksDefault true --json
```

Currently used config keys include:

```text
backend.profile
language
template.allowHooksDefault
```

## Auth And Device

```powershell
ag login --api-key <API_KEY>
ag login
ag auth status --json
ag logout --json
ag device list --json
ag device revoke <device-id> --json
ag device revoke-all --json
```

Cloud resource and device commands require valid authentication.

## MCP

Start the MCP server:

```powershell
agilebuilder-mcp
```

Available MCP tools:

```text
list_resources
search_resources
get_resource
create_project
```

MCP uses the current selected workspace. Local doc resources and current cloud doc resources are exposed as MCP resources.

## Current Limits

- `--parent-id` is cloud-only because the local workspace has no directory tree.
- Cloud resource writes require a backend that implements the client write APIs.
- `res browse` exists but is not implemented; it prints an implementation message.
- JSON input files for resource creation are not supported yet; resource add/edit uses flags.

See [docs/core1-current-cli-reference.md](./docs/core1-current-cli-reference.md) for a compact current command reference.
See [docs/core1-cli-prd.md](./docs/core1-cli-prd.md) for the original product requirements.
