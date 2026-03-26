import type { SqlValue } from 'sql.js';
import { execute, queryAll, queryOne, transaction } from '../index.js';
import type {
  CreateDocInput,
  CreateTemplateInput,
  LocalDocResource,
  LocalResource,
  LocalResourceRecord,
  LocalTemplateResource,
  UpdateDocInput,
  UpdateTemplateInput,
} from '../../shared/types.js';
import { DEFAULT_BRANCH, DEFAULT_TEMPLATE_TYPE } from '../../shared/constants.js';
import { stringifyJSON } from '../../shared/utils.js';

function calculateWordCount(content: string): number {
  const trimmed = content.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

export class ResourcesDAO {
  static async getAll(): Promise<LocalResource[]> {
    return queryAll<LocalResource>(`
      SELECT
        id,
        name,
        type,
        description,
        tags,
        created_at,
        updated_at
      FROM resources
      ORDER BY created_at DESC
    `);
  }

  static async getAllDetailed(): Promise<LocalResourceRecord[]> {
    const resources = await this.getAll();
    const detailed = await Promise.all(resources.map((resource) => this.getDetailById(resource.id)));
    return detailed
      .filter((resource): resource is LocalResourceRecord => resource !== null);
  }

  static async getByType(type: LocalResource['type']): Promise<LocalResourceRecord[]> {
    const resources = await this.getAllDetailed();
    return resources.filter((resource) => resource.type === type);
  }

  static async searchDetailed(keyword: string, type?: LocalResource['type']): Promise<LocalResourceRecord[]> {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const candidates = type ? await this.getByType(type) : await this.getAllDetailed();

    if (!normalizedKeyword) {
      return candidates;
    }

    return candidates.filter((resource) => {
      const tags = resource.tags ? resource.tags.toLowerCase() : '';
      const description = resource.description ? resource.description.toLowerCase() : '';
      const baseMatched =
        resource.name.toLowerCase().includes(normalizedKeyword) ||
        description.includes(normalizedKeyword) ||
        tags.includes(normalizedKeyword);

      if (baseMatched) {
        return true;
      }

      if (resource.type === 'template') {
        return (
          resource.git_url.toLowerCase().includes(normalizedKeyword) ||
          (resource.category || '').toLowerCase().includes(normalizedKeyword) ||
          resource.template_type.toLowerCase().includes(normalizedKeyword)
        );
      }

      return (
        resource.uri.toLowerCase().includes(normalizedKeyword) ||
        resource.format.toLowerCase().includes(normalizedKeyword) ||
        resource.content.toLowerCase().includes(normalizedKeyword)
      );
    });
  }

  static async getSummary(): Promise<{
    total: number;
    templates: number;
    docs: number;
    totalCloneCount: number;
    totalWordCount: number;
    categories: string[];
    formats: string[];
    recent: LocalResourceRecord[];
  }> {
    const resources = await this.getAllDetailed();
    const templates = resources.filter((resource) => resource.type === 'template');
    const docs = resources.filter((resource) => resource.type === 'doc');
    const totalCloneCount = templates.reduce((sum, resource) => sum + resource.clone_count, 0);
    const totalWordCount = docs.reduce((sum, resource) => sum + resource.word_count, 0);

    const categories = Array.from(
      new Set(
        templates
          .map((resource) => resource.category)
          .filter((value): value is string => Boolean(value))
      )
    ).sort((a, b) => a.localeCompare(b));

    const formats = Array.from(
      new Set(docs.map((resource) => resource.format).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    return {
      total: resources.length,
      templates: templates.length,
      docs: docs.length,
      totalCloneCount,
      totalWordCount,
      categories,
      formats,
      recent: resources.slice(0, 6),
    };
  }

  static async getById(id: number): Promise<LocalResource | null> {
    return queryOne<LocalResource>(`
      SELECT
        id,
        name,
        type,
        description,
        tags,
        created_at,
        updated_at
      FROM resources
      WHERE id = ?
    `, [id]);
  }

  static async getByName(name: string): Promise<LocalResource | null> {
    return queryOne<LocalResource>(`
      SELECT
        id,
        name,
        type,
        description,
        tags,
        created_at,
        updated_at
      FROM resources
      WHERE name = ?
    `, [name]);
  }

  static async deleteById(id: number): Promise<boolean> {
    const result = await execute('DELETE FROM resources WHERE id = ?', [id]);
    return result.changes > 0;
  }

  static async getTemplateById(id: number): Promise<LocalTemplateResource | null> {
    return queryOne<LocalTemplateResource>(`
      SELECT
        r.id,
        r.name,
        r.type,
        r.description,
        r.tags,
        r.created_at,
        r.updated_at,
        t.git_url,
        t.branch,
        t.category,
        t.template_type,
        t.variables,
        t.post_clone_commands,
        t.clone_count,
        t.last_cloned_at
      FROM resources r
      INNER JOIN resource_templates t ON t.resource_id = r.id
      WHERE r.type = 'template' AND r.id = ?
    `, [id]);
  }

  static async getDocById(id: number): Promise<LocalDocResource | null> {
    return queryOne<LocalDocResource>(`
      SELECT
        r.id,
        r.name,
        r.type,
        r.description,
        r.tags,
        r.created_at,
        r.updated_at,
        d.uri,
        d.content,
        d.format,
        d.word_count
      FROM resources r
      INNER JOIN resource_docs d ON d.resource_id = r.id
      WHERE r.type = 'doc' AND r.id = ?
    `, [id]);
  }

  static async getDocByUri(uri: string): Promise<LocalDocResource | null> {
    return queryOne<LocalDocResource>(`
      SELECT
        r.id,
        r.name,
        r.type,
        r.description,
        r.tags,
        r.created_at,
        r.updated_at,
        d.uri,
        d.content,
        d.format,
        d.word_count
      FROM resources r
      INNER JOIN resource_docs d ON d.resource_id = r.id
      WHERE r.type = 'doc' AND d.uri = ?
    `, [uri]);
  }

  static async createTemplate(input: CreateTemplateInput): Promise<LocalTemplateResource> {
    const resourceId = await transaction(async () => {
      const resourceResult = await execute(`
        INSERT INTO resources (name, type, description, tags)
        VALUES (?, 'template', ?, ?)
      `, [
        input.name,
        input.description || null,
        stringifyJSON(input.tags),
      ]);
      const resourceId = resourceResult.lastInsertRowid;

      await execute(`
        INSERT INTO resource_templates (
          resource_id,
          git_url,
          branch,
          category,
          template_type,
          variables,
          post_clone_commands
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        resourceId,
        input.git_url,
        input.branch || DEFAULT_BRANCH,
        input.category || null,
        input.template_type || DEFAULT_TEMPLATE_TYPE,
        stringifyJSON(input.variables),
        stringifyJSON(input.post_clone_commands),
      ]);

      return resourceId;
    });

    const created = await this.getTemplateById(resourceId);
    if (!created) {
      throw new Error('Failed to create template resource');
    }
    return created;
  }

  static async createDoc(input: CreateDocInput): Promise<LocalDocResource> {
    const resourceId = await transaction(async () => {
      const resourceResult = await execute(`
        INSERT INTO resources (name, type, description, tags)
        VALUES (?, 'doc', ?, ?)
      `, [
        input.name,
        input.description || null,
        stringifyJSON(input.tags),
      ]);
      const resourceId = resourceResult.lastInsertRowid;

      await execute(`
        INSERT INTO resource_docs (
          resource_id,
          uri,
          content,
          format,
          word_count
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        resourceId,
        input.uri,
        input.content,
        input.format || 'markdown',
        calculateWordCount(input.content),
      ]);

      return resourceId;
    });

    const created = await this.getDocById(resourceId);
    if (!created) {
      throw new Error('Failed to create doc resource');
    }
    return created;
  }

  static async updateTemplate(id: number, input: UpdateTemplateInput): Promise<LocalTemplateResource> {
    const existing = await this.getTemplateById(id);
    if (!existing) {
      throw new Error(`Template resource not found: ${id}`);
    }

    await transaction(async () => {
      const resourceUpdates: string[] = [];
      const resourceValues: SqlValue[] = [];
      if (input.name !== undefined) { resourceUpdates.push('name = ?'); resourceValues.push(input.name); }
      if (input.description !== undefined) { resourceUpdates.push('description = ?'); resourceValues.push(input.description); }
      if (input.tags !== undefined) { resourceUpdates.push('tags = ?'); resourceValues.push(stringifyJSON(input.tags)); }
      if (resourceUpdates.length > 0) {
        resourceUpdates.push('updated_at = CURRENT_TIMESTAMP');
        resourceValues.push(id);
        await execute(`UPDATE resources SET ${resourceUpdates.join(', ')} WHERE id = ?`, resourceValues);
      }

      const templateUpdates: string[] = [];
      const templateValues: SqlValue[] = [];
      if (input.git_url !== undefined) { templateUpdates.push('git_url = ?'); templateValues.push(input.git_url); }
      if (input.branch !== undefined) { templateUpdates.push('branch = ?'); templateValues.push(input.branch); }
      if (input.category !== undefined) { templateUpdates.push('category = ?'); templateValues.push(input.category); }
      if (input.template_type !== undefined) { templateUpdates.push('template_type = ?'); templateValues.push(input.template_type); }
      if (input.variables !== undefined) { templateUpdates.push('variables = ?'); templateValues.push(stringifyJSON(input.variables)); }
      if (input.post_clone_commands !== undefined) { templateUpdates.push('post_clone_commands = ?'); templateValues.push(stringifyJSON(input.post_clone_commands)); }
      if (templateUpdates.length > 0) {
        templateValues.push(id);
        await execute(`UPDATE resource_templates SET ${templateUpdates.join(', ')} WHERE resource_id = ?`, templateValues);
      }
    });

    const updated = await this.getTemplateById(id);
    if (!updated) {
      throw new Error('Failed to update template resource');
    }
    return updated;
  }

  static async updateDoc(id: number, input: UpdateDocInput): Promise<LocalDocResource> {
    const existing = await this.getDocById(id);
    if (!existing) {
      throw new Error(`Doc resource not found: ${id}`);
    }

    await transaction(async () => {
      const resourceUpdates: string[] = [];
      const resourceValues: SqlValue[] = [];
      if (input.name !== undefined) { resourceUpdates.push('name = ?'); resourceValues.push(input.name); }
      if (input.description !== undefined) { resourceUpdates.push('description = ?'); resourceValues.push(input.description); }
      if (input.tags !== undefined) { resourceUpdates.push('tags = ?'); resourceValues.push(stringifyJSON(input.tags)); }
      if (resourceUpdates.length > 0) {
        resourceUpdates.push('updated_at = CURRENT_TIMESTAMP');
        resourceValues.push(id);
        await execute(`UPDATE resources SET ${resourceUpdates.join(', ')} WHERE id = ?`, resourceValues);
      }

      const docUpdates: string[] = [];
      const docValues: SqlValue[] = [];
      if (input.uri !== undefined) { docUpdates.push('uri = ?'); docValues.push(input.uri); }
      if (input.content !== undefined) {
        docUpdates.push('content = ?');
        docValues.push(input.content);
        docUpdates.push('word_count = ?');
        docValues.push(calculateWordCount(input.content));
      }
      if (input.format !== undefined) { docUpdates.push('format = ?'); docValues.push(input.format); }
      if (docUpdates.length > 0) {
        docValues.push(id);
        await execute(`UPDATE resource_docs SET ${docUpdates.join(', ')} WHERE resource_id = ?`, docValues);
      }
    });

    const updated = await this.getDocById(id);
    if (!updated) {
      throw new Error('Failed to update doc resource');
    }
    return updated;
  }

  static async getDetailById(id: number): Promise<LocalResourceRecord | null> {
    const resource = await this.getById(id);
    if (!resource) {
      return null;
    }
    if (resource.type === 'template') {
      return this.getTemplateById(id);
    }
    if (resource.type === 'doc') {
      return this.getDocById(id);
    }
    return null;
  }
}
