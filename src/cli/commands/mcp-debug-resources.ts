import { Command } from 'commander';
import { SpaceManager } from '../../license/index.js';
import { TokenStore, isLoggedIn } from '../../auth/index.js';
import { getMCPContext, mapMCPError, supportsCloudResources } from '../../mcp/context.js';
import { listDocResources } from '../../mcp/resources/index.js';
import { TemplatesDAO } from '../../db/dao/templates.dao.js';
import { searchCloudTemplates } from '../../mcp/tools/templates/cloud-template-utils.js';
import { LOCAL_SPACE_ID } from '../../shared/constants.js';
import { parseJSON } from '../../shared/utils.js';
import { t } from '../../i18n/index.js';
import type { MCPResource } from '../../mcp/resources/index.js';
import type { MCPToolResponse, SpaceInfo } from '../../shared/types.js';

interface DebugTemplateItem {
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  source: 'local' | 'cloud';
  spaceId: string;
  spaceName: string;
  resourceId: string;
}

interface DebugWarning {
  code: string;
  message: string;
  suggestion?: string;
  category?: NonNullable<MCPToolResponse['error']>['category'];
  retryable?: boolean;
  metadata?: Record<string, any>;
}

interface SpaceScanResult {
  spaceId: string;
  spaceName: string;
  isLocalSpace: boolean;
  templates: DebugTemplateItem[];
  resources: MCPResource[];
  warnings: DebugWarning[];
}

interface DebugResourcesReport {
  generatedAt: string;
  mode: 'current-space' | 'all-spaces';
  context: {
    currentSpaceId: string;
    currentSpaceName: string;
    isLoggedIn: boolean;
    isLocalSpace: boolean;
    supportsCloudResources: boolean;
    availableSpaceCount: number;
  };
  spacesScanned: Array<{
    spaceId: string;
    spaceName: string;
    isLocalSpace: boolean;
  }>;
  templates: {
    total: number;
    dedupedTotal: number;
    items: DebugTemplateItem[];
    dedupedItems: DebugTemplateItem[];
  };
  resources: {
    total: number;
    items: MCPResource[];
  };
  warnings: DebugWarning[];
  perSpace: SpaceScanResult[];
}

function toDebugWarning(
  mapped: MCPToolResponse['error'],
  metadata?: Record<string, any>
): DebugWarning {
  return {
    code: mapped?.code || 'UNKNOWN_DEBUG_WARNING',
    message: mapped?.message || 'Unknown debug warning',
    suggestion: mapped?.suggestion,
    category: mapped?.category,
    retryable: mapped?.retryable,
    metadata,
  };
}

async function collectLocalTemplates(): Promise<DebugTemplateItem[]> {
  return (await TemplatesDAO.getAll()).map((template) => ({
    name: template.name,
    description: template.description,
    category: template.category,
    tags: parseJSON<string[]>(template.tags) || [],
    source: 'local',
    spaceId: LOCAL_SPACE_ID,
    spaceName: 'Local Space',
    resourceId: String(template.id),
  }));
}

async function collectCloudTemplates(space: SpaceInfo, token: string): Promise<DebugTemplateItem[]> {
  const templates = await searchCloudTemplates({
    spaceId: space.id,
    accessToken: token,
  }, '', 200);

  return templates.map((template) => ({
    name: template.name,
    description: template.description ?? null,
    category: null,
    tags: template.tags || [],
    source: 'cloud',
    spaceId: template.spaceId,
    spaceName: template.spaceName || space.name,
    resourceId: template.id,
  }));
}

function dedupeTemplates(items: DebugTemplateItem[]): DebugTemplateItem[] {
  const merged = new Map<string, DebugTemplateItem>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }
  return Array.from(merged.values());
}

async function collectCurrentSpaceResources(): Promise<{ resources: MCPResource[]; warnings: DebugWarning[] }> {
  const result = await listDocResources();
  return {
    resources: result.resources,
    warnings: result.warnings,
  };
}

async function collectSpaceScan(space: SpaceInfo, validToken: string | null): Promise<SpaceScanResult> {
  const warnings: DebugWarning[] = [];
  let templates: DebugTemplateItem[] = [];
  let resources: MCPResource[] = [];

  if (space.id === LOCAL_SPACE_ID) {
    templates = await collectLocalTemplates();
    const docResult = await collectCurrentSpaceResources();
    resources = docResult.resources.filter((item) =>
      item.uri.includes('/local/') || item.uri.endsWith('/catalog') || item.uri.endsWith('/guide')
    );
    warnings.push(...docResult.warnings);
    return {
      spaceId: space.id,
      spaceName: space.name,
      isLocalSpace: true,
      templates,
      resources,
      warnings,
    };
  }

  if (!validToken) {
    warnings.push({
      code: 'AUTH_TOKEN_UNAVAILABLE',
      message: t('mcp.debug.authTokenUnavailable'),
      suggestion: t('mcp.debug.loginRetrySuggestion'),
      category: 'auth',
      retryable: false,
      metadata: { spaceId: space.id, phase: 'collect-cloud-space' },
    });
    return {
      spaceId: space.id,
      spaceName: space.name,
      isLocalSpace: false,
      templates,
      resources,
      warnings,
    };
  }

  try {
    templates = await collectCloudTemplates(space, validToken);
  } catch (error) {
    warnings.push(toDebugWarning(
      mapMCPError(error, {
        code: 'DEBUG_CLOUD_TEMPLATE_LIST_FAILED',
        message: t('mcp.debug.cloudTemplateScanFailed'),
        suggestion: t('mcp.debug.scanRetrySuggestion'),
        category: 'system',
        retryable: true,
      }),
      { spaceId: space.id, phase: 'collect-cloud-templates' }
    ));
  }

  try {
    const current = SpaceManager.getCurrentSpace();
    SpaceManager.saveCurrentSpace(space);
    const docResult = await collectCurrentSpaceResources();
    resources = docResult.resources.filter((item) =>
      item.uri.includes(`/cloud/${encodeURIComponent(space.id)}/`) ||
      item.uri.endsWith('/catalog') ||
      item.uri.endsWith('/guide')
    );
    warnings.push(...docResult.warnings.map((warning) => ({
      ...warning,
      metadata: {
        ...warning.metadata,
        spaceId: space.id,
        phase: 'collect-cloud-doc-resources',
      },
    })));
    if (current) {
      const original = SpaceManager.findSpaceById(current.spaceId);
      if (original) {
        SpaceManager.saveCurrentSpace(original);
      }
    } else {
      SpaceManager.clearCurrentSpace();
    }
  } catch (error) {
    warnings.push(toDebugWarning(
      mapMCPError(error, {
        code: 'DEBUG_CLOUD_DOC_RESOURCE_LIST_FAILED',
        message: t('mcp.debug.cloudDocScanFailed'),
        suggestion: t('mcp.debug.scanRetrySuggestion'),
        category: 'system',
        retryable: true,
      }),
      { spaceId: space.id, phase: 'collect-cloud-doc-resources' }
    ));
  }

  return {
    spaceId: space.id,
    spaceName: space.name,
    isLocalSpace: false,
    templates,
    resources,
    warnings,
  };
}

async function buildDebugResourcesReport(allSpaces: boolean): Promise<DebugResourcesReport> {
  const context = getMCPContext();
  const availableSpaces = SpaceManager.getAvailableSpaces();
  const spacesToScan = allSpaces
    ? availableSpaces
    : availableSpaces.filter((space) => space.id === context.spaceId || (context.isLocalSpace && space.id === LOCAL_SPACE_ID));

  let validToken: string | null = null;
  const warnings: DebugWarning[] = [];

  if (isLoggedIn()) {
    try {
      validToken = await TokenStore.getValidToken();
      if (!validToken && availableSpaces.some((space) => space.id !== LOCAL_SPACE_ID)) {
        warnings.push({
          code: 'AUTH_TOKEN_UNAVAILABLE',
          message: t('mcp.debug.loggedInButTokenMissing'),
          suggestion: t('mcp.debug.loginRetrySuggestion'),
          category: 'auth',
          retryable: false,
        });
      }
    } catch (error) {
      warnings.push(toDebugWarning(
        mapMCPError(error, {
          code: 'DEBUG_TOKEN_PREPARE_FAILED',
          message: t('mcp.debug.tokenPrepareFailed'),
          suggestion: t('mcp.debug.loginRetrySuggestion'),
          category: 'auth',
          retryable: false,
        }),
        { phase: 'prepare-debug-token' }
      ));
    }
  }

  const perSpace: SpaceScanResult[] = [];
  for (const space of spacesToScan) {
    perSpace.push(await collectSpaceScan(space, validToken));
  }

  const allTemplateItems = perSpace.flatMap((item) => item.templates);
  const allResources = perSpace.flatMap((item) => item.resources);
  const allWarnings = warnings.concat(perSpace.flatMap((item) => item.warnings));

  return {
    generatedAt: new Date().toISOString(),
    mode: allSpaces ? 'all-spaces' : 'current-space',
    context: {
      currentSpaceId: context.spaceId,
      currentSpaceName: context.spaceName,
      isLoggedIn: context.isLoggedIn,
      isLocalSpace: context.isLocalSpace,
      supportsCloudResources: supportsCloudResources(context),
      availableSpaceCount: availableSpaces.length,
    },
    spacesScanned: spacesToScan.map((space) => ({
      spaceId: space.id,
      spaceName: space.name,
      isLocalSpace: space.id === LOCAL_SPACE_ID,
    })),
    templates: {
      total: allTemplateItems.length,
      dedupedTotal: dedupeTemplates(allTemplateItems).length,
      items: allTemplateItems,
      dedupedItems: dedupeTemplates(allTemplateItems),
    },
    resources: {
      total: allResources.length,
      items: allResources,
    },
    warnings: allWarnings,
    perSpace,
  };
}

function printHumanReadableReport(report: DebugResourcesReport): void {
  console.log('=== MCP Debug Resources ===');
  console.log(`Generated At: ${report.generatedAt}`);
  console.log(`Mode: ${report.mode}`);
  console.log(`Current Space: ${report.context.currentSpaceName} (${report.context.currentSpaceId})`);
  console.log(`Logged In: ${report.context.isLoggedIn ? 'yes' : 'no'}`);
  console.log(`Cloud Supported In Current Context: ${report.context.supportsCloudResources ? 'yes' : 'no'}`);
  console.log(`Spaces Scanned: ${report.spacesScanned.length}`);
  console.log('');

  console.log('Templates');
  console.log(`- Total: ${report.templates.total}`);
  console.log(`- Deduped Total: ${report.templates.dedupedTotal}`);
  for (const item of report.templates.items) {
    console.log(`  - [${item.source}] ${item.name} | space=${item.spaceName} | resourceId=${item.resourceId}`);
  }
  console.log('');

  console.log('MCP Doc Resources');
  console.log(`- Total: ${report.resources.total}`);
  for (const item of report.resources.items) {
    console.log(`  - ${item.uri} | ${item.name}`);
  }
  console.log('');

  if (report.warnings.length > 0) {
    console.log('Warnings');
    for (const warning of report.warnings) {
      console.log(`  - [${warning.code}] ${warning.message}`);
    }
    console.log('');
  }

  console.log('Per Space Summary');
  for (const item of report.perSpace) {
    console.log(`  - ${item.spaceName} (${item.spaceId}) | templates=${item.templates.length} | resources=${item.resources.length} | warnings=${item.warnings.length}`);
  }
}

export const mcpDebugResourcesCommand = new Command('mcp-debug-resources')
  .description('Debug MCP-visible templates and doc resources')
  .option('--all-spaces', 'Scan all available spaces instead of only the current MCP context')
  .option('--json', 'Output JSON report')
  .action(async (options: { allSpaces?: boolean; json?: boolean }) => {
    const report = await buildDebugResourcesReport(Boolean(options.allSpaces));

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    printHumanReadableReport(report);
    console.log('');
    console.log(`Hint: use --json for structured output.`);
    console.log(`Hint: use --all-spaces to inspect cross-space visibility.`);
  });
