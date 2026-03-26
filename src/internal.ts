/**
 * Internal AgileBuilder Core exports.
 *
 * This entrypoint is intended for official workspace packages such as the
 * desktop sidecar. It is not covered by the public semver contract.
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

export { TokenStore } from './auth/token-store.js';

export {
  generatePKCE,
  generateState,
  type PKCEParams,
} from './auth/pkce.js';

export {
  findAvailablePort,
  getCallbackUrl,
} from './auth/port-finder.js';

export { getDeviceId, isValidDeviceId } from './license/device.js';
export { LicenseStore } from './license/license-store.js';
export { SpaceManager, LOCAL_SPACE_INFO } from './license/space.js';
export { LicenseApi } from './license/api.js';
export {
  verifyLicenseSignature,
  verifyLicenseResponse,
  isPublicKeyConfigured,
} from './license/signature.js';
export {
  AccessChecker,
  PRO_FEATURES,
  type ProFeature,
  type AccessCheckResult,
} from './license/checker.js';

export { BasicProcessor } from './core/basic-processor.js';
export { ProProcessor } from './core/pro-processor.js';
export { ProcessorFactory } from './core/processor-factory.js';
export type {
  TemplateProcessor,
  CloneOptions,
  CloneResult,
} from './core/types.js';

export { ProDownloader } from './pro-loader/downloader.js';
export { ProLoader } from './pro-loader/loader.js';
export { ProManager } from './pro-loader/manager.js';

export {
  getDatabase,
  initDatabase,
  closeDatabase,
} from './db/index.js';

export { TemplatesDAO } from './db/dao/templates.dao.js';
export { ResourcesDAO } from './db/dao/resources.dao.js';

export { ExecutionHistoryStore } from './execution/execution-history-store.js';

export {
  getDataDir,
  getDbPath,
  validateTargetPath,
  getAuthFilePath,
  getLicenseFilePath,
  getCurrentSpaceFilePath,
  getProModulesDir,
  getProModuleFilePath,
} from './shared/paths.js';

export { ApiClient } from './shared/api-client.js';

export {
  APP_NAME,
  APP_VERSION,
  CLIENT_TYPE,
  getSsoBaseUrl,
  getWorkspaceApiUrl,
  OAUTH_CLIENT_ID,
  LICENSE_CACHE_TTL,
  LOCAL_SPACE_ID,
  LOCAL_SPACE_NAME,
} from './shared/constants.js';

export type {
  Template,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateListItem,
  TemplateInfo,
  UserInfo,
  AuthData,
  OAuthTokenResponse,
  PlanType,
  SpacePlan,
  SpaceInfo,
  CurrentSpace,
  LicenseInfo,
  LicenseUserInfo,
  LicenseData,
  LicenseSignature,
  LicenseResponse,
  ProModuleMeta,
  ProModule,
  ResourceDetail,
} from './shared/types.js';

export type {
  ExecutionStatus,
  LogEntry,
  ResourceInfo,
  ExecutionRecord,
  ExecutionHistoryData,
} from './execution/types.js';

export {
  convertToTemplateDefinition,
  supportsNewGenerator,
} from './resource/definition-converter.js';
