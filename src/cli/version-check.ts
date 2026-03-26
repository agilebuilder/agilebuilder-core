/**
 * CLI 版本检查模块
 *
 * 在 CLI 启动时检查是否需要更新
 * 对接后端: GET /api/client/version-check
 */

import chalk from 'chalk';
import { APP_VERSION } from '../shared/constants.js';
import { ApiClient } from '../shared/api-client.js';
import { getIgnoredVersionsFilePath, getDataDir } from '../shared/paths.js';
import { t } from '../i18n/index.js';
import { platform, arch } from 'os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import * as readline from 'readline';

/**
 * 版本检查响应
 */
interface VersionCheckResponse {
  resourceType: string;
  platform: string;
  arch: string;
  currentVersion: string;
  latestVersion: string;
  minVersion: string;
  needUpdate: boolean;
  forceUpdate: boolean;
  forceUpdateVersion?: string;
  forceUpdateChangelog?: string;
  downloadUrl: string;
  fileSize: number;
  sha256: string;
  changelog: string;
  message: string;
}

/**
 * 忽略版本数据结构
 */
interface IgnoredVersions {
  versions: string[];
  updatedAt: string;
}

/**
 * 比较版本号
 * 
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersion(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  
  return 0;
}

/**
 * 获取平台标识
 */
function getPlatform(): string {
  const p = platform();
  switch (p) {
    case 'win32': return 'windows';
    case 'darwin': return 'macos';
    case 'linux': return 'linux';
    default: return p;
  }
}

/**
 * 获取架构标识
 */
function getArch(): string {
  const a = arch();
  switch (a) {
    case 'x64': return 'x64';
    case 'arm64': return 'arm64';
    default: return a;
  }
}

/**
 * 读取忽略版本列表
 */
function loadIgnoredVersions(): string[] {
  try {
    const filePath = getIgnoredVersionsFilePath();
    if (!existsSync(filePath)) {
      return [];
    }
    const content = readFileSync(filePath, 'utf-8');
    const data: IgnoredVersions = JSON.parse(content);
    return data.versions || [];
  } catch {
    return [];
  }
}

/**
 * 保存忽略版本
 */
function saveIgnoredVersion(version: string): void {
  try {
    const dataDir = getDataDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const versions = loadIgnoredVersions();
    if (!versions.includes(version)) {
      versions.push(version);
    }

    const data: IgnoredVersions = {
      versions,
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(getIgnoredVersionsFilePath(), JSON.stringify(data, null, 2));
  } catch (err) {
    if (process.env.DEBUG) {
      console.warn(`[Version] ${t('version.checkFailed', { error: String(err) })}`);
    }
  }
}

/**
 * 检查版本是否被忽略
 */
function isVersionIgnored(version: string): boolean {
  const ignoredVersions = loadIgnoredVersions();
  return ignoredVersions.includes(version);
}

/**
 * 用户确认提示
 */
function askUserConfirm(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * 执行 npm 升级
 */
function runNpmUpgrade(): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(chalk.cyan(`\n${t('version.upgrading')}`));

    const isWindows = platform() === 'win32';
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';

    const child = spawn(npmCmd, ['install', '-g', 'agilebuilder@latest'], {
      stdio: 'inherit',
      shell: isWindows,
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green(`\n${t('version.upgradeSuccess')}`));
        resolve(true);
      } else {
        console.log(chalk.red(`\n${t('version.upgradeFailed')}`));
        resolve(false);
      }
    });

    child.on('error', (err) => {
      console.log(chalk.red(`\n${t('version.upgradeError', { error: err.message })}`));
      console.log(chalk.yellow(t('version.manualUpgrade')));
      resolve(false);
    });
  });
}

/**
 * 处理强制更新
 */
async function handleForceUpdate(data: VersionCheckResponse): Promise<boolean> {
  console.log();
  console.log(chalk.red.bold('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.red.bold(`║                      ⚠️  ${t('version.tooLow')}                           ║`));
  console.log(chalk.red.bold('╚════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.red(`  ${t('version.current', { version: APP_VERSION })}`));
  if (data.forceUpdateVersion) {
    console.log(chalk.red(`  ${t('version.forceUpdateVersion', { version: data.forceUpdateVersion })}`));
  }
  console.log(chalk.green(`  ${t('version.latest', { version: data.latestVersion })}`));
  console.log();

  if (data.forceUpdateChangelog) {
    console.log(chalk.yellow(`  ${t('version.changelog', { changelog: data.forceUpdateChangelog })}`));
    console.log();
  }

  // 询问用户是否立即更新
  const answer = await askUserConfirm(chalk.cyan(`  ${t('version.updateNowPrompt')}`));

  if (answer === 'y' || answer === 'yes') {
    const success = await runNpmUpgrade();
    // 无论成功与否都退出，让用户重新运行
    process.exit(success ? 0 : 1);
  }

  console.log(chalk.red(`\n  ${t('version.mustUpdate')}`));
  return false;
}

/**
 * 处理可选更新
 */
async function handleOptionalUpdate(data: VersionCheckResponse): Promise<boolean> {
  // 检查该版本是否已被忽略
  if (isVersionIgnored(data.latestVersion)) {
    return true;
  }

  console.log();
  console.log(chalk.yellow(t('version.newVersionFound', { latestVersion: data.latestVersion, currentVersion: APP_VERSION })));

  if (data.changelog) {
    console.log(chalk.dim(`   ${data.changelog}`));
  }
  console.log();

  // 询问用户操作
  console.log(chalk.cyan(t('version.chooseAction')));
  console.log(chalk.white(t('version.actionYes')));
  console.log(chalk.white(t('version.actionNo')));
  console.log(chalk.white(t('version.actionIgnore')));
  console.log();

  const answer = await askUserConfirm(chalk.cyan(t('version.inputPrompt')));

  if (answer === 'y' || answer === 'yes') {
    const success = await runNpmUpgrade();
    if (success) {
      process.exit(0);
    }
    // 升级失败，继续运行
    return true;
  }

  if (answer === 'i' || answer === 'ignore') {
    saveIgnoredVersion(data.latestVersion);
    console.log(chalk.dim(`\n  ${t('version.ignored', { version: data.latestVersion })}`));
  }

  console.log();
  return true;
}

/**
 * 检查 CLI 版本
 *
 * @returns 是否允许继续运行（false = 强制更新，需要退出）
 */
export async function checkCliVersion(): Promise<boolean> {
  try {
    const endpoint = `/api/client/version-check?platform=${getPlatform()}&arch=${getArch()}`;
    const result = await ApiClient.get<VersionCheckResponse>(endpoint, { timeout: 3000 });

    if (!result.success || !result.data) {
      if (process.env.DEBUG) {
        console.warn(`[Version] ${t('version.checkFailed', { error: result.error || t('common.unknownError') })}`);
      }
      return true;
    }

    const data = result.data;

    // 强制更新
    if (data.forceUpdate) {
      return await handleForceUpdate(data);
    }

    // 可选更新
    if (data.needUpdate) {
      return await handleOptionalUpdate(data);
    }

    return true;
  } catch (error) {
    if (process.env.DEBUG) {
      console.warn(`[Version] ${t('version.checkError', { error: error instanceof Error ? error.message : t('common.unknownError') })}`);
    }
    return true;
  }
}

/**
 * 获取当前 CLI 版本
 */
export function getCliVersion(): string {
  return APP_VERSION;
}

/**
 * 检查本地版本是否低于指定版本
 */
export function isVersionLowerThan(version: string): boolean {
  return compareVersion(APP_VERSION, version) < 0;
}
