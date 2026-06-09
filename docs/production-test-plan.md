# Core1 Production Test Plan

This plan verifies `core1` against the real AgileBuilder production services.
It intentionally does not use simulated servers.

## Build

```powershell
npm run build
```

## Backend Profiles

China profile:

```powershell
node dist/cli/index.js config set backend.profile china
node dist/cli/index.js config get backend.profile --json
```

Global profile:

```powershell
node dist/cli/index.js config set backend.profile global
node dist/cli/index.js config get backend.profile --json
```

Auto profile should select China for China time zones and Global otherwise:

```powershell
node dist/cli/index.js config set backend.profile auto
node dist/cli/index.js config list --json
```

## API Key Login

Use a real production API key:

```powershell
node dist/cli/index.js auth login --api-key <REAL_API_KEY>
node dist/cli/index.js auth status --json
```

Expected result:

- The command calls production SSO/workspace services.
- The profile endpoint returns the authenticated user.
- No license request happens during ordinary status checks unless the command requires it.

## OAuth Login

```powershell
node dist/cli/index.js auth login --oauth
node dist/cli/index.js auth status --json
```

Expected result:

- Browser opens the configured production SSO frontend.
- Local callback receives the authorization code.
- Token exchange uses the configured production SSO API.

## Workspace

```powershell
node dist/cli/index.js space list --json
node dist/cli/index.js space current --json
node dist/cli/index.js space use <SPACE_ID> --json
```

Expected result:

- Local workspace is available without login.
- Cloud workspaces are available after login.
- Switching to a cloud workspace persists the selected workspace.

## Cloud Resources

```powershell
node dist/cli/index.js res list --json
node dist/cli/index.js res search <KEYWORD> --json
node dist/cli/index.js res get <RESOURCE_ID> --json
```

Expected result:

- Resource list/search/detail calls the production workspace backend.
- Permission or license failures are returned as explicit errors.

## Template Creation

From direct Git URL:

```powershell
node dist/cli/index.js create --git-url <TEMPLATE_GIT_URL> --target .\tmp-core1-prod-git
```

From cloud resource:

```powershell
node dist/cli/index.js create <CLOUD_TEMPLATE_RESOURCE_ID> --target .\tmp-core1-prod-cloud
```

Expected result:

- Git URL creation works without login if the repository is accessible.
- Cloud template creation requires login and valid access rights.

## Device Commands

```powershell
node dist/cli/index.js device list --json
```

Use revoke commands only with a disposable test account/device:

```powershell
node dist/cli/index.js device revoke <DEVICE_ID> --json
node dist/cli/index.js device revoke-all --json
```

## Cleanup

```powershell
node dist/cli/index.js logout --json
```
