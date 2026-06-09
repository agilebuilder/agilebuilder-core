import { AppError } from '../errors/app-error.js';
import { getLocalResourcesFilePath } from '../shared/paths.js';
import { readJsonFile, writeJsonFile } from '../shared/fs.js';
import { t } from '../i18n/index.js';
import type {
  AddDocInput,
  AddTemplateInput,
  DocResource,
  LocalResource,
  LocalResourceStoreData,
  ResourceType,
  TemplateResource,
  UpdateResourceInput,
} from './types.js';

const EMPTY_STORE: LocalResourceStoreData = {
  version: 1,
  nextId: 1,
  items: [],
};

function normalizeTags(tags: string[] | undefined): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)));
}

function calculateWordCount(content: string): number {
  const trimmed = content.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function now(): string {
  return new Date().toISOString();
}

function normalizeStore(value: LocalResourceStoreData): LocalResourceStoreData {
  if (value.version !== 1) {
    throw new Error(`Unsupported local resource store version: ${String(value.version)}`);
  }
  if (!Number.isInteger(value.nextId) || value.nextId <= 0) {
    throw new Error('Invalid local resource store: nextId must be a positive integer.');
  }
  if (!Array.isArray(value.items)) {
    throw new Error('Invalid local resource store: items must be an array.');
  }
  return {
    version: 1,
    nextId: value.nextId,
    items: value.items,
  };
}

export class LocalResourceRepository {
  private readonly filePath: string;

  constructor(filePath = getLocalResourcesFilePath()) {
    this.filePath = filePath;
  }

  async list(filter: { type?: ResourceType; keyword?: string } = {}): Promise<LocalResource[]> {
    const store = await this.load();
    const keyword = filter.keyword?.trim().toLowerCase();
    return store.items.filter((item) => {
      if (filter.type && item.type !== filter.type) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const haystack = [
        item.id,
        item.name,
        item.description ?? '',
        item.tags.join(' '),
        item.type === 'template' ? item.gitUrl : item.uri,
        item.type === 'doc' ? item.content : '',
      ].join(' ').toLowerCase();
      return haystack.includes(keyword);
    });
  }

  async get(id: string): Promise<LocalResource | null> {
    const store = await this.load();
    return store.items.find((item) => item.id === id) ?? null;
  }

  async require(id: string): Promise<LocalResource> {
    const resource = await this.get(id);
    if (!resource) {
      throw new AppError({
        code: 'RESOURCE_NOT_FOUND',
        message: t('res.notFound', { id }),
        category: 'resource',
      });
    }
    return resource;
  }

  async addTemplate(input: AddTemplateInput): Promise<TemplateResource> {
    const store = await this.load();
    const timestamp = now();
    const resource: TemplateResource = {
      id: String(store.nextId++),
      type: 'template',
      name: input.name,
      description: input.description,
      tags: normalizeTags(input.tags),
      createdAt: timestamp,
      updatedAt: timestamp,
      gitUrl: input.gitUrl,
      branch: input.branch || 'main',
      subdir: input.subdir,
    };
    store.items.unshift(resource);
    await this.save(store);
    return resource;
  }

  async addDoc(input: AddDocInput): Promise<DocResource> {
    const store = await this.load();
    const timestamp = now();
    const resource: DocResource = {
      id: String(store.nextId++),
      type: 'doc',
      name: input.name,
      description: input.description,
      tags: normalizeTags(input.tags),
      createdAt: timestamp,
      updatedAt: timestamp,
      uri: input.uri,
      content: input.content,
      format: input.format || 'markdown',
      wordCount: calculateWordCount(input.content),
    };
    store.items.unshift(resource);
    await this.save(store);
    return resource;
  }

  async update(id: string, input: UpdateResourceInput): Promise<LocalResource | null> {
    const store = await this.load();
    const index = store.items.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }

    const current = store.items[index];
    const base = {
      name: input.name ?? current.name,
      description: input.description ?? current.description,
      tags: input.tags ? normalizeTags(input.tags) : current.tags,
      updatedAt: now(),
    };

    const resource: LocalResource = current.type === 'template'
      ? {
          ...current,
          ...base,
          gitUrl: input.gitUrl ?? current.gitUrl,
          branch: input.branch ?? current.branch,
          subdir: input.subdir ?? current.subdir,
        }
      : {
          ...current,
          ...base,
          uri: input.uri ?? current.uri,
          content: input.content ?? current.content,
          format: input.format ?? current.format,
          wordCount: input.content === undefined ? current.wordCount : calculateWordCount(input.content),
        };

    store.items[index] = resource;
    await this.save(store);
    return resource;
  }

  async remove(id: string): Promise<boolean> {
    const store = await this.load();
    const nextItems = store.items.filter((item) => item.id !== id);
    const removed = nextItems.length !== store.items.length;
    if (!removed) {
      return false;
    }
    await this.save({ ...store, items: nextItems });
    return true;
  }

  private async load(): Promise<LocalResourceStoreData> {
    return normalizeStore(await readJsonFile(this.filePath, EMPTY_STORE));
  }

  private async save(store: LocalResourceStoreData): Promise<void> {
    await writeJsonFile(this.filePath, normalizeStore(store));
  }
}
