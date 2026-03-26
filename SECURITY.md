# Security Policy

## Supported Scope

Security issues affecting the published `agilebuilder` npm package and this repository's source code are in scope, especially:

- authentication and token handling
- local data storage
- CLI command execution
- MCP server exposure
- dependency vulnerabilities

## Reporting

Please avoid posting secrets, exploit details, or private environment data in public issues.

For non-sensitive bugs, use GitHub Issues:

- `https://github.com/agilebuilder/agilebuilder-core/issues`

For potential security issues:

1. Prefer private reporting channels if they are enabled for the repository.
2. If private reporting is not available, open a minimal public issue without exploit details and request a secure follow-up channel.

## What To Include

- affected version
- impact summary
- reproduction steps
- proof of concept only if it can be shared safely
- any suggested remediation

## Sensitive Data Handling

Do not include:

- access tokens or refresh tokens
- local auth/license cache contents
- private backend URLs or credentials
- device IDs, workspace IDs, or resource IDs unless redacted
