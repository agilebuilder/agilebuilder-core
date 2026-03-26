/**
 * MCP Resources 模块导出
 */

export {
  listDocResources,
  readDocResource,
  USAGE_URI_PREFIX,
  DOCS_URI_PREFIX,
  USAGE_GUIDE_URI,
  DOCS_CATALOG_URI,
  LOCAL_DOC_URI_PREFIX,
  CLOUD_DOC_URI_PREFIX,
  DocPriority,
} from './docs.js';

export type { MCPResource, DocResourceListResult, DocResourceReadError, DocResourceReadResult } from './docs.js';
