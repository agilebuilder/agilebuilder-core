/**
 * Auth 命令组
 * 
 * 包含 login, logout, status 命令
 */

import { Command } from 'commander';
import { loginCommand } from './login.js';
import { logoutCommand } from './logout.js';
import { statusCommand } from './status.js';

// 创建命令组（不使用子命令形式，直接作为顶级命令）
export { loginCommand, logoutCommand, statusCommand };
