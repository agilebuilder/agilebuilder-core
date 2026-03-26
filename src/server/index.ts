import express from 'express';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { templatesRouter } from './api/templates/index.js';
import { docsRouter } from './api/docs/index.js';
import { resourcesRouter } from './api/resources/index.js';
import { settingsRouter } from './api/settings/index.js';
import { UI_HOST } from '../shared/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function isAllowedLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  } catch {
    return false;
  }
}

export async function startServer(port: number): Promise<void> {
  const app = express();
  app.use(cors({
    origin(origin, callback) {
      if (!origin || isAllowedLocalOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin is not allowed for the local Web UI.'));
    },
  }));
  app.use(express.json());
  app.use('/api/templates', templatesRouter);
  app.use('/api/docs', docsRouter);
  app.use('/api/resources', resourcesRouter);
  app.use('/api/settings', settingsRouter);
  const uiDistPath = join(__dirname, '../../ui/dist');
  app.use(express.static(uiDistPath));
  app.get('*', (req, res) => {
    res.sendFile(join(uiDistPath, 'index.html'));
  });
  return new Promise((resolve, reject) => {
    const server = app.listen(port, UI_HOST, () => { resolve(); });
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(error);
      }
    });
  });
}
