export type ResourceType = 'template' | 'doc';

export interface ResourceBase {
  id: string;
  type: ResourceType;
  name: string;
  description?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateResource extends ResourceBase {
  type: 'template';
  gitUrl: string;
  branch: string;
  subdir?: string;
  configFile?: string;
}

export interface DocResource extends ResourceBase {
  type: 'doc';
  uri: string;
  content: string;
  format: 'markdown' | 'text';
  wordCount: number;
}

export type LocalResource = TemplateResource | DocResource;

export interface LocalResourceStoreData {
  version: 1;
  nextId: number;
  items: LocalResource[];
}

export interface AddTemplateInput {
  name: string;
  gitUrl: string;
  branch?: string;
  subdir?: string;
  description?: string;
  tags?: string[];
}

export interface AddDocInput {
  name: string;
  uri: string;
  content: string;
  format?: 'markdown' | 'text';
  description?: string;
  tags?: string[];
}

export interface UpdateResourceInput {
  name?: string;
  description?: string;
  tags?: string[];
  gitUrl?: string;
  branch?: string;
  subdir?: string;
  uri?: string;
  content?: string;
  format?: 'markdown' | 'text';
}
