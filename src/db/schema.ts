/**
 * 数据库表结构定义
 */

export const CREATE_RESOURCES_TABLE = `
CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('template', 'doc')),
  description TEXT,
  tags TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

export const CREATE_RESOURCES_NAME_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_name
ON resources (name);
`;

export const CREATE_RESOURCES_TYPE_INDEX = `
CREATE INDEX IF NOT EXISTS idx_resources_type
ON resources (type);
`;

export const CREATE_RESOURCE_TEMPLATES_TABLE = `
CREATE TABLE IF NOT EXISTS resource_templates (
  resource_id INTEGER PRIMARY KEY,
  git_url TEXT NOT NULL,
  branch TEXT DEFAULT 'main',
  category TEXT,
  template_type TEXT DEFAULT 'project',
  variables TEXT,
  post_clone_commands TEXT,
  clone_count INTEGER DEFAULT 0,
  last_cloned_at DATETIME,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);
`;

export const CREATE_RESOURCE_TEMPLATES_CATEGORY_INDEX = `
CREATE INDEX IF NOT EXISTS idx_resource_templates_category
ON resource_templates (category);
`;

export const CREATE_RESOURCE_DOCS_TABLE = `
CREATE TABLE IF NOT EXISTS resource_docs (
  resource_id INTEGER PRIMARY KEY,
  uri TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'markdown',
  word_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
);
`;

export const CREATE_RESOURCE_DOCS_URI_INDEX = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_docs_uri
ON resource_docs (uri);
`;

/**
 * 所有建表语句
 */
export const SCHEMA_STATEMENTS = [
  CREATE_RESOURCES_TABLE,
  CREATE_RESOURCES_NAME_INDEX,
  CREATE_RESOURCES_TYPE_INDEX,
  CREATE_RESOURCE_TEMPLATES_TABLE,
  CREATE_RESOURCE_TEMPLATES_CATEGORY_INDEX,
  CREATE_RESOURCE_DOCS_TABLE,
  CREATE_RESOURCE_DOCS_URI_INDEX,
];
