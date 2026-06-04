import { Command } from 'commander';
import { LOCAL_SPACE_ID } from '../shared/constants.js';
import { t } from '../i18n/index.js';
import { writeSuccess } from '../output/format.js';
import { getLocalWorkspace, WorkspaceStore } from '../workspace/store.js';

interface JsonOption {
  json?: boolean;
}

export function createSpaceCommand(): Command {
  const command = new Command('space')
    .description(t('space.description'));

  command
    .command('list')
    .alias('ls')
    .description(t('space.list.description'))
    .option('--json', 'Output JSON')
    .action((options: JsonOption) => {
      const current = WorkspaceStore.getCurrent();
      const local = getLocalWorkspace();
      writeSuccess({
        currentWorkspaceId: current.id,
        items: [
          {
            ...local,
            current: current.id === local.id,
          },
        ],
      }, options);
    });

  command
    .command('current')
    .description(t('space.current.description'))
    .option('--json', 'Output JSON')
    .action((options: JsonOption) => {
      const current = WorkspaceStore.getCurrent();
      const local = getLocalWorkspace();
      writeSuccess({
        ...local,
        current: current.id === local.id,
        selectedAt: current.selectedAt,
      }, options);
    });

  command
    .command('use')
    .argument('<workspace>')
    .description(t('space.use.description'))
    .option('--json', 'Output JSON')
    .action((workspace: string, options: JsonOption) => {
      const id = workspace === 'local' ? LOCAL_SPACE_ID : workspace;
      WorkspaceStore.setCurrent(id);
      const local = getLocalWorkspace();
      const name = id === LOCAL_SPACE_ID ? local.name : id;
      writeSuccess({
        message: t('space.use.success', { name }),
        workspace: id === LOCAL_SPACE_ID ? local : { id, name },
      }, options);
    });

  return command;
}
