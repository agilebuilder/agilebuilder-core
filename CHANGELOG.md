# Changelog

All notable changes to this project should be documented in this file.

## [1.2.3] - 2026-10-13

### Fixed

- MCP template discovery propagates invalid template and network failures instead of reporting them as missing resources. A missing token does not expand discovery to other cloud spaces.
- Template hooks on Windows locate Bash from the existing Git installation, avoiding the Windows WSL launcher.

### Changed

- Upgrade the existing simple-git and MCP SDK dependencies and refresh transitive dependencies; the release runtime dependency audit reports no known vulnerabilities.
- Resource discovery prefers `list_resources`; empty search results fall back to resource listing. MCP clients using the earlier search flow remain supported.
- Resource command documentation reflects the current CLI and cloud workspace behavior.

## [1.2.2] - 2026-07-06

### Fixed

- License storage validates authorization token state; resource, authentication and template regression coverage was extended.

## [1.2.1] - 2026-07-02

This version is recorded in the npm registry. The local repository does not retain a matching version tag; a separate per-version change list is unavailable.

## [1.2.0] - 2026-07-01

This version is recorded in the npm registry. The July source history adds regression coverage for authentication, configuration, cloud/local resources, template generation, MCP, localization and output formatting.

## [1.1.1] - 2026-07-02

### Fixed

- Authentication and cloud request errors preserve their failure context.
- Template rendering and hook behavior were corrected and covered by regression tests.

## [1.1.0] - 2026-06-09

### Changed

- Aligned the CLI with the AgileBuilder Core baseline; standardized data-directory and configuration-file conventions.
- Expanded cloud resource, CLI and MCP documentation.

### Historical releases

The npm registry also records 1.0.0 (2021-08-24) and 1.0.1–1.0.21 (2026-03-10 through 2026-04-14). The current repository starts in June 2026 and does not contain those release sources; their detailed changes have not been reconstructed.

## [0.1.0] - 2026-06-08

This was the local Core baseline version, rather than an npm publication of `agilebuilder`.

### Added

- Release metadata aligned with the public AgileBuilder package and repository.
- Open-source maintenance documents: contributing guide, security policy, code of conduct, changelog, and issue templates.
- Package validation rules that exclude compiled test files from the npm tarball.

### Changed

- README now reflects the current upgraded CLI/MCP runtime, including local and cloud workspaces, resource management, template generation, and MCP usage.
- Published package name and repository metadata now match the AgileBuilder Core project.

### Added

- Lightweight upgraded CLI runtime with local/cloud resource management.
- Template generation from Git URLs and template resources.
- API key and OAuth login flows.
- Workspace selection for local and cloud spaces.
- MCP server with resource discovery, resource reading, and project creation tools.
