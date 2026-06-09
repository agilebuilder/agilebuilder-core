import { AppError } from '../../errors/app-error.js';
import { LOCAL_SPACE_ID } from '../../shared/constants.js';
import { LocalResourceRepository } from '../../resources/local-repository.js';
import { CloudResourceRepository } from '../../resources/cloud-repository.js';

const localRepository = new LocalResourceRepository();
const cloudRepository = new CloudResourceRepository();

export const USAGE_GUIDE_URI = 'agilebuilder://docs/usage';
export const AGENT_POLICY_URI = 'agilebuilder://usage/agent-policy';
export const DOCS_CATALOG_URI = 'agilebuilder://docs/catalog';
export const LOCAL_DOC_PREFIX = 'agilebuilder://local/docs/';
export const CLOUD_DOC_PREFIX = 'agilebuilder://cloud/docs/';

function usageGuideText(): string {
  return [
    '# AgileBuilder Core1',
    '',
    'Available MCP tools:',
    '',
    '- `list_resources`: list resources in the current workspace.',
    '- `search_resources`: search resources by keyword.',
    '- `get_resource`: read one resource by ID.',
    '- `create_project`: create a project from a resource ID or Git URL.',
    '',
    'Resources default to the currently selected AgileBuilder workspace.',
  ].join('\n');
}

async function buildDocsCatalog(spaceId: string): Promise<string> {
  const lines = ['# Docs Catalog', ''];
  if (spaceId === LOCAL_SPACE_ID) {
    const docs = await localRepository.list({ type: 'doc' });
    if (docs.length === 0) {
      lines.push('No local documents found.');
    } else {
      for (const doc of docs) {
        lines.push(`- **${doc.name}** (id: \`${doc.id}\`)`);
      }
    }
  } else {
    const result = await cloudRepository.list({ spaceId, type: 'doc' });
    if (result.items.length === 0) {
      lines.push('No cloud documents found in current workspace.');
    } else {
      for (const doc of result.items) {
        lines.push(`- **${doc.name}** (id: \`${doc.id}\`)`);
      }
    }
  }
  return lines.join('\n');
}

function agentPolicyText(): string {
  return [
    '# Agent Policy',
    '',
    'When using AgileBuilder MCP tools, the AI agent must:',
    '',
    '1. Respect workspace boundaries and user permissions.',
    '2. Only execute template hooks when explicitly allowed.',
    '3. Validate all user inputs before passing to tools.',
    '4. Prefer cloud resources when a cloud workspace is active.',
    '5. Ask for confirmation before overwriting existing directories.',
  ].join('\n');
}

export async function listMcpResources(spaceId: string) {
  const resources = [
    {
      uri: USAGE_GUIDE_URI,
      name: 'AgileBuilder Core1 Usage Guide',
      mimeType: 'text/markdown',
    },
    {
      uri: AGENT_POLICY_URI,
      name: 'AgileBuilder Agent Policy',
      mimeType: 'text/markdown',
    },
    {
      uri: DOCS_CATALOG_URI,
      name: 'AgileBuilder Docs Catalog',
      mimeType: 'text/markdown',
    },
  ];

  if (spaceId === LOCAL_SPACE_ID) {
    const docs = await localRepository.list({ type: 'doc' });
    resources.push(...docs.map((doc) => ({
      uri: `${LOCAL_DOC_PREFIX}${encodeURIComponent(doc.id)}`,
      name: doc.name,
      mimeType: doc.type === 'doc' && doc.format === 'markdown' ? 'text/markdown' : 'text/plain',
    })));
    return { resources };
  }

  const cloudDocs = await cloudRepository.list({ spaceId, type: 'doc' });
  resources.push(...cloudDocs.items.map((doc) => ({
    uri: `${CLOUD_DOC_PREFIX}${encodeURIComponent(doc.id)}`,
    name: doc.name,
    mimeType: 'text/markdown',
  })));
  return { resources };
}

export async function readMcpResource(uri: string, spaceId: string) {
  if (uri === USAGE_GUIDE_URI) {
    return {
      contents: [{ uri, mimeType: 'text/markdown', text: usageGuideText() }],
    };
  }

  if (uri === AGENT_POLICY_URI) {
    return {
      contents: [{ uri, mimeType: 'text/markdown', text: agentPolicyText() }],
    };
  }

  if (uri === DOCS_CATALOG_URI) {
    return {
      contents: [{ uri, mimeType: 'text/markdown', text: await buildDocsCatalog(spaceId) }],
    };
  }

  if (uri.startsWith(LOCAL_DOC_PREFIX)) {
    const id = decodeURIComponent(uri.slice(LOCAL_DOC_PREFIX.length));
    const resource = await localRepository.require(id);
    if (resource.type !== 'doc') {
      throw new AppError({ code: 'RESOURCE_NOT_DOC', message: `Resource ${id} is not a document.`, category: 'validation' });
    }
    return {
      contents: [{ uri, mimeType: resource.format === 'markdown' ? 'text/markdown' : 'text/plain', text: resource.content }],
    };
  }

  if (uri.startsWith(CLOUD_DOC_PREFIX)) {
    if (spaceId === LOCAL_SPACE_ID) {
      throw new AppError({ code: 'CLOUD_WORKSPACE_REQUIRED', message: 'Select a cloud workspace to read cloud docs.', category: 'validation' });
    }
    const id = decodeURIComponent(uri.slice(CLOUD_DOC_PREFIX.length));
    const resource = await cloudRepository.get(spaceId, id);
    if (resource.type !== 'doc') {
      throw new AppError({ code: 'RESOURCE_NOT_DOC', message: `Resource ${id} is not a document.`, category: 'validation' });
    }
    return {
      contents: [{
        uri,
        mimeType: resource.doc?.format === 'text' ? 'text/plain' : 'text/markdown',
        text: resource.doc?.content || '',
      }],
    };
  }

  throw new AppError({ code: 'RESOURCE_URI_UNSUPPORTED', message: `Unsupported resource URI: ${uri}`, category: 'validation' });
}
