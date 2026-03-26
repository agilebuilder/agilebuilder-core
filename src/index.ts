/**
 * Public AgileBuilder Core exports.
 *
 * Keep this surface intentionally small. Stable user-facing integration
 * points are the CLI, Web UI, MCP server, and the selected APIs below.
 */

export {
  login,
  getAuthorizationUrl,
  type LoginResult,
} from './auth/login.js';

export {
  logout,
  isLoggedIn,
  type LogoutResult,
} from './auth/logout.js';

export {
  APP_NAME,
  APP_VERSION,
  LOCAL_SPACE_ID,
  LOCAL_SPACE_NAME,
} from './shared/constants.js';

export type {
  UserInfo,
  CurrentSpace,
  SpaceInfo,
  PlanType,
  ResourceDetail,
  Template,
} from './shared/types.js';
