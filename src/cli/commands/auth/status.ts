/**
 * status 命令
 * 
 * 显示当前登录状态和账户信息
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { isLoggedIn, TokenStore } from '../../../auth/index.js';
import { SpaceManager, LicenseStore } from '../../../license/index.js';
import { APP_VERSION } from '../../../shared/constants.js';
import { t } from '../../../i18n/index.js';

export const statusCommand = new Command('status')
  .description(t('auth.status.description'))
  .action(async () => {
    console.log();
    
    // 构建状态信息
    const lines: string[] = [];
    
    // CLI 版本
    lines.push(`  ${chalk.dim(`${t('auth.status.cliVersion')}:`)}  ${APP_VERSION}`);
    
    // 登录状态
    if (isLoggedIn()) {
      await TokenStore.getValidToken();

      const user = TokenStore.getUser();
      const auth = TokenStore.load();
      
      if (user) {
        lines.push(`  ${chalk.dim(`${t('auth.status.account')}:`)}      ${chalk.green(user.name)}`);
        
        if (user.email) {
          lines.push(`  ${chalk.dim(`${t('auth.status.email')}:`)}        ${user.email}`);
        }
        if (user.mobile) {
          lines.push(`  ${chalk.dim(`${t('auth.status.mobile')}:`)}       ${user.mobile}`);
        }
      }
      
      // Token 状态
      if (auth) {
        const isExpired = Date.now() >= auth.expiresAt;
        
        if (isExpired) {
          lines.push(`  ${chalk.dim(`${t('auth.status.token')}:`)}        ${chalk.red(t('auth.status.tokenExpired'))}`);
        } else {
          const remaining = Math.floor((auth.expiresAt - Date.now()) / 1000 / 60);
          lines.push(`  ${chalk.dim(`${t('auth.status.token')}:`)}        ${chalk.green(t('auth.status.tokenValid'))} ${chalk.dim(t('auth.status.tokenExpiresInMinutes', { minutes: remaining }))}`);
        }
      }
      
      // Space 和 License 信息
      const currentSpace = SpaceManager.getCurrentSpaceInfo();
      const hasProAccess = LicenseStore.hasProAccess();
      
      if (currentSpace) {
        lines.push(`  ${chalk.dim(`${t('auth.status.workspace')}:`)}    ${chalk.green(currentSpace.name)}`);
        
        let planDisplay: string;
        if (currentSpace.plan.type === 'pro') {
          planDisplay = chalk.green(t('common.pro'));
        } else if (currentSpace.plan.type === 'trial') {
          planDisplay = chalk.yellow(t('common.trial'));
        } else {
          planDisplay = chalk.gray(t('common.free'));
        }
        lines.push(`  ${chalk.dim(`${t('auth.status.plan')}:`)}         ${planDisplay}`);
      } else {
        lines.push(`  ${chalk.dim(`${t('auth.status.workspace')}:`)}    ${chalk.yellow(t('auth.status.notSelected'))}`);
        lines.push(`  ${chalk.dim(`${t('auth.status.plan')}:`)}         ${chalk.dim('-')}`);
      }
      
      // Pro 权限
      if (hasProAccess) {
        lines.push(`  ${chalk.dim(`${t('auth.status.proAccess')}:`)}   ${chalk.green('✓')}`);
      }
      
    } else {
      lines.push(`  ${chalk.dim(`${t('auth.status.account')}:`)}      ${chalk.yellow(t('auth.status.notLoggedInText'))}`);
      lines.push('');
      lines.push(`  ${chalk.dim(t('auth.status.loginHint'))}`);
    }
    
    // 绘制框
    const maxLen = Math.max(...lines.map(l => stripAnsi(l).length)) + 2;
    const border = '─'.repeat(maxLen);
    
    console.log(chalk.cyan(`╭${border}╮`));
    console.log(chalk.cyan(`│`) + ' '.repeat(maxLen) + chalk.cyan(`│`));
    console.log(chalk.cyan(`│`) + centerText(t('auth.status.title'), maxLen) + chalk.cyan(`│`));
    console.log(chalk.cyan(`├${border}┤`));
    
    for (const line of lines) {
      const padding = maxLen - stripAnsi(line).length;
      console.log(chalk.cyan(`│`) + line + ' '.repeat(padding) + chalk.cyan(`│`));
    }
    
    console.log(chalk.cyan(`│`) + ' '.repeat(maxLen) + chalk.cyan(`│`));
    console.log(chalk.cyan(`╰${border}╯`));
    console.log();
  });

/**
 * 移除 ANSI 转义序列
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * 居中文本
 */
function centerText(text: string, width: number): string {
  const textLen = stripAnsi(text).length;
  const padding = Math.floor((width - textLen) / 2);
  return ' '.repeat(padding) + chalk.bold(text) + ' '.repeat(width - textLen - padding);
}
