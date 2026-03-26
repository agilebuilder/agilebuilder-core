/**
 * MCP Tools 定义
 *
 * 定义所有可用的 MCP Tools 及其 Schema
 */

/**
 * 模板相关 Tools
 */
export const TEMPLATE_TOOLS = [
  {
    name: 'listTemplates',
    description: 'Browse all available project templates. USE WHEN: User wants to see what templates are available, or needs to choose a template for a new project. Returns template names with descriptions, categories, tags, and popularity metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Filter by category name (e.g., "frontend", "backend", "fullstack")',
        },
        tags: {
          type: 'string',
          description: 'Filter by tags, comma-separated (e.g., "vue,typescript,admin")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of templates to return',
        },
      },
    },
  },
  {
    name: 'searchTemplates',
    description: 'Search templates by keyword. USE WHEN: User mentions a specific technology (e.g., "Vue", "React"), project type (e.g., "admin dashboard"), or has a specific requirement. Searches across name, description, tags, and category fields.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keyword (e.g., "vue", "react", "admin", "blog")',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'getTemplateInfo',
    description: 'Get detailed information about a specific template. USE WHEN: User wants to know more about a template before using it, or needs to understand template variables. Prefer resourceId for exact lookup. Returns full description, configurable variables (Pro), source info, and usage hints.',
    inputSchema: {
      type: 'object',
      properties: {
        resourceId: {
          type: 'string',
          description: 'Preferred exact template resource ID obtained from listTemplates or searchTemplates',
        },
        spaceId: {
          type: 'string',
          description: 'Optional space ID for explicit disambiguation when using resourceId',
        },
        name: {
          type: 'string',
          description: 'Fallback template name when resourceId is unavailable',
        },
      },
    },
  },
  {
    name: 'createProjectByTemplate',
    description: 'Create a new project from a template. USE WHEN: User is ready to create a project and has chosen a template. RECOMMENDED WORKFLOW: 1) listTemplates/searchTemplates to find templates → 2) getTemplateInfo to review details → 3) createProjectByTemplate to create. Returns project path and next steps (e.g., npm install).',
    inputSchema: {
      type: 'object',
      properties: {
        resourceId: {
          type: 'string',
          description: 'Template resource ID obtained from listTemplates, searchTemplates, or getTemplateInfo',
        },
        spaceId: {
          type: 'string',
          description: 'Optional space ID for explicit disambiguation. If omitted, the current space is checked first and cross-space lookup may be used when enabled.',
        },
        templateName: {
          type: 'string',
          description: 'Optional template name for display only',
        },
        targetPath: {
          type: 'string',
          description: 'Absolute path where the project will be created (e.g., "D:/Projects/my-app")',
        },
        projectName: {
          type: 'string',
          description: 'Custom project name (defaults to folder name from targetPath)',
        },
        variables: {
          type: 'object',
          description: 'Template variable values for customization (Pro feature only)',
        },
      },
      required: ['resourceId', 'targetPath'],
    },
  },
];

/**
 * 所有 Tools
 */
export const TOOLS = [...TEMPLATE_TOOLS];
