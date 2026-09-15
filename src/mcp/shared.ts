import { AppError, toAppError } from '../errors/app-error.js';

export function toolResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

const MCP_ERROR_SUGGESTIONS: Record<string, string> = {
  TEMPLATE_VARS_MISSING:
    'Ask the user for the missing variable values, then retry create_project with them in the variables object. Call get_resource first to see the template variable list.',
  TARGET_NOT_EMPTY:
    'Confirm with the user that the directory contents may be overwritten, then retry create_project with overwrite: true.',
  UNSAFE_TARGET_DIR:
    'Choose a different targetPath in a user-writable location. System directories and drive roots are rejected.',
  TARGET_NOT_WRITABLE:
    'targetPath must be a directory. Ask the user for a valid directory path.',
  TEMPLATE_SUBDIR_UNSAFE:
    'Use a relative subdir path that stays within the template repository.',
  AUTH_TOKEN_UNAVAILABLE:
    'Ask the user to run `ag login` in their terminal, then retry.',
  OAUTH_REFRESH_UNAVAILABLE:
    'Ask the user to run `ag login` in their terminal, then retry.',
  PRO_ACCESS_REQUIRED:
    'This operation requires a Pro or Trial workspace plan. Ask the user to upgrade, or use resources from the local workspace, which works without login.',
  CLOUD_WORKSPACE_REQUIRED:
    'This resource lives in a cloud workspace. Ask the user to run `ag login` and select a cloud workspace in their terminal.',
  CLOUD_RESOURCE_CROSS_SPACE_DISABLED:
    'Use a resource from the current workspace. Cross-space access is disabled by workspace policy.',
  RESOURCE_NOT_FOUND:
    'Call list_resources or search_resources to find valid resource IDs in the current workspace, then retry.',
  CREATE_REQUIRES_TEMPLATE:
    'The given resource is not a template. Use list_resources with type "template" to pick a template resource.',
  HOOK_FAILED:
    'A template hook failed. Report the error to the user. Retrying create_project without allowHooks skips hooks.',
  HOOK_TYPE_UNSUPPORTED:
    'The template declares an unsupported hook type. Generate without allowHooks to skip hooks, and report this to the user.',
};

function mcpSuggestion(appError: AppError): string | undefined {
  return MCP_ERROR_SUGGESTIONS[appError.code] ?? appError.suggestion;
}

export function errorResult(error: unknown) {
  const appError = toAppError(error);
  return {
    ...toolResult({
      ok: false,
      error: {
        code: appError.code,
        message: appError.message,
        suggestion: mcpSuggestion(appError),
        category: appError.category,
        details: appError.details,
      },
    }),
    isError: true,
  };
}

export function parseType(value: unknown): 'template' | 'doc' | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'template' || value === 'doc') return value;
  throw new AppError({ code: 'INVALID_RESOURCE_TYPE', message: `Invalid resource type: ${String(value)}`, category: 'validation' });
}
