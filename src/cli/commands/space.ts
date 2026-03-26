import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { isLoggedIn } from '../../auth/index.js';
import { SpaceManager, AccessChecker } from '../../license/index.js';
import { ProManager } from '../../pro-loader/index.js';
import { t } from '../../i18n/index.js';
import { LOCAL_SPACE_ID } from '../../shared/constants.js';
import type { CurrentSpace, SpaceInfo } from '../../shared/types.js';

function isLocalSpace(spaceId: string): boolean {
  return spaceId === LOCAL_SPACE_ID;
}

function getPlanTypeDisplay(planType: SpaceInfo['plan']['type'] | CurrentSpace['plan'], trialDaysRemaining?: number | null): string {
  switch (planType) {
    case 'pro':
      return chalk.green(t('common.pro'));
    case 'trial':
      return chalk.yellow(t('common.trialDays', { days: trialDaysRemaining ?? '?' }));
    case 'free':
    default:
      return chalk.gray(t('common.free'));
  }
}

function getPlanDisplay(space: SpaceInfo): string {
  return getPlanTypeDisplay(space.plan.type, space.plan.trialDaysRemaining);
}

function getRoleDisplay(role: SpaceInfo['role']): string {
  switch (role) {
    case 'owner':
      return chalk.cyan(t('common.owner'));
    case 'admin':
      return chalk.blue(t('common.admin'));
    case 'member':
    default:
      return chalk.gray(t('common.member'));
  }
}

function getFeatureDisplay(feature: string): string {
  switch (feature) {
    case 'local-templates':
      return t('common.featureLocalTemplates');
    default:
      return feature;
  }
}

function getFeaturesDisplay(features: string[]): string {
  return features.map(getFeatureDisplay).join(', ');
}

function getSpaceNameDisplay(space: Pick<SpaceInfo, 'id' | 'name'> | Pick<CurrentSpace, 'spaceId' | 'spaceName'>): string {
  const id = 'id' in space ? space.id : space.spaceId;
  const name = 'name' in space ? space.name : space.spaceName;
  return id === LOCAL_SPACE_ID ? t('common.localSpaceName') : name;
}

export const spaceCommand = new Command('space')
  .description(t('space.description'))
  .action(async () => {
    console.log();

    const loggedIn = isLoggedIn();
    if (!loggedIn) {
      console.log(chalk.yellow(t('space.notLoggedInLocalOnly')));
      console.log(chalk.dim(`${t('space.loginHint')}\n`));
    } else {
      await AccessChecker.fetchAndCacheLicense();
    }

    const spaces = SpaceManager.getAvailableSpaces();
    const currentSpace = SpaceManager.getCurrentSpace();

    const choices = spaces.map((space) => {
      const isCurrent = currentSpace?.spaceId === space.id;
      const prefix = isCurrent ? chalk.green('✓ ') : '  ';
      const planTag = getPlanDisplay(space);
      const roleTag = getRoleDisplay(space.role);

      if (isLocalSpace(space.id)) {
        const localName = getSpaceNameDisplay(space);
        return {
          name: `${prefix}${localName} ${chalk.magenta(t('common.local'))} ${planTag}`,
          value: space.id,
          short: localName,
        };
      }

      const typeTag = space.type === 'personal' ? t('common.personal') : t('common.team');
      const requiresProTag = space.plan.type === 'free' ? chalk.yellow(t('common.requiresPro')) : '';
      const displayName = getSpaceNameDisplay(space);

      return {
        name: `${prefix}${displayName} ${chalk.dim(`[${typeTag}]`)} ${planTag} ${roleTag}${requiresProTag}`,
        value: space.id,
        short: displayName,
      };
    });

    choices.push({
      name: chalk.dim(`  ${t('common.cancel')}`),
      value: '__cancel__',
      short: t('common.cancel'),
    });

    if (currentSpace) {
      console.log(chalk.dim(`${t('space.currentWorkspace', { name: getSpaceNameDisplay(currentSpace) })}\n`));
    }

    const { selectedSpaceId } = await inquirer.prompt([
      {
        type: 'select',
        name: 'selectedSpaceId',
        message: t('space.selectPrompt'),
        choices,
        default: currentSpace?.spaceId,
      },
    ]);

    if (selectedSpaceId === '__cancel__') {
      console.log(chalk.dim(`\n${t('space.cancelled')}\n`));
      return;
    }

    const result = SpaceManager.switchSpace(selectedSpaceId);

    if (result.success && result.space) {
      console.log(chalk.green(`\n${t('space.switched', { name: getSpaceNameDisplay(result.space) })}`));
      console.log(chalk.dim(`  ${t('common.plan')}: ${getPlanDisplay(result.space)}`));
      console.log(chalk.dim(`  ${t('common.features')}: ${getFeaturesDisplay(result.space.features)}`));

      if (!isLocalSpace(selectedSpaceId) && result.space.plan.type === 'free') {
        console.log();
        console.log(chalk.yellow(t('space.proNoticeTitle')));
        console.log(chalk.dim(t('space.proNoticeLine1')));
        console.log(chalk.dim(t('space.proNoticeLine2')));
      }

      if (!isLocalSpace(selectedSpaceId) && result.space.plan.type !== 'free') {
        await ProManager.onSpaceSwitch(result.space.plan.type);
      }

      console.log();
    } else {
      console.log(chalk.red(`\n${t('space.switchFailed', { error: result.error || t('common.unknownError') })}\n`));
    }
  });

spaceCommand
  .command('list')
  .alias('ls')
  .description(t('space.listDescription'))
  .action(async () => {
    console.log();

    const loggedIn = isLoggedIn();
    if (!loggedIn) {
      console.log(chalk.yellow(t('space.notLoggedInLocalOnly')));
      console.log(chalk.dim(`${t('space.loginHint')}\n`));
    } else {
      await AccessChecker.fetchAndCacheLicense();
    }

    const spaces = SpaceManager.getAvailableSpaces();
    const currentSpace = SpaceManager.getCurrentSpace();

    console.log(chalk.bold(t('space.availableWorkspaces')));
    console.log();

    for (const space of spaces) {
      const isCurrent = currentSpace?.spaceId === space.id;
      const prefix = isCurrent ? chalk.green('● ') : '  ';
      const planTag = getPlanDisplay(space);
      const displayName = getSpaceNameDisplay(space);

      if (isLocalSpace(space.id)) {
        console.log(`${prefix}${chalk.bold(displayName)} ${chalk.magenta(t('common.local'))}`);
        console.log(`    ${t('common.id')}: ${chalk.dim(space.id)}`);
        console.log(`    ${t('common.plan')}: ${planTag}`);
        console.log(`    ${t('common.features')}: ${getFeaturesDisplay(space.features)}`);
      } else {
        const requiresProTag = space.plan.type === 'free' ? chalk.yellow(t('common.requiresPro')) : '';
        console.log(`${prefix}${chalk.bold(displayName)}${requiresProTag}`);
        console.log(`    ${t('common.id')}: ${chalk.dim(space.id)}`);
        console.log(`    ${t('common.type')}: ${space.type === 'personal' ? t('common.personal') : t('common.team')}`);
        console.log(`    ${t('common.plan')}: ${planTag}`);
        console.log(`    ${t('common.role')}: ${getRoleDisplay(space.role)}`);
      }
      console.log();
    }
  });

spaceCommand
  .command('current')
  .description(t('space.currentDescription'))
  .action(() => {
    const currentSpace = SpaceManager.getCurrentSpace();

    console.log();
    if (currentSpace) {
      console.log(chalk.bold(t('space.currentTitle')));
      console.log(`  ${t('common.name')}: ${chalk.green(getSpaceNameDisplay(currentSpace))}`);
      console.log(`  ${t('common.id')}: ${chalk.dim(currentSpace.spaceId)}`);
      console.log(`  ${t('common.plan')}: ${getPlanTypeDisplay(currentSpace.plan)}`);
      console.log(`  ${t('common.features')}: ${getFeaturesDisplay(currentSpace.features)}`);
    } else {
      console.log(chalk.yellow(t('space.noWorkspaceSelected')));
      console.log(chalk.dim(t('space.selectOneHint')));
    }
    console.log();
  });
