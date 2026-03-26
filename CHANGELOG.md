# Changelog

All notable changes to this project should be documented in this file.

## [Unreleased]

### Added

- Smoke test script for CLI and MCP release verification
- GitHub Actions CI workflow for build, smoke test, and package validation
- Contributing, security, code of conduct, changelog, and issue templates for open-source maintenance

### Changed

- Release documentation now reflects the current CLI command model
- Runtime version constants now match the package version

## [1.0.3] - 2026-03-11

### Added

- Public npm metadata for repository, bugs, and homepage

### Changed

- Production dependencies upgraded to resolve known vulnerabilities
- Build pipeline now cleans `dist/` before compiling
- Sensitive debug output was reduced to sanitized summaries
- Public environment examples no longer expose internal network endpoints
