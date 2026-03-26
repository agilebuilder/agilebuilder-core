/**
 * pro 命令
 *
 * 管理 Pro 模块
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { select } from '@inquirer/prompts';
import { isLoggedIn } from '../../auth/index.js';
import { SpaceManager } from '../../license/index.js';
import { ProManager, ProLoader, ProDownloader } from '../../pro-loader/index.js';
import { APP_VERSION } from '../../shared/constants.js';
import { t } from '../../i18n/index.js';

export const proCommand = new Command('pro')
  .description(t('pro.description'))
  .action(async () => {
    // 检查权限
    if (!checkProAccess()) {
      return;
    }

    // 显示交互式菜单
    await showProMenu();
  });

/**
 * 检查 Pro 访问权限
 */
function checkProAccess(): boolean {
  if (!isLoggedIn()) {
    console.log(chalk.yellow(`\n${t('pro.loginRequired')}`));
    console.log(chalk.dim(`${t('pro.loginHint')}\n`));
    return false;
  }

  if (!SpaceManager.hasAnyProSpace()) {
    console.log(chalk.yellow(`\n${t('pro.noProSpace')}`));
    console.log(chalk.dim(`${t('pro.upgradeHint')}\n`));
    return false;
  }

  return true;
}

/**
 * 显示交互式菜单
 */
async function showProMenu(): Promise<void> {
  console.log();
  console.log(chalk.bold(t('pro.title')));
  console.log();

  const status = await ProManager.getStatus();

  // 显示当前状态摘要
  if (status.available) {
    console.log(`  ${t('pro.currentVersion', { version: chalk.green(status.version) })}`);
    console.log(`  ${t('pro.loadStatus', { status: status.loaded ? chalk.green(t('pro.loaded')) : chalk.dim(t('pro.notLoaded')) })}`);
    if (status.hasUpdate) {
      console.log(`  ${chalk.cyan(t('pro.newVersion', { version: status.latestVersion }))}`);
    }
  } else {
    console.log(chalk.yellow(`  ${t('pro.notInstalled')}`));
  }
  console.log();

  // 构建菜单选项
  const choices = buildMenuChoices(status);

  try {
    const action = await select({
      message: t('pro.selectAction'),
      choices,
    });

    await handleMenuAction(action);
  } catch {
    // 用户取消选择
    console.log();
  }
}

/**
 * 构建菜单选项
 */
function buildMenuChoices(status: Awaited<ReturnType<typeof ProManager.getStatus>>) {
  const choices: Array<{ name: string; value: string; description?: string }> = [];

  // 查看详细信息
  choices.push({
    name: t('pro.menu.info'),
    value: 'info',
    description: t('pro.menu.infoDescription'),
  });

  // 检查更新
  choices.push({
    name: t('pro.menu.checkUpdate'),
    value: 'check-update',
    description: t('pro.menu.checkUpdateDescription'),
  });

  // 下载/重新下载
  if (status.available) {
    choices.push({
      name: t('pro.menu.redownload'),
      value: 'redownload',
      description: t('pro.menu.redownloadDescription'),
    });
  } else {
    choices.push({
      name: t('pro.menu.download'),
      value: 'download',
      description: t('pro.menu.downloadDescription'),
    });
  }

  // 更新（如果有更新）
  if (status.hasUpdate && status.canUpdate) {
    choices.push({
      name: t('pro.menu.updateTo', { version: status.latestVersion }),
      value: 'update',
      description: status.changelog || t('pro.menu.updateDescription'),
    });
  }

  // 验证完整性
  if (status.available) {
    choices.push({
      name: t('pro.menu.verify'),
      value: 'verify',
      description: t('pro.menu.verifyDescription'),
    });
  }

  // 加载/卸载
  if (status.available) {
    if (status.loaded) {
      choices.push({
        name: t('pro.menu.unload'),
        value: 'unload',
        description: t('pro.menu.unloadDescription'),
      });
    } else {
      choices.push({
        name: t('pro.menu.load'),
        value: 'load',
        description: t('pro.menu.loadDescription'),
      });
    }
  }

  // 退出
  choices.push({
    name: t('pro.menu.back'),
    value: 'exit',
  });

  return choices;
}

/**
 * 处理菜单操作
 */
async function handleMenuAction(action: string): Promise<void> {
  console.log();

  switch (action) {
    case 'info':
      await showDetailedInfo();
      break;
    case 'check-update':
      await checkUpdate();
      break;
    case 'download':
    case 'redownload':
      await downloadModule();
      break;
    case 'update':
      await updateModule();
      break;
    case 'verify':
      await verifyIntegrity();
      break;
    case 'load':
      await loadModule();
      break;
    case 'unload':
      unloadModule();
      break;
    case 'exit':
    default:
      break;
  }
}

/**
 * 显示详细信息
 */
async function showDetailedInfo(): Promise<void> {
  const info = ProManager.getDetailedInfo();

  console.log(chalk.bold(t('pro.detailTitle')));
  console.log();

  if (!info.available) {
    console.log(chalk.yellow(`  ${t('pro.notInstalled')}`));
    console.log();
    return;
  }

  console.log(`  ${t('pro.currentVersion', { version: info.version })}`);
  console.log(`  ${t('pro.minCliVersion')}: ${info.minCliVersion}`);
  console.log(`  ${t('pro.currentCliVersion')}: ${APP_VERSION}`);
  console.log(`  ${t('pro.fileSize')}: ${formatSize(info.size || 0)}`);
  console.log(`  ${t('pro.updatedAt')}: ${info.updatedAt}`);
  console.log(`  SHA256:      ${info.sha256?.substring(0, 16)}...`);
  console.log(`  ${t('pro.integrity')}: ${info.integrity ? chalk.green(t('pro.integrityPass')) : chalk.red(t('pro.integrityFail'))}`);

  if (info.features && info.features.length > 0) {
    console.log(`  ${t('pro.featureList')}: ${info.features.join(', ')}`);
  }

  console.log();
}

/**
 * 检查更新
 */
async function checkUpdate(): Promise<void> {
  console.log(chalk.dim(t('pro.checkingUpdate')));

  const updateInfo = await ProDownloader.checkUpdate();

  if (updateInfo.error) {
    console.log(chalk.red(`\n${t('pro.checkUpdateFailed', { error: updateInfo.error })}\n`));
    return;
  }

  if (!updateInfo.hasUpdate) {
    console.log(chalk.green(`\n${t('pro.alreadyLatest', { version: updateInfo.currentVersion })}\n`));
    return;
  }

  console.log();
  console.log(chalk.cyan(t('pro.newVersionFound', { currentVersion: updateInfo.currentVersion, latestVersion: updateInfo.latestVersion })));

  if (updateInfo.changelog) {
    console.log(chalk.dim(t('pro.changelog', { changelog: updateInfo.changelog })));
  }

  console.log();
  console.log(chalk.dim(t('pro.updateHint')));
  console.log();
}

/**
 * 下载模块
 */
async function downloadModule(): Promise<void> {
  console.log(chalk.dim(t('pro.downloading')));

  const result = await ProDownloader.download();

  if (result.success) {
    console.log(chalk.green(`\n${t('pro.downloadSuccess', { version: result.version })}\n`));
  } else {
    console.log(chalk.red(`\n${t('pro.downloadFailed', { error: result.error })}\n`));
  }
}

/**
 * 更新模块
 */
async function updateModule(): Promise<void> {
  console.log(chalk.dim(t('pro.updating')));

  const result = await ProManager.forceUpdate();

  if (result.success) {
    console.log(chalk.green(`\n${t('pro.updateSuccess', { version: result.version })}\n`));
  } else {
    console.log(chalk.red(`\n${t('pro.updateFailed', { error: result.error })}\n`));
  }
}

/**
 * 验证完整性
 */
async function verifyIntegrity(): Promise<void> {
  console.log(chalk.dim(t('pro.verifying')));

  const result = ProManager.verifyIntegrity();

  if (result.valid) {
    console.log(chalk.green(`\n${t('pro.verifySuccess')}\n`));
  } else {
    console.log(chalk.red(`\n${t('pro.verifyFailed', { reason: result.reason })}`));
    console.log(chalk.dim(`${result.recoveryHint || t('pro.redownloadHint')}\n`));
  }
}

/**
 * 加载模块
 */
async function loadModule(): Promise<void> {
  console.log(chalk.dim(t('pro.loading')));

  const result = await ProLoader.load();

  if (result.success) {
    console.log(chalk.green(`\n${t('pro.loadSuccess')}\n`));
  } else {
    console.log(chalk.red(`\n${t('pro.loadFailed', { error: result.error })}\n`));
  }
}

/**
 * 卸载模块
 */
function unloadModule(): void {
  ProLoader.unload();
  console.log(chalk.green(`${t('pro.unloadSuccess')}\n`));
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ============================================
// 子命令（保留原有命令行接口）
// ============================================

// 子命令：加载 Pro 模块
proCommand
  .command('load')
  .description(t('pro.menu.load'))
  .action(async () => {
    if (!checkProAccess()) return;

    const currentSpace = SpaceManager.getCurrentSpace();
    if (!currentSpace) {
      console.log(chalk.yellow(`\n${t('pro.selectWorkspaceFirst')}\n`));
      return;
    }

    if (!SpaceManager.isProPlan()) {
      console.log(chalk.yellow(`\n${t('pro.notProPlan')}\n`));
      return;
    }

    console.log(chalk.dim(`\n${t('pro.loading')}`));
    const result = await ProLoader.load();

    if (!result.success) {
      console.log(chalk.red(`\n${t('pro.loadFailed', { error: result.error })}\n`));
      const integrityResult = ProManager.verifyIntegrity();
      if (!integrityResult.valid && integrityResult.recoveryHint) {
        console.log(chalk.dim(`${integrityResult.recoveryHint}\n`));
      }
    }
  });

// 子命令：卸载 Pro 模块
proCommand
  .command('unload')
  .description(t('pro.menu.unload'))
  .action(() => {
    if (ProLoader.isLoaded()) {
      ProLoader.unload();
      console.log(chalk.green(`\n${t('pro.unloadSuccess')}\n`));
    } else {
      console.log(chalk.dim(`\n${t('pro.unloadNotLoaded')}\n`));
    }
  });

// 子命令：更新 Pro 模块
proCommand
  .command('update')
  .description(t('pro.menu.updateDescription'))
  .action(async () => {
    if (!checkProAccess()) return;

    console.log(chalk.dim(`\n${t('pro.checkingUpdate')}`));

    const updateInfo = await ProDownloader.checkUpdate();

    if (!updateInfo.hasUpdate) {
      console.log(chalk.green(`\n${t('pro.alreadyLatest', { version: updateInfo.currentVersion })}\n`));
      return;
    }

    console.log(chalk.cyan(`\n${t('pro.newVersion', { version: updateInfo.latestVersion })}`));
    console.log(chalk.dim(t('pro.updating')));

    const result = await ProManager.forceUpdate();

    if (result.success) {
      console.log(chalk.green(`\n${t('pro.updateSuccess', { version: result.version })}\n`));
    } else {
      console.log(chalk.red(`\n${t('pro.updateFailed', { error: result.error })}\n`));
    }
  });

// 子命令：显示 Pro 模块信息
proCommand
  .command('info')
  .description(t('pro.menu.infoDescription'))
  .action(async () => {
    await showDetailedInfo();
  });

// 子命令：验证完整性
proCommand
  .command('verify')
  .description(t('pro.menu.verifyDescription'))
  .action(async () => {
    await verifyIntegrity();
  });
