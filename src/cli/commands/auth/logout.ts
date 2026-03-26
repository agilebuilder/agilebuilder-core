/**
 * logout 命令
 * 
 * 登出并清除本地认证数据
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { logout, isLoggedIn, TokenStore } from '../../../auth/index.js';
import { t } from '../../../i18n/index.js';

export const logoutCommand = new Command('logout')
  .description(t('auth.logout.description'))
  .action(() => {
    // 检查是否已登录
    if (!isLoggedIn()) {
      console.log(chalk.yellow(`\n${t('auth.logout.notLoggedIn')}\n`));
      return;
    }
    
    const user = TokenStore.getUser();
    const result = logout();
    
    if (result.success) {
      console.log(chalk.green(`\n✓ ${result.message}`));
      if (user) {
        console.log(chalk.dim(`${t('auth.logout.loggedOutAccount', { name: user.name })}\n`));
      }
    } else {
      console.log(chalk.red(`\n✗ ${result.message}\n`));
      process.exit(1);
    }
  });
