/**
 * login 命令
 * 
 * 打开浏览器进行 SSO 登录
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { login, isLoggedIn, TokenStore } from '../../../auth/index.js';
import { AccessChecker, SpaceManager } from '../../../license/index.js';
import { ProDownloader } from '../../../pro-loader/index.js';
import { t } from '../../../i18n/index.js';

export const loginCommand = new Command('login')
  .description(t('auth.command.description'))
  .action(async () => {
    // 检查是否已登录
    if (isLoggedIn()) {
      const user = TokenStore.getUser();
      if (user) {
        console.log(chalk.yellow(`\n${t('auth.command.alreadyLoggedIn', { name: chalk.bold(user.name) })}`));
        console.log(chalk.dim(`${t('auth.command.logoutHint')}\n`));
        return;
      }
    }
    
    console.log();
    const spinner = ora(t('auth.command.preparing')).start();

    try {
      spinner.stop();

      console.log(chalk.cyan(`${t('auth.command.openingBrowser')}\n`));

      // 执行登录
      const result = await login({
        onAuthUrl: (url) => {
          console.log(chalk.dim(t('auth.command.manualOpenHint')));
          console.log(chalk.dim(`   ${url}\n`));
        },
      });
      
      if (result.success && result.user) {
        console.log(chalk.green(`\n${t('auth.command.loginSuccess')}`));
        console.log(chalk.white(`${t('auth.command.welcomeBack', { name: chalk.bold(result.user.name) })}\n`));
        
        // 获取 License 信息
        const licenseResult = await AccessChecker.fetchAndCacheLicense();
        if (licenseResult.success) {
          // 检查是否有 Pro 空间，有则预下载 Pro 模块
          const spaces = SpaceManager.getAvailableSpaces();
          const hasProSpace = spaces.some(s => s.plan.type === 'pro' || s.plan.type === 'trial');
          
          if (hasProSpace && ProDownloader.needsDownload()) {
            console.log(chalk.dim(t('auth.command.preDownloadPro')));
            const downloadResult = await ProDownloader.download();
            if (downloadResult.success) {
              console.log(chalk.dim(t('auth.command.proReady', { version: downloadResult.version })));
            }
          }
          
          console.log(chalk.dim(`\n${t('auth.command.spaceHint')}`));
          console.log(chalk.dim(`${t('auth.command.statusHint')}\n`));
        } else {
          console.log(chalk.yellow(t('auth.command.licenseFailed', { error: licenseResult.error || t('common.unknownError') })));
          console.log(chalk.dim(`${t('auth.command.licenseLimitedHint')}\n`));
        }
      } else {
        console.log(chalk.red(`\n${t('auth.command.loginFailed')}`));
        if (result.error) {
          console.log(chalk.red(`  ${result.error}\n`));
        }
        process.exit(1);
      }
    } catch (error) {
      spinner.stop();
      console.log(chalk.red(`\n${t('auth.command.loginFailed')}`));
      console.log(chalk.red(`  ${error instanceof Error ? error.message : t('common.unknownError')}\n`));
      process.exit(1);
    }
  });
