import express from 'express';
import { ResourcesDAO } from '../../../db/dao/resources.dao.js';
import { t } from '../../../i18n/index.js';
import type { UpdateDocInput, UpdateTemplateInput } from '../../../shared/types.js';

export const resourcesRouter = express.Router();

resourcesRouter.get('/', async (req, res) => {
  try {
    const type = req.query.type as 'template' | 'doc' | undefined;
    const keyword = (req.query.keyword as string | undefined)?.trim();

    const resources = keyword
      ? await ResourcesDAO.searchDetailed(keyword, type)
      : type
        ? await ResourcesDAO.getByType(type)
        : await ResourcesDAO.getAllDetailed();

    res.json({ success: true, data: resources });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : t('api.unknownError'),
      },
    });
  }
});

resourcesRouter.get('/summary', async (_req, res) => {
  try {
    res.json({ success: true, data: await ResourcesDAO.getSummary() });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : t('api.unknownError'),
      },
    });
  }
});

resourcesRouter.get('/:id', async (req, res) => {
  try {
    const resourceId = Number(req.params.id);
    if (!Number.isInteger(resourceId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: t('api.invalidResourceId'),
        },
      });
    }

    const resource = await ResourcesDAO.getDetailById(resourceId);
    if (!resource) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: t('api.resourceNotFound', { id: resourceId }),
        },
      });
    }

    return res.json({ success: true, data: resource });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : t('api.unknownError'),
      },
    });
  }
});

resourcesRouter.put('/:id', async (req, res) => {
  try {
    const resourceId = Number(req.params.id);
    if (!Number.isInteger(resourceId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: t('api.invalidResourceId'),
        },
      });
    }

    const existing = await ResourcesDAO.getDetailById(resourceId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: t('api.resourceNotFound', { id: resourceId }),
        },
      });
    }

    const updated = existing.type === 'template'
      ? await ResourcesDAO.updateTemplate(resourceId, req.body as UpdateTemplateInput)
      : await ResourcesDAO.updateDoc(resourceId, req.body as UpdateDocInput);

    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : t('api.unknownError'),
      },
    });
  }
});

resourcesRouter.delete('/:id', async (req, res) => {
  try {
    const resourceId = Number(req.params.id);
    if (!Number.isInteger(resourceId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: t('api.invalidResourceId'),
        },
      });
    }

    const deleted = await ResourcesDAO.deleteById(resourceId);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: t('api.resourceNotFound', { id: resourceId }),
        },
      });
    }

    return res.json({ success: true, data: { deleted: true } });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : t('api.unknownError'),
      },
    });
  }
});
