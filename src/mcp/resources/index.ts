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
    '# AgileBuilder Agent Guide',
    '',
    'AgileBuilder generates projects from controlled, workspace-registered templates and gives you access to team guideline documents. It is not a general code generator. When the user asks you to create a project, your job is to find the right template in the workspace, collect its variables, and call create_project — not to hand-write scaffolding.',
    '',
    '## Workspace model',
    '',
    '- Resources live in the currently selected AgileBuilder workspace. All tools operate on that workspace only.',
    '- The built-in `local` workspace stores templates and docs on this machine and works without login.',
    '- Cloud workspaces require the user to be logged in (`ag login` in their terminal). Cloud write operations additionally require a Pro or Trial plan.',
    '- Workspaces are isolated: a local workspace cannot read cloud resources (CLOUD_WORKSPACE_REQUIRED), and cross-space template lookup is denied by workspace policy (CLOUD_RESOURCE_CROSS_SPACE_DISABLED).',
    '- To switch workspaces, the user runs `ag space use <id>` in their terminal; you cannot switch workspaces through these tools.',
    '',
    '## Standard workflow',
    '',
    '1. list_resources to see the full resource set (workspaces are usually small) and pick the matching template by meaning — do not rely on keywords alone.',
    '2. get_resource on the template to read its description and variable list (name, type, required, default).',
    '3. Confirm variable values and the target directory with the user.',
    '4. create_project with the confirmed inputs.',
    '5. Report the result: files written, templateCommit (the exact template version used), and hooks executed/skipped.',
    '',
    '## Tools',
    '',
    '### list_resources',
    '- When: discovering what the team has registered — this is the preferred discovery tool. Workspaces are usually small, so review the full set and judge matches by meaning (names, descriptions, tags), not by keyword.',
    '- Params: optional `type` ("template" | "doc").',
    '- Returns: `{ ok: true, data: { workspaceId, items, total } }`.',
    '',
    '### search_resources',
    '- When: narrowing down a large workspace, or as a quick probe. Matching is plain case-insensitive substring over name, description, tags, source URL, and doc content — it has NO semantic understanding, so a "backend" request will not match a "java-api" template unless its metadata says so.',
    '- Params: optional `keyword`, optional `type`. Without `keyword` it behaves exactly like list_resources. If you search, try several keyword variants (backend, server, java, spring, ...). If it returns nothing, fall back to list_resources and evaluate the full set yourself before concluding there is no match.',
    '- Returns: same shape as list_resources.',
    '',
    '### get_resource',
    '- When: after picking a candidate, before create_project. Always call this to learn the template variable list.',
    '- Params: `resourceId` (required) from list/search results.',
    '- Returns: the full resource. For templates: gitUrl, branch, subdir, and `variables` (array of { name, type, message, required, default, choices }) when available. For docs: the full text content.',
    '',
    '### create_project',
    '- When: only after steps 1-3 are done and the user confirmed variables and targetPath.',
    '- Params: `targetPath` (required); `resourceId` (preferred) or `gitUrl`; optional `branch`, `subdir`, `variables`, `overwrite`, `keepGit`, `allowHooks`.',
    '- `variables` keys come from the template variable list returned by get_resource. Missing required variables fail with TEMPLATE_VARS_MISSING.',
    '- `overwrite` defaults to false: a non-empty targetPath fails with TARGET_NOT_EMPTY.',
    '- `allowHooks` defaults to false: template hooks (arbitrary shell scripts) are skipped unless the user explicitly asked for them.',
    '- Returns: `{ ok: true, data: { success, targetDir, filesWritten, filesSkipped, variables, templateCommit, hooksExecuted, hooksSkipped, warnings } }`.',
    '',
    '## Error handling',
    '',
    'On failure the tool result has `isError: true` and a JSON body `{ ok: false, error: { code, message, suggestion, category } }`. Always read error.code and error.suggestion before acting. Common codes:',
    '',
    '| code | meaning | what to do |',
    '| --- | --- | --- |',
    '| TEMPLATE_VARS_MISSING | required template variables were not provided | call get_resource for the variable list, ask the user for values, retry with variables |',
    '| TARGET_NOT_EMPTY | targetPath is not empty and overwrite was false | confirm with the user, then retry with overwrite: true |',
    '| UNSAFE_TARGET_DIR / TARGET_NOT_WRITABLE | targetPath is a system directory, drive root, or not a directory | pick a different targetPath with the user |',
    '| RESOURCE_NOT_FOUND | no resource with that ID in the current workspace | re-run list_resources/search_resources and pick a valid ID |',
    '| CREATE_REQUIRES_TEMPLATE | the resource is a doc, not a template | choose a template resource |',
    '| AUTH_TOKEN_UNAVAILABLE | cloud operation without login | ask the user to run `ag login` in their terminal |',
    '| CLOUD_WORKSPACE_REQUIRED | local workspace cannot access cloud resources | ask the user to log in and select the cloud workspace |',
    '| CLOUD_RESOURCE_CROSS_SPACE_DISABLED | template lives in another workspace | use a template from the current workspace |',
    '| PRO_ACCESS_REQUIRED | cloud write needs a Pro/Trial plan | ask the user to upgrade, or use the local workspace |',
    '| HOOK_FAILED / HOOK_TYPE_UNSUPPORTED / HOOK_TIMEOUT | a template hook failed | report to the user; regenerating without allowHooks skips hooks |',
    '',
    '## Docs',
    '',
    'Doc resources are team guideline documents exposed as MCP resources (see agilebuilder://docs/catalog). Read them before generating code inside a project so your output follows team conventions. Docs may be written in the team\'s native language — that is intentional; read them as-is.',
  ].join('\n');
}

async function buildDocsCatalog(spaceId: string): Promise<string> {
  const lines = ['# Resource Catalog', ''];
  if (spaceId === LOCAL_SPACE_ID) {
    const docs = await localRepository.list({ type: 'doc' });
    const templates = await localRepository.list({ type: 'template' });
    lines.push('## Docs', '');
    if (docs.length === 0) {
      lines.push('No local documents found.');
    } else {
      for (const doc of docs) {
        lines.push(`- **${doc.name}** (id: \`${doc.id}\`)${doc.description ? ` — ${doc.description}` : ''}`);
      }
    }
    lines.push('', '## Templates', '');
    if (templates.length === 0) {
      lines.push('No local templates found.');
    } else {
      for (const template of templates) {
        if (template.type !== 'template') continue;
        const variables = template.variables ? `, variables: ${template.variables.length}` : '';
        lines.push(`- **${template.name}** (id: \`${template.id}\`${variables}) — ${template.gitUrl}#${template.branch}${template.description ? ` — ${template.description}` : ''}`);
      }
    }
    return lines.join('\n');
  }

  const docs = await cloudRepository.list({ spaceId, type: 'doc' });
  const templates = await cloudRepository.list({ spaceId, type: 'template' });
  lines.push('## Docs', '');
  if (docs.items.length === 0) {
    lines.push('No cloud documents found in current workspace.');
  } else {
    for (const doc of docs.items) {
      lines.push(`- **${doc.name}** (id: \`${doc.id}\`)${doc.description ? ` — ${doc.description}` : ''}`);
    }
  }
  lines.push('', '## Templates', '');
  if (templates.items.length === 0) {
    lines.push('No cloud templates found in current workspace.');
  } else {
    for (const template of templates.items) {
      lines.push(`- **${template.name}** (id: \`${template.id}\`)${template.description ? ` — ${template.description}` : ''}`);
    }
  }
  return lines.join('\n');
}

function agentPolicyText(): string {
  return [
    '# AgileBuilder Agent Policy',
    '',
    'These rules are binding when you use the AgileBuilder MCP tools. Each rule names the tool parameter or error code it governs.',
    '',
    '## Discovery and template use',
    '',
    '1. You MUST call list_resources or search_resources before creating a project, and you MUST use a matching workspace template via create_project instead of hand-writing scaffolding when one exists.',
    '2. You MUST call get_resource on the chosen template before create_project, and you MUST collect values for every variable marked required in its variable list. Missing required variables fail with TEMPLATE_VARS_MISSING.',
    '3. search_resources is plain substring matching with no semantic understanding. If it returns no results, you MUST call list_resources and evaluate every template by meaning (for example, a "backend" request may match a Java template) before concluding that nothing matches.',
    '4. If no template matches the user\'s request, you MUST stop and ask the user how to proceed. You MUST NOT invent a resourceId, and you MUST NOT fall back to writing scaffolding code yourself.',
    '',
    '## User confirmation',
    '',
    '5. You MUST show the user the variable values and the targetPath you will pass to create_project, and get their confirmation, before calling it.',
    '6. You MUST NOT pass allowHooks: true unless the user explicitly asked for template hooks to run. Hooks are arbitrary shell scripts executed with the user\'s permissions; the default (false) skips them.',
    '7. You MUST NOT pass overwrite: true for a non-empty directory unless the user explicitly confirmed it. Without it, a non-empty targetPath fails safely with TARGET_NOT_EMPTY.',
    '8. You MUST NOT set keepGit: true unless the user wants the generated project to keep the template\'s own .git history.',
    '',
    '## Errors and boundaries',
    '',
    '9. When a tool result has ok: false, you MUST read error.code and error.suggestion before retrying or asking the user. You MUST NOT blindly repeat the same call.',
    '10. You MUST NOT try to bypass workspace boundaries: a CLOUD_WORKSPACE_REQUIRED or CLOUD_RESOURCE_CROSS_SPACE_DISABLED error means ask the user to change login/workspace in their terminal, not to work around it.',
    '11. On AUTH_TOKEN_UNAVAILABLE, you MUST ask the user to run `ag login` in their terminal; you cannot log in on their behalf.',
    '',
    '## Reporting',
    '',
    '12. After create_project succeeds, you MUST report to the user: how many files were written (filesWritten), the template version (templateCommit), and whether hooks ran (hooksExecuted) or were skipped (hooksSkipped).',
    '13. If the template returned warnings, you MUST relay them to the user.',
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
      name: 'AgileBuilder Resource Catalog (docs & templates)',
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
