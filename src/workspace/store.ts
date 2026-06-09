import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { LOCAL_SPACE_ID } from '../shared/constants.js';
import { getCurrentSpaceFilePath } from '../shared/paths.js';
import { t } from '../i18n/index.js';
import type { CurrentWorkspace, WorkspaceInfo } from './types.js';
import type { CloudSpace } from '../client/client-api.js';

export function getLocalWorkspace(): WorkspaceInfo {
  return {
    id: LOCAL_SPACE_ID,
    name: t('space.local.name'),
    type: 'local',
    plan: 'free',
    features: ['local-resources', 'template-engine'],
  };
}

export function cloudSpaceToWorkspace(space: CloudSpace): WorkspaceInfo {
  return {
    id: space.id,
    name: space.name,
    type: space.type,
    plan: space.plan.type,
    features: space.features,
  };
}

function normalizeCurrent(value: unknown): CurrentWorkspace | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Partial<CurrentWorkspace>;
  if (typeof raw.id !== 'string' || !raw.id) {
    return null;
  }
  return {
    id: raw.id,
    selectedAt: typeof raw.selectedAt === 'string' ? raw.selectedAt : new Date().toISOString(),
  };
}

export class WorkspaceStore {
  static getCurrent(): CurrentWorkspace {
    const filePath = getCurrentSpaceFilePath();
    if (!existsSync(filePath)) {
      return { id: LOCAL_SPACE_ID, selectedAt: new Date().toISOString() };
    }

    try {
      return normalizeCurrent(JSON.parse(readFileSync(filePath, 'utf8')))
        ?? { id: LOCAL_SPACE_ID, selectedAt: new Date().toISOString() };
    } catch {
      return { id: LOCAL_SPACE_ID, selectedAt: new Date().toISOString() };
    }
  }

  static setCurrent(id: string): CurrentWorkspace {
    const next = { id, selectedAt: new Date().toISOString() };
    const filePath = getCurrentSpaceFilePath();
    mkdirSync(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    renameSync(tempPath, filePath);
    return next;
  }
}
