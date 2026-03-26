/**
 * device 命令
 * 
 * 管理已注册的设备
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { isLoggedIn } from '../../auth/index.js';
import { DeviceApi } from '../../device/device-api.js';
import { getDeviceId } from '../../license/device.js';
import { t } from '../../i18n/index.js';

export const deviceCommand = new Command('device')
  .description(t('device.description'))
  .action(async () => {
    // 检查登录状态
    if (!isLoggedIn()) {
      console.log(chalk.yellow(`\n${t('device.notLoggedIn')}`));
      console.log(chalk.dim(`${t('device.loginHint')}\n`));
      return;
    }
    
    // 获取设备列表
    const result = await DeviceApi.list();
    
    if (!result.success || !result.data) {
      console.log(chalk.red(`\n${t('device.listFailed', { error: result.error || t('common.unknownError') })}\n`));
      return;
    }
    
    const { devices, activeCount } = result.data;
    const currentDeviceId = getDeviceId();
    
    console.log();
    console.log(chalk.bold(t('device.title', { count: activeCount })));
    console.log();
    
    if (devices.length === 0) {
      console.log(chalk.dim(`  ${t('device.empty')}\n`));
      return;
    }
    
    for (const device of devices) {
      const isCurrent = device.deviceId === currentDeviceId;
      const prefix = isCurrent ? chalk.green('▶ ') : '  ';
      const statusTag = device.status === 'active' 
        ? chalk.green(t('device.active')) 
        : chalk.red(t('device.revoked'));
      const currentTag = isCurrent ? chalk.cyan(t('device.currentDevice')) : '';
      
      console.log(`${prefix}${chalk.bold(device.deviceName)}${currentTag}`);
      console.log(`    ${t('device.system')}: ${device.os} ${device.osVersion}`);
      console.log(`    ${t('common.typeLabel')}: ${device.deviceType}`);
      console.log(`    ${t('device.version')}: ${device.clientVersion}`);
      console.log(`    ${t('common.status')}: ${statusTag}`);
      console.log(`    ${t('device.lastActive')}: ${new Date(device.lastActiveAt).toLocaleString()}`);
      console.log();
    }
  });

// 子命令：列出设备
deviceCommand
  .command('list')
  .alias('ls')
  .description(t('device.listDescription'))
  .action(async () => {
    // 复用主命令逻辑
    await deviceCommand.parseAsync(['node', 'device']);
  });

// 子命令：撤销设备
deviceCommand
  .command('revoke [device-id]')
  .description(t('device.revokeDescription'))
  .action(async (deviceIdArg?: string) => {
    if (!isLoggedIn()) {
      console.log(chalk.yellow(`\n${t('device.notLoggedIn')}\n`));
      return;
    }
    
    // 获取设备列表
    const listResult = await DeviceApi.list();
    
    if (!listResult.success || !listResult.data) {
      console.log(chalk.red(`\n${t('device.listFailed', { error: listResult.error || t('common.unknownError') })}\n`));
      return;
    }
    
    const { devices } = listResult.data;
    const currentDeviceId = getDeviceId();
    
    // 过滤掉当前设备和已撤销设备
    const availableDevices = devices.filter(
      d => d.deviceId !== currentDeviceId && d.status === 'active'
    );
    
    if (availableDevices.length === 0) {
      console.log(chalk.yellow(`\n${t('device.noRevocableDevices')}\n`));
      return;
    }
    
    let targetDeviceId = deviceIdArg;
    
    // 如果没有提供设备 ID，交互式选择
    if (!targetDeviceId) {
      const { selectedDevice } = await inquirer.prompt([
        {
          type: 'select',
          name: 'selectedDevice',
          message: t('device.selectPrompt'),
          choices: [
            ...availableDevices.map(d => ({
              name: `${d.deviceName} (${d.os}) - ${d.lastActiveAt}`,
              value: d.deviceId,
            })),
            { name: chalk.dim(t('common.cancel')), value: '__cancel__' },
          ],
        },
      ]);
      
      if (selectedDevice === '__cancel__') {
        console.log(chalk.dim(`\n${t('common.cancel')}\n`));
        return;
      }
      
      targetDeviceId = selectedDevice;
    }
    
    // 确认撤销
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: t('device.revokeConfirm'),
        default: false,
      },
    ]);
    
    if (!confirm) {
      console.log(chalk.dim(`\n${t('common.cancel')}\n`));
      return;
    }
    
    // 执行撤销
    const result = await DeviceApi.revoke(targetDeviceId!);
    
    if (result.success) {
      console.log(chalk.green(`\n${t('device.revokedSuccess')}\n`));
    } else {
      console.log(chalk.red(`\n${t('device.revokeFailed', { error: result.error || t('common.unknownError') })}\n`));
    }
  });

// 子命令：撤销所有其他设备
deviceCommand
  .command('revoke-all')
  .description(t('device.revokeAllDescription'))
  .action(async () => {
    if (!isLoggedIn()) {
      console.log(chalk.yellow(`\n${t('device.notLoggedIn')}\n`));
      return;
    }
    
    // 确认
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: t('device.revokeAllConfirm'),
        default: false,
      },
    ]);
    
    if (!confirm) {
      console.log(chalk.dim(`\n${t('common.cancel')}\n`));
      return;
    }
    
    // 执行撤销
    const result = await DeviceApi.revokeAll();
    
    if (result.success) {
      console.log(chalk.green(`\n${t('device.revokeAllSuccess', { count: result.revokedCount || 0 })}\n`));
    } else {
      console.log(chalk.red(`\n${t('device.revokeFailed', { error: result.error || t('common.unknownError') })}\n`));
    }
  });
