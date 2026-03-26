import express from 'express';
import { CliConfigStore } from '../../../config/store.js';
import { getEffectiveLocale, t } from '../../../i18n/index.js';

export const settingsRouter = express.Router();

settingsRouter.get('/ui', (_req, res) => {
  try {
    const language = CliConfigStore.getLanguage();
    const locale = getEffectiveLocale(language);

    res.json({
      success: true,
      data: {
        language,
        locale,
        theme: {
          primaryColor: '#1d7eb9',
        },
      },
    });
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
