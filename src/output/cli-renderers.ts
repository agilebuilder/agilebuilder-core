import { t } from '../i18n/index.js';
import type { AuthData, UserInfo } from '../auth/types.js';
import type { CliConfig } from '../config/store.js';
import type {
  CloudResourceDetail,
  CloudResourceListItem,
  DeviceInfo,
  DeviceListResponse,
} from '../client/client-api.js';
import type { LocalResource } from '../resources/types.js';
import type { WorkspaceInfo } from '../workspace/types.js';
import type { GenerateResult } from '../template/engine.js';

type ResourceLike = LocalResource | CloudResourceDetail | CloudResourceListItem;

export interface AuthStatusOutput {
  loggedIn: boolean;
  authType: AuthData['authType'] | null;
  user: UserInfo | null | undefined;
}

export interface ConfigGetOutput {
  key: string;
  value: unknown;
}

export interface ConfigSetOutput {
  message: string;
  config: CliConfig;
}

export interface WorkspaceListOutput {
  currentWorkspaceId: string;
  items: Array<WorkspaceInfo & { current?: boolean }>;
}

export type WorkspaceCurrentOutput = WorkspaceInfo & {
  current?: boolean;
  selectedAt?: string;
};

export interface WorkspaceUseOutput {
  message: string;
  workspace: Pick<WorkspaceInfo, 'id' | 'name'>;
}

export interface ResourceListOutput {
  workspaceId: string;
  items: ResourceLike[];
  total: number;
}

export interface ResourceRemoveOutput {
  message: string;
  id: string;
}

export interface LoginOutput {
  user?: UserInfo;
}

export interface LogoutOutput {
  loggedOut: boolean;
}

export interface TokenAvailableOutput {
  available: boolean;
}

export interface DeviceRevokeOutput {
  revoked: boolean;
  deviceId: string;
  result: unknown;
}

export interface DeviceRevokeAllOutput {
  revokedAllOtherDevices: boolean;
  result: unknown;
}

function lines(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join('\n');
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return t('common.none');
  }
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : t('common.none');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function userLabel(user: UserInfo | null | undefined): string {
  if (!user) return t('common.none');
  return user.email ? `${user.name} <${user.email}>` : user.name;
}

function tagsText(tags: string[] | undefined): string {
  return tags?.length ? tags.join(', ') : t('common.none');
}

function resourceSource(resource: ResourceLike): string {
  if ('gitUrl' in resource && resource.gitUrl) return resource.gitUrl;
  if ('template' in resource && resource.template?.gitRepo) return resource.template.gitRepo;
  if ('doc' in resource && resource.doc?.wordCount !== undefined) return `${resource.doc.wordCount} words`;
  if ('wordCount' in resource && resource.wordCount !== undefined) return `${resource.wordCount} words`;
  if ('path' in resource && resource.path) return resource.path;
  return t('common.none');
}

function resourceDetailLines(resource: ResourceLike): string[] {
  const values = [
    `${t('common.id')}: ${resource.id}`,
    `${t('common.name')}: ${resource.name}`,
    `${t('common.type')}: ${resource.type}`,
    `${t('output.label.tags')}: ${tagsText(resource.tags)}`,
  ];
  if ('description' in resource && resource.description) values.push(`${t('output.label.description')}: ${resource.description}`);
  if ('gitUrl' in resource && resource.gitUrl) values.push(`${t('output.label.git')}: ${resource.gitUrl}`);
  if ('branch' in resource && resource.branch) values.push(`${t('output.label.branch')}: ${resource.branch}`);
  if ('subdir' in resource && resource.subdir) values.push(`${t('output.label.subdir')}: ${resource.subdir}`);
  if ('uri' in resource && resource.uri) values.push(`${t('output.label.uri')}: ${resource.uri}`);
  if ('wordCount' in resource && resource.wordCount !== undefined) values.push(`${t('output.label.words')}: ${resource.wordCount}`);
  if ('spaceId' in resource && resource.spaceId) values.push(`${t('output.label.space')}: ${resource.spaceName ?? resource.spaceId}`);
  if ('path' in resource && resource.path) values.push(`${t('output.label.path')}: ${resource.path}`);
  if ('published' in resource && resource.published !== undefined) values.push(`${t('output.label.published')}: ${resource.published ? 'yes' : 'no'}`);
  if ('template' in resource && resource.template?.gitRepo) values.push(`${t('output.label.git')}: ${resource.template.gitRepo}`);
  if ('template' in resource && resource.template?.gitBranch) values.push(`${t('output.label.branch')}: ${resource.template.gitBranch}`);
  if ('doc' in resource && resource.doc?.wordCount !== undefined) values.push(`${t('output.label.words')}: ${resource.doc.wordCount}`);
  return values;
}

export function renderLogin(data: LoginOutput): string {
  return lines(t('output.auth.loginSuccess'), `${t('output.auth.user')}: ${userLabel(data.user)}`);
}

export function renderLogout(_: LogoutOutput): string {
  return t('output.auth.logoutSuccess');
}

export function renderAuthStatus(data: AuthStatusOutput): string {
  return lines(
    data.loggedIn ? t('output.auth.loggedIn') : t('output.auth.loggedOut'),
    `${t('output.auth.type')}: ${valueText(data.authType)}`,
    `${t('output.auth.user')}: ${userLabel(data.user)}`,
  );
}

export function renderTokenAvailable(_: TokenAvailableOutput): string {
  return t('output.auth.tokenAvailable');
}

export function renderConfigList(config: CliConfig): string {
  return lines(
    t('output.config.title'),
    `backend.profile: ${config.backend.profile}`,
    `language: ${config.language}`,
    `template.allowHooksDefault: ${config.template.allowHooksDefault}`,
  );
}

export function renderConfigGet(data: ConfigGetOutput): string {
  return `${data.key}: ${valueText(data.value)}`;
}

export function renderConfigSet(data: ConfigSetOutput): string {
  return lines(data.message, '', renderConfigList(data.config));
}

export function renderWorkspaceList(data: WorkspaceListOutput): string {
  const items = data.items.map((item) => {
    const current = item.current ? '*' : '-';
    return `${current} ${item.name} (${item.id}) [${item.type}, ${item.plan}]`;
  });
  return lines(t('output.space.listTitle', { total: data.items.length }), ...items);
}

export function renderWorkspaceCurrent(data: WorkspaceCurrentOutput): string {
  return lines(
    t('output.space.currentTitle'),
    `${t('common.id')}: ${data.id}`,
    `${t('common.name')}: ${data.name}`,
    `${t('common.type')}: ${data.type}`,
    `${t('output.label.plan')}: ${data.plan}`,
    data.selectedAt ? `${t('output.label.selectedAt')}: ${data.selectedAt}` : undefined,
  );
}

export function renderWorkspaceUse(data: WorkspaceUseOutput): string {
  return lines(data.message, `${t('common.id')}: ${data.workspace.id}`);
}

export function renderResourceList(data: ResourceListOutput): string {
  if (!data.items.length) {
    return lines(
      t('output.res.empty'),
      t('output.res.nextAdd'),
    );
  }
  const items = data.items.map((item) => `- ${item.id}  ${item.type}  ${item.name}  ${resourceSource(item)}`);
  return lines(
    t('output.res.listTitle', { total: data.total, workspaceId: data.workspaceId }),
    ...items,
    '',
    t('output.res.nextGet'),
  );
}

export function renderResourceDetail(resource: ResourceLike): string {
  return lines(t('output.res.detailTitle'), ...resourceDetailLines(resource));
}

export function renderResourceSaved(resource: ResourceLike): string {
  return lines(t('output.res.saved'), ...resourceDetailLines(resource));
}

export function renderResourceRemoved(data: ResourceRemoveOutput): string {
  return lines(data.message, `${t('common.id')}: ${data.id}`);
}

export function renderCreateResult(data: GenerateResult): string {
  const hooksExecuted = data.hooksExecuted ?? [];
  const hooksSkipped = data.hooksSkipped ?? [];
  const warnings = data.warnings ?? [];
  return lines(
    t('output.create.success'),
    `${t('output.label.target')}: ${data.targetDir}`,
    `${t('output.label.filesWritten')}: ${data.filesWritten.length}`,
    `${t('output.label.filesSkipped')}: ${data.filesSkipped.length}`,
    hooksExecuted.length ? `${t('output.label.hooksExecuted')}: ${hooksExecuted.join(', ')}` : undefined,
    hooksSkipped.length ? `${t('output.label.hooksSkipped')}: ${hooksSkipped.join(', ')}` : undefined,
    warnings.length ? '' : undefined,
    ...warnings.map((warning) => `${t('output.label.warning')}: ${warning}`),
  );
}

export function renderDeviceList(data: DeviceListResponse): string {
  if (!data.devices.length) {
    return t('output.device.empty');
  }
  const devices = data.devices.map((device) => {
    const current = device.isCurrent ? '*' : '-';
    const name = device.deviceName || device.deviceId;
    const status = device.status ? ` ${device.status}` : '';
    return `${current} ${name} (${device.deviceId}) [${device.deviceType}${status}]`;
  });
  return lines(t('output.device.listTitle', { total: data.total, active: data.activeCount }), ...devices);
}

export function renderDeviceRevoke(data: DeviceRevokeOutput): string {
  return lines(t('output.device.revoked'), `${t('common.id')}: ${data.deviceId}`);
}

export function renderDeviceRevokeAll(_: DeviceRevokeAllOutput): string {
  return t('output.device.revokedAll');
}
