import { Command } from 'commander';
import { getMCPContext } from '../mcp/context.js';
import { listMcpResources } from '../mcp/resources/index.js';
import { LocalResourceRepository } from '../resources/local-repository.js';
import { CloudResourceRepository } from '../resources/cloud-repository.js';
import { TokenStore } from '../auth/token-store.js';
import { LicenseStore } from '../license/license-store.js';
import { LOCAL_SPACE_ID } from '../shared/constants.js';

interface DebugReport {
  generatedAt: string;
  mode: 'current-space' | 'all-spaces';
  context: {
    currentSpaceId: string;
    currentSpaceName: string;
    isLoggedIn: boolean;
    isLocalSpace: boolean;
  };
  templates: Array<{
    name: string;
    id: string;
    source: 'local' | 'cloud';
    spaceId: string;
  }>;
  resources: Array<{
    uri: string;
    name: string;
  }>;
  warnings: string[];
}

async function buildReport(allSpaces: boolean): Promise<DebugReport> {
  const context = await getMCPContext();
  const warnings: string[] = [];
  const templates: DebugReport['templates'] = [];
  const resources: DebugReport['resources'] = [];

  try {
    const mcpResources = await listMcpResources(context.spaceId);
    resources.push(...mcpResources.resources);
  } catch (e) {
    warnings.push(`Failed to list resources: ${String(e)}`);
  }

  if (context.isLocalSpace) {
    const localRepo = new LocalResourceRepository();
    const items = await localRepo.list({ type: 'template' });
    templates.push(...items.map((t) => ({ name: t.name, id: t.id, source: 'local' as const, spaceId: LOCAL_SPACE_ID })));
  } else {
    const cloudRepo = new CloudResourceRepository();
    try {
      const result = await cloudRepo.list({ spaceId: context.spaceId, type: 'template' });
      templates.push(...result.items.map((t) => ({ name: t.name, id: t.id, source: 'cloud' as const, spaceId: context.spaceId })));
    } catch (e) {
      warnings.push(`Failed to list cloud templates: ${String(e)}`);
    }
  }

  if (allSpaces && !context.isLocalSpace) {
    const token = await TokenStore.getValidToken();
    if (token) {
      const license = await LicenseStore.getOrRefresh(false);
      if (license) {
        for (const space of license.data.spaces) {
          if (space.id === context.spaceId) continue;
          try {
            const cloudRepo = new CloudResourceRepository();
            const result = await cloudRepo.list({ spaceId: space.id, type: 'template' });
            templates.push(...result.items.map((t) => ({ name: t.name, id: t.id, source: 'cloud' as const, spaceId: space.id })));
          } catch (e) {
            warnings.push(`Failed to scan space ${space.name}: ${String(e)}`);
          }
        }
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: allSpaces ? 'all-spaces' : 'current-space',
    context: {
      currentSpaceId: context.spaceId,
      currentSpaceName: context.spaceName,
      isLoggedIn: context.isLoggedIn,
      isLocalSpace: context.isLocalSpace,
    },
    templates,
    resources,
    warnings,
  };
}

export function createMcpDebugResourcesCommand(): Command {
  return new Command('mcp-debug-resources')
    .description('Debug MCP-visible templates and doc resources')
    .option('--all-spaces', 'Scan all available spaces instead of only the current MCP context')
    .option('--json', 'Output JSON report')
    .action(async (options: { allSpaces?: boolean; json?: boolean }) => {
      const report = await buildReport(Boolean(options.allSpaces));
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }
      console.log('=== MCP Debug Resources ===');
      console.log(`Generated At: ${report.generatedAt}`);
      console.log(`Mode: ${report.mode}`);
      console.log(`Current Space: ${report.context.currentSpaceName} (${report.context.currentSpaceId})`);
      console.log(`Logged In: ${report.context.isLoggedIn ? 'yes' : 'no'}`);
      console.log('');
      console.log('Templates');
      console.log(`- Total: ${report.templates.length}`);
      for (const item of report.templates) {
        console.log(`  - [${item.source}] ${item.name} | id=${item.id} | space=${item.spaceId}`);
      }
      console.log('');
      console.log('MCP Resources');
      console.log(`- Total: ${report.resources.length}`);
      for (const item of report.resources) {
        console.log(`  - ${item.uri} | ${item.name}`);
      }
      if (report.warnings.length > 0) {
        console.log('');
        console.log('Warnings');
        for (const warning of report.warnings) {
          console.log(`  - ${warning}`);
        }
      }
    });
}
