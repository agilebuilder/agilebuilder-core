import { Command } from 'commander';
import { LOCAL_SPACE_ID } from '../shared/constants.js';
import { t } from '../i18n/index.js';
import { writeSuccess } from '../output/format.js';
import {
  renderWorkspaceCurrent,
  renderWorkspaceList,
  renderWorkspaceUse,
} from '../output/cli-renderers.js';
import { cloudSpaceToWorkspace, getLocalWorkspace, WorkspaceStore } from '../workspace/store.js';
import { LicenseStore } from '../license/license-store.js';
import { AppError } from '../errors/app-error.js';

interface JsonOption {
  json?: boolean;
  refresh?: boolean;
}

export function createSpaceCommand(): Command {
  const command = new Command('space')
    .description(t('space.description'));

  command
    .command('list')
    .alias('ls')
    .description(t('space.list.description'))
    .option('--refresh', 'Refresh cloud workspace cache')
    .option('--json', 'Output JSON')
    .action(async (options: JsonOption) => {
      const current = WorkspaceStore.getCurrent();
      const local = getLocalWorkspace();
      const license = await LicenseStore.getOrRefresh(options.refresh);
      const cloudSpaces = license?.data.spaces.map(cloudSpaceToWorkspace) ?? [];
      writeSuccess({
        currentWorkspaceId: current.id,
        items: [
          {
            ...local,
            current: current.id === local.id,
          },
          ...cloudSpaces.map((space) => ({
            ...space,
            current: current.id === space.id,
          })),
        ],
      }, options, renderWorkspaceList);
    });

  command
    .command('current')
    .description(t('space.current.description'))
    .option('--json', 'Output JSON')
    .action(async (options: JsonOption) => {
      const current = WorkspaceStore.getCurrent();
      const local = getLocalWorkspace();
      const license = await LicenseStore.getOrRefresh(false);
      const cloud = license?.data.spaces.find((space) => space.id === current.id);
      writeSuccess(cloud
        ? { ...cloudSpaceToWorkspace(cloud), current: true, selectedAt: current.selectedAt }
        : { ...local, current: current.id === local.id, selectedAt: current.selectedAt }, options, renderWorkspaceCurrent);
    });

  command
    .command('use')
    .argument('<workspace>')
    .description(t('space.use.description'))
    .option('--json', 'Output JSON')
    .action(async (workspace: string, options: JsonOption) => {
      const id = workspace === 'local' ? LOCAL_SPACE_ID : workspace;
      const local = getLocalWorkspace();
      let name = local.name;
      if (id !== LOCAL_SPACE_ID) {
        const license = await LicenseStore.getOrRefresh(false);
        const workspace = license?.data.spaces.find((space) => space.id === id);
        if (!workspace) {
          throw new AppError({
            code: 'WORKSPACE_NOT_FOUND',
            message: `Workspace not found: ${id}`,
            suggestion: 'Run ag space list --refresh after login.',
            category: 'resource',
          });
        }
        name = workspace.name;
      }

      WorkspaceStore.setCurrent(id);
      writeSuccess({
        message: t('space.use.success', { name }),
        workspace: id === LOCAL_SPACE_ID ? local : { id, name },
      }, options, renderWorkspaceUse);
    });

  return command;
}
