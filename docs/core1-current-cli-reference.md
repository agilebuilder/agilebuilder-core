# Core1 Current CLI Reference

Last updated: 2026-06-08

This document describes the current implemented behavior of `core1`.
It is intentionally scoped to shipped CLI behavior, not future PRD items.

## Resource Scope

Local workspace:

- `res list`
- `res search`
- `res get`
- `res add template`
- `res add doc`
- `res edit`
- `res remove`
- `create <local-template-resource-id>`

Cloud workspace:

- `res list`
- `res search`
- `res get`
- `res add template`
- `res add doc`
- `res edit`
- `res remove`
- `create <cloud-template-resource-id>`

Resource write commands use the current workspace by default. Pass `--space-id <id>` to target another workspace.

## Add Local Template

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

## Add Local Doc

```powershell
ag space use local
ag res add doc `
  --name local-guide `
  --file .\README.md `
  --format markdown `
  --description "Local guide" `
  --tags "docs,local" `
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

`--file` or `--content` is required.

## Edit Local Resource

```powershell
ag space use local
ag res edit <resource-id> --name new-name --description "Updated" --json
ag res edit <resource-id> --space-id <space-id> --parent-id <folder-node-id> --json
```

Template resource fields:

```text
--name
--description
--tags
--git-url
--branch
--subdir
```

Doc resource fields:

```text
--name
--description
--tags
--uri
--file
--content
--format
```

Validation:

- At least one field is required.
- `--file` and `--content` cannot be used together.
- Template fields cannot be used on doc resources.
- Doc fields cannot be used on template resources.
- `--parent-id` is cloud-only.

## Remove Resource

```powershell
ag res remove <resource-id> --yes --json
ag res remove <resource-id> --space-id <space-id> --yes --json
```

## Create Project

Direct Git URL:

```powershell
ag create --git-url https://github.com/org/template.git --target .\app --json
```

Local template resource:

```powershell
ag space use local
ag create <local-template-resource-id> --target .\app --json
```

Cloud template resource:

```powershell
ag space use <space-id>
ag create <cloud-template-resource-id> --target .\app --json
```

Useful create options:

```text
--git-url <url>
--branch <branch>
--subdir <path>
--target <dir>
--var <key=value>
--vars <path>
--interactive
--overwrite
--keep-git
--allow-hooks
--json
```

If no AgileBuilder config file is found in the template root, `create` returns a warning and continues with the default config.
For cloud template resources, `template.definition.configSource=workspace` uses the workspace Variables/Hooks definition returned by the backend; `template_files` reads Variables/Hooks from the template root config file.

## Known Limits

- `--parent-id` is cloud-only because local resources do not have a directory tree.
- Cloud resource writes require the matching client write APIs on the backend.
- Resource add/edit uses flags only; JSON input files are not supported.
- `res browse` is present but not implemented.
