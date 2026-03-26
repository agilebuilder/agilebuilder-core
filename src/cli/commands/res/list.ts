/**
 * res list 命令 - 交互式资源浏览
 *
 * 支持本地空间和云端空间的资源浏览
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { isLoggedIn, TokenStore } from '../../../auth/index.js';
import { SpaceManager } from '../../../license/index.js';
import { ResourceApi } from '../../../resource/api.js';
import { ResourceCache } from '../../../resource/cache.js';
import { ProcessorFactory } from '../../../core/processor-factory.js';
import { BasicProcessor } from '../../../core/basic-processor.js';
import { ProProcessor } from '../../../core/pro-processor.js';
import { ProGuard } from '../../../pro-loader/pro-guard.js';
import { TemplatesDAO } from '../../../db/dao/templates.dao.js';
import { ResourcesDAO } from '../../../db/dao/resources.dao.js';
import { t } from '../../../i18n/index.js';
import { LOCAL_SPACE_ID, LOCAL_SPACE_NAME } from '../../../shared/constants.js';
import { printDocPreview } from './local-resource-utils.js';
import type { WorkspaceTreeNode, ResourceType, LocalResource, Template } from '../../../shared/types.js';

// 特殊选项值
const GO_BACK = '__go_back__';
const EXIT = '__exit__';

/**
 * 获取节点图标
 */
function getResourceTypeName(type?: ResourceType): string {
  switch (type) {
    case 'template':
      return t('common.template');
    case 'doc':
      return t('common.document');
    default:
      return t('common.resource');
  }
}

function getNodeTypeLabel(node: WorkspaceTreeNode): string {
  if (node.type === 'folder') {
    return t('common.folder');
  }

  return getResourceTypeName(node.resourceType);
}

function isVisibleResourceNode(node: WorkspaceTreeNode): boolean {
  if (node.type === 'folder') {
    return true;
  }

  return node.resourceType === 'template' || node.resourceType === 'doc';
}

/**
 * 格式化时间
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 判断是否为本地空间
 */
function isLocalSpace(spaceId: string): boolean {
  return spaceId === LOCAL_SPACE_ID;
}

/**
 * 将本地资源转换为 WorkspaceTreeNode 格式
 */
function localResourceToNode(resource: LocalResource): WorkspaceTreeNode {
  return {
    id: `local-resource-${resource.id}`,
    name: resource.name,
    type: 'resource',
    hasChildren: false,
    resourceId: String(resource.id),
    resourceType: resource.type,
    sortOrder: 0,
  };
}

/**
 * 获取本地资源列表
 */
async function fetchLocalResources(): Promise<WorkspaceTreeNode[]> {
  const resources = await ResourcesDAO.getAll();
  return resources.map(localResourceToNode);
}

/**
 * 获取节点列表（支持本地空间和离线模式）
 */
async function fetchNodes(
  spaceId: string,
  spaceName: string,
  parentId: string | null,
  token: string,
  cache: ResourceCache,
  offline: boolean
): Promise<WorkspaceTreeNode[] | null> {
  // 本地空间：从 SQLite 读取
  if (isLocalSpace(spaceId)) {
    // 本地空间只有根目录，没有子目录
    if (parentId !== null) {
      return [];
    }
    return await fetchLocalResources();
  }

  // 离线模式：只从缓存读取
  if (offline) {
    const cached = cache.getChildren(parentId);
    if (cached) {
      return cached;
    }
    console.log(chalk.yellow(`\n${t('resList.offlineCacheMissing')}`));
    return null;
  }

  // 在线模式：从 API 获取
  const result = parentId
    ? await ResourceApi.getNodeChildren(spaceId, parentId, token)
    : await ResourceApi.getTree(spaceId, null, token);

  if (!result.success || !result.data) {
    console.log(chalk.red(`\n${t('resList.fetchListFailed', { error: result.error || t('common.unknownError') })}`));
    return null;
  }

  // 更新缓存
  cache.setChildren(parentId, result.data.items);
  cache.save();

  return result.data.items.filter(isVisibleResourceNode);
}

/**
 * 交互式导航循环
 */
async function navigateLoop(
  spaceId: string,
  spaceName: string,
  token: string,
  cache: ResourceCache,
  offline: boolean
): Promise<void> {
  // 导航栈：记录路径
  const pathStack: Array<{ id: string | null; name: string }> = [
    { id: null, name: spaceName },
  ];

  while (true) {
    const currentPath = pathStack[pathStack.length - 1];
    const parentId = currentPath.id;

    // 显示当前路径
    const breadcrumb = pathStack.map((p) => p.name).join(' / ');
    console.log();
    console.log(chalk.cyan(breadcrumb));

    if (offline) {
      const cacheTime = cache.getUpdatedAt();
      if (cacheTime > 0) {
        console.log(chalk.dim(t('common.offlineCacheAt', { time: formatTime(cacheTime) })));
      }
    }

    // 获取节点列表
    const nodes = await fetchNodes(spaceId, spaceName, parentId, token, cache, offline);
    if (!nodes) {
      break;
    }

    if (nodes.length === 0) {
      console.log(chalk.dim(`\n  ${t('common.rootDirectoryEmpty')}`));
    }

    // 构建选择列表
    const choices: Array<{ name: string; value: string }> = [];

    // 返回上级选项（非根目录时显示）
    if (pathStack.length > 1) {
      choices.push({
        name: chalk.dim(`[${t('common.back')}]`),
        value: GO_BACK,
      });
    }

    // 节点列表
    for (const node of nodes) {
      const typeName = chalk.dim(`[${getNodeTypeLabel(node)}]`);

      choices.push({
        name: `${typeName} ${node.name}`,
        value: node.id,
      });
    }

    // 退出选项
    choices.push({
      name: chalk.dim(`[${t('common.exit')}]`),
      value: EXIT,
    });

    // 交互式选择
    const { selected } = await inquirer.prompt([
      {
        type: 'select',
        name: 'selected',
        message: t('resList.choosePrompt'),
        choices,
        pageSize: 15,
      },
    ]);

    // 处理选择
    if (selected === EXIT) {
      console.log(chalk.dim(`\n${t('resList.exited')}\n`));
      break;
    }

    if (selected === GO_BACK) {
      pathStack.pop();
      continue;
    }

    // 查找选中的节点
    const selectedNode = nodes.find((n) => n.id === selected);
    if (!selectedNode) {
      continue;
    }

    // 处理节点
    if (selectedNode.type === 'folder') {
      // 进入目录
      pathStack.push({ id: selectedNode.id, name: selectedNode.name });
    } else {
      // 处理资源
      await handleResource(spaceId, selectedNode, token, offline);
    }
  }
}

/**
 * 处理资源操作
 */
async function handleResource(
  spaceId: string,
  node: WorkspaceTreeNode,
  token: string,
  offline: boolean
): Promise<void> {
  const resourceType = node.resourceType;
  const resourceId = node.resourceId;

  console.log();
  console.log(chalk.bold(`[${getNodeTypeLabel(node)}] ${node.name}`));
  console.log(chalk.dim(`   ${t('common.type')}: ${getResourceTypeName(resourceType)}`));
  console.log(chalk.dim(`   ${t('resList.pathLabel')}: ${node.name}`));

  if (!resourceId) {
    console.log(chalk.yellow(`\n⚠ ${t('resList.resourceIdNotFound')}`));
    return;
  }

  // 本地空间跳过 Pro 权限检查，直接处理
  // 云端空间需要 Pro 权限检查
  if (!isLocalSpace(spaceId)) {
    const guardResult = ProGuard.check('resource-operation');
    if (!guardResult.allowed) {
      return;
    }
  }

  switch (resourceType) {
    case 'template':
      await handleTemplate(spaceId, resourceId, node.name, token, offline);
      break;
    case 'doc':
      await handleDoc(spaceId, resourceId, node.name, token, offline);
      break;
    default:
      console.log(chalk.yellow(`\n⚠ ${t('resList.unsupportedType', { type: resourceType })}`));
  }
}

/**
 * 处理模板资源
 */
async function handleTemplate(
  spaceId: string,
  resourceId: string,
  name: string,
  token: string,
  offline: boolean
): Promise<void> {
  // 本地空间：从 SQLite 读取模板
  if (isLocalSpace(spaceId)) {
    await handleLocalTemplate(resourceId, name);
    return;
  }

  // 云端空间：从 API 获取
  await handleCloudTemplate(spaceId, resourceId, name, token, offline);
}

/**
 * 处理本地模板
 */
async function handleLocalTemplate(
  resourceId: string,
  name: string
): Promise<void> {
  // 从 SQLite 读取模板
  const templateId = parseInt(resourceId, 10);
  const template = await TemplatesDAO.getById(templateId);

  if (!template) {
    console.log(chalk.red(`\n${t('resList.templateMissing', { name })}`));
    return;
  }

  console.log(chalk.dim(`   ${t('common.description')}: ${template.description || t('common.none')}`));
  console.log(chalk.dim(`   ${t('common.repository')}: ${template.git_url}`));
  console.log(chalk.dim(`   ${t('common.branch')}: ${template.branch}`));

  // 确认执行
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: t('resList.templateUseConfirm'),
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.dim(`\n${t('resList.cancelled')}`));
    return;
  }

  // 获取目标路径
  const { targetPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'targetPath',
      message: t('resList.enterProjectPath'),
      default: `./${name.toLowerCase().replace(/\s+/g, '-')}`,
    },
  ]);

  // 本地空间固定使用 BasicProcessor
  const processor = new BasicProcessor();

  console.log(chalk.cyan(`\n${t('resList.creatingFromTemplate')}`));

  try {
    const result = await processor.clone({
      template,
      targetPath,
      skipGitHistory: true,
    });

    if (!result.success) {
      console.log(chalk.red(`\n${t('resList.projectCreateFailed', { error: result.error || t('common.unknownError') })}`));
      return;
    }

    // 更新克隆计数
    await TemplatesDAO.incrementCloneCount(template.name);

    console.log(chalk.green(`\n${t('resList.projectCreated', { dir: targetPath })}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common.unknownError');
    console.log(chalk.red(`\n${t('resList.projectCreateFailed', { error: message })}`));
  }
}

/**
 * 处理云端模板
 */
async function handleCloudTemplate(
  spaceId: string,
  resourceId: string,
  name: string,
  token: string,
  offline: boolean
): Promise<void> {
  if (offline) {
    console.log(chalk.yellow(`\n${t('resList.offlineTemplateUnavailable')}`));
    console.log(chalk.dim(t('resList.retryOnline')));
    return;
  }

  // 获取资源详情
  const result = await ResourceApi.getResourceDetail(spaceId, resourceId, token);
  if (!result.success || !result.data) {
    console.log(chalk.red(`\n${t('resList.templateDetailFailed', { error: result.error || t('common.unknownError') })}`));
    return;
  }

  const resource = result.data;
  const template = resource.template;

  console.log(chalk.dim(`   ${t('common.description')}: ${resource.description || t('common.none')}`));
  if (template?.definition?.source?.type === 'git' && template.definition.source.git) {
    console.log(chalk.dim(`   ${t('common.repository')}: ${template.definition.source.git.repo}`));
    console.log(chalk.dim(`   ${t('common.branch')}: ${template.definition.source.git.branch || 'main'}`));
  }

  // 确认执行
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: t('resList.templateUseConfirm'),
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.dim(`\n${t('resList.cancelled')}`));
    return;
  }

  // 获取目标路径
  const { targetPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'targetPath',
      message: t('resList.enterProjectPath'),
      default: `./${name.toLowerCase().replace(/\s+/g, '-')}`,
    },
  ]);

  // 获取处理器
  const processor = await ProcessorFactory.getProcessor();

  // 检查是否使用新生成器
  if (processor.getType() === 'pro') {
    const proProcessor = processor as ProProcessor;
    if (proProcessor.supportsNewGenerator(resource)) {
      console.log(chalk.cyan(`\n${t('resList.proGeneratorCreating')}`));
      const genResult = await proProcessor.generateFromCloud(resource, targetPath, {
        interactive: true,
        onProgress: (p) => console.log(chalk.dim(`   [${p.stage}] ${p.message}`)),
      });

      if (genResult.success) {
        console.log(chalk.green(`\n${t('resList.projectCreated', { dir: genResult.targetDir })}`));
        if (genResult.filesWritten?.length) {
          console.log(chalk.dim(t('resList.projectCreatedFiles', { count: genResult.filesWritten.length })));
        }
      } else {
        console.log(chalk.red(`\n${t('resList.projectCreateFailed', { error: genResult.error || t('common.unknownError') })}`));
      }
      return;
    }
  }

  console.log(chalk.yellow(`\n${t('resList.cloudTemplateRequiresProGenerator')}`));
  console.log(chalk.dim(t('resList.cloudTemplateRequiresProGeneratorHint')));
}

/**
 * 处理文档资源
 */
async function handleDoc(
  spaceId: string,
  resourceId: string,
  name: string,
  token: string,
  offline: boolean
): Promise<void> {
  if (isLocalSpace(spaceId)) {
    await handleLocalDoc(resourceId, name);
    return;
  }

  if (offline) {
    console.log(chalk.yellow(`\n${t('resList.docOffline')}`));
    console.log(chalk.dim(t('resList.retryOnline')));
    return;
  }

  // 获取资源详情
  const result = await ResourceApi.getResourceDetail(spaceId, resourceId, token);
  if (!result.success || !result.data) {
    console.log(chalk.red(`\n${t('resList.docDetailFailed', { error: result.error || t('common.unknownError') })}`));
    return;
  }

  const resource = result.data;
  const doc = resource.doc;

  console.log(chalk.dim(`   ${t('common.description')}: ${resource.description || t('common.none')}`));
  if (doc?.wordCount) {
    console.log(chalk.dim(`   ${t('common.wordCount')}: ${doc.wordCount}`));
  }

  console.log();
  console.log(chalk.bold('─'.repeat(50)));
  console.log();

  // 输出文档内容
  if (doc?.content) {
    console.log(doc.content);
  } else {
    console.log(chalk.dim(t('resList.docEmpty')));
  }

  console.log();
  console.log(chalk.bold('─'.repeat(50)));
}

/**
 * 处理本地文档
 */
async function handleLocalDoc(
  resourceId: string,
  name: string
): Promise<void> {
  const docId = Number.parseInt(resourceId, 10);
  const doc = await ResourcesDAO.getDocById(docId);

  if (!doc) {
    console.log(chalk.red(`\n${t('resList.docMissing', { name })}`));
    return;
  }

  printDocPreview(doc);

  const { viewFull } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'viewFull',
      message: t('res.doc.viewFullConfirm'),
      default: false,
    },
  ]);

  if (!viewFull) {
    console.log(chalk.dim(`\n${t('resList.cancelled')}`));
    return;
  }

  console.log();
  console.log(chalk.bold('─'.repeat(50)));
  console.log();
  console.log(doc.content || t('resList.docEmpty'));
  console.log();
  console.log(chalk.bold('─'.repeat(50)));
}

/**
 * list 命令
 */
export const listCommand = new Command('list')
  .alias('ls')
  .description(t('resList.description'))
  .option('--offline', t('resList.offlineOption'))
  .action(async (options: { offline?: boolean }) => {
    let offline = options.offline || false;

    // 检查当前空间
    let currentSpace = SpaceManager.getCurrentSpace();

    // 未选择空间时，默认使用本地空间
    if (!currentSpace) {
      console.log(chalk.yellow(`\n${t('resList.noSpaceSelected')}`));
      console.log(chalk.dim(`${t('resList.switchSpaceHint')}\n`));

      // 自动切换到本地空间
      SpaceManager.switchSpace(LOCAL_SPACE_ID);
      currentSpace = SpaceManager.getCurrentSpace();
    }

    if (!currentSpace) {
      console.log(chalk.red(`\n${t('resList.spaceInfoUnavailable')}\n`));
      return;
    }

    const spaceId = currentSpace.spaceId;
    const spaceName = currentSpace.spaceName;

    // 本地空间不需要 Token
    let token = '';
    if (!isLocalSpace(spaceId) && !offline) {
      // 云端空间需要登录
      if (!isLoggedIn()) {
        console.log(chalk.yellow(`\n${t('resList.notLoggedInCloud')}`));
        console.log(chalk.dim(t('resList.loginHint')));
        console.log(chalk.dim(`${t('resList.localSpaceHint')}\n`));
        return;
      }

      try {
        const validToken = await TokenStore.getValidToken();
        if (!validToken) {
          console.log(chalk.yellow(`\n${t('resList.invalidTokenFallback')}`));
          offline = true;
        } else {
          token = validToken;
        }
      } catch {
        console.log(chalk.yellow(`\n${t('resList.getTokenFallback')}`));
        offline = true;
      }
    }

    // 加载或创建缓存（本地空间不需要缓存）
    let cache = ResourceCache.load(spaceId);
    if (!cache) {
      cache = new ResourceCache(spaceId, spaceName);
    }

    // 云端空间离线模式检查缓存
    if (!isLocalSpace(spaceId) && offline && !cache.hasChildren(null)) {
      console.log(chalk.yellow(`\n${t('resList.offlineNoCache')}`));
      console.log(chalk.dim(`${t('resList.cacheWarmupHint')}\n`));
      return;
    }

    // 开始导航
    await navigateLoop(spaceId, spaceName, token, cache, offline);
  });
