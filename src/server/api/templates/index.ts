import express from 'express';
import { TemplatesDAO } from '../../../db/dao/templates.dao.js';
import { t } from '../../../i18n/index.js';
import type { CreateTemplateInput, UpdateTemplateInput } from '../../../shared/types.js';

export const templatesRouter = express.Router();

templatesRouter.get('/', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const templates = category ? await TemplatesDAO.getByCategory(category) : await TemplatesDAO.getAll();
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : t('api.unknownError') } });
  }
});

templatesRouter.get('/:name', async (req, res) => {
  try {
    const template = await TemplatesDAO.getByName(req.params.name);
    if (!template) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: t('api.templateNotFound', { name: req.params.name }) } });
    }
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : t('api.unknownError') } });
  }
});

templatesRouter.post('/', async (req, res) => {
  try {
    const input: CreateTemplateInput = req.body;
    const template = await TemplatesDAO.create(input);
    res.status(201).json({ success: true, data: template });
  } catch (error) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error instanceof Error ? error.message : t('api.unknownError') } });
  }
});

templatesRouter.put('/:name', async (req, res) => {
  try {
    const input: UpdateTemplateInput = req.body;
    const template = await TemplatesDAO.update(req.params.name, input);
    res.json({ success: true, data: template });
  } catch (error) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error instanceof Error ? error.message : t('api.unknownError') } });
  }
});

templatesRouter.delete('/:name', async (req, res) => {
  try {
    const deleted = await TemplatesDAO.delete(req.params.name);
    if (!deleted) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: t('api.templateNotFound', { name: req.params.name }) } });
    }
    res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : t('api.unknownError') } });
  }
});

templatesRouter.get('/search/:keyword', async (req, res) => {
  try {
    const templates = await TemplatesDAO.search(req.params.keyword);
    res.json({ success: true, data: templates });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : t('api.unknownError') } });
  }
});
