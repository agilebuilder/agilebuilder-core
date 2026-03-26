import type { SqlValue } from 'sql.js';
import { execute, queryAll, queryOne, transaction } from '../index.js';
import type { Template, CreateTemplateInput, UpdateTemplateInput } from '../../shared/types.js';
import { parseJSON, stringifyJSON } from '../../shared/utils.js';
import { DEFAULT_BRANCH, DEFAULT_TEMPLATE_TYPE } from '../../shared/constants.js';

export class TemplatesDAO {
  static async getAll(): Promise<Template[]> {
    return queryAll<Template>(`
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
      WHERE r.type = 'template'
      ORDER BY r.created_at DESC
    `);
  }

  static async getByName(name: string): Promise<Template | null> {
    return queryOne<Template>(`
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
      WHERE r.type = 'template' AND r.name = ?
    `, [name]);
  }

  static async getById(id: number): Promise<Template | null> {
    return queryOne<Template>(`
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

  static async getByResourceId(resourceId: string | number): Promise<Template | null> {
    const numericId = typeof resourceId === 'string' ? Number(resourceId) : resourceId;
    if (!Number.isInteger(numericId)) {
      return null;
    }

    return this.getById(numericId);
  }

  static async create(input: CreateTemplateInput): Promise<Template> {
    const createdId = await transaction(async () => {
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

    const created = await this.getById(createdId);
    if (!created) throw new Error('Failed to create template');
    return created;
  }

  static async update(name: string, input: UpdateTemplateInput): Promise<Template> {
    const existing = await this.getByName(name);
    if (!existing) throw new Error(`Template not found: ${name}`);

    await transaction(async () => {
      const resourceUpdates: string[] = [];
      const resourceValues: SqlValue[] = [];
      if (input.name !== undefined) { resourceUpdates.push('name = ?'); resourceValues.push(input.name); }
      if (input.description !== undefined) { resourceUpdates.push('description = ?'); resourceValues.push(input.description); }
      if (input.tags !== undefined) { resourceUpdates.push('tags = ?'); resourceValues.push(stringifyJSON(input.tags)); }
      if (resourceUpdates.length > 0) {
        resourceUpdates.push('updated_at = CURRENT_TIMESTAMP');
        resourceValues.push(existing.id);
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
        templateValues.push(existing.id);
        await execute(`UPDATE resource_templates SET ${templateUpdates.join(', ')} WHERE resource_id = ?`, templateValues);
      }
    });

    const updated = await this.getById(existing.id);
    if (!updated) throw new Error('Failed to update template');
    return updated;
  }

  static async delete(name: string): Promise<boolean> {
    const result = await execute(`DELETE FROM resources WHERE type = 'template' AND name = ?`, [name]);
    return result.changes > 0;
  }

  static async incrementCloneCount(name: string): Promise<void> {
    await execute(`
      UPDATE resource_templates
      SET clone_count = clone_count + 1, last_cloned_at = CURRENT_TIMESTAMP
      WHERE resource_id = (
        SELECT id FROM resources WHERE type = 'template' AND name = ?
      )
    `, [name]);
  }

  static async getByCategory(category: string): Promise<Template[]> {
    return queryAll<Template>(`
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
      WHERE r.type = 'template' AND t.category = ?
      ORDER BY r.created_at DESC
    `, [category]);
  }

  static async search(keyword: string): Promise<Template[]> {
    const pattern = `%${keyword}%`;
    return queryAll<Template>(`
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
      WHERE r.type = 'template'
        AND (r.name LIKE ? OR r.description LIKE ? OR t.category LIKE ?)
      ORDER BY r.created_at DESC
    `, [pattern, pattern, pattern]);
  }
}
