import { existsSync } from 'fs';
import { createRequire } from 'module';
import { getProModuleFilePath, isDevMode } from '../shared/paths.js';
import { APP_VERSION } from '../shared/constants.js';
import { ProDownloader } from './downloader.js';
import { ProIntegrity } from './integrity.js';
import type { ProModule } from '../shared/types.js';
import { t } from '../i18n/index.js';

function compareVersion(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }

  return 0;
}

export interface ProLoaderState {
  loaded: boolean;
  version?: string;
  error?: string;
}

let loadedModule: ProModule | null = null;
let loaderState: ProLoaderState = { loaded: false };

export class ProLoader {
  static getState(): ProLoaderState {
    return { ...loaderState };
  }

  static isLoaded(): boolean {
    return loaderState.loaded && loadedModule !== null;
  }

  static getModule(): ProModule | null {
    return loadedModule;
  }

  static async load(): Promise<{
    success: boolean;
    module?: ProModule;
    error?: string;
  }> {
    if (this.isLoaded() && loadedModule) {
      return {
        success: true,
        module: loadedModule,
      };
    }

    const modulePath = getProModuleFilePath();
    const devMode = isDevMode();

    if (!existsSync(modulePath)) {
      if (devMode) {
        loaderState = {
          loaded: false,
          error: t('pro.loader.sourceNotFound', { path: modulePath }),
        };
        return {
          success: false,
          error: loaderState.error,
        };
      }

      console.log(t('pro.loader.moduleMissingDownload'));

      const downloadResult = await ProDownloader.download();
      if (!downloadResult.success) {
        loaderState = {
          loaded: false,
          error: downloadResult.error,
        };
        return {
          success: false,
          error: downloadResult.error,
        };
      }
    }

    try {
      const integrityResult = ProIntegrity.verify();
      if (!integrityResult.valid) {
        const errorMsg = integrityResult.recoveryHint
          ? `${integrityResult.reason}\n${integrityResult.recoveryHint}`
          : integrityResult.reason || t('pro.manifestSignatureInvalid');
        loaderState = {
          loaded: false,
          error: errorMsg,
        };
        return {
          success: false,
          error: errorMsg,
        };
      }

      const meta = integrityResult.meta;
      if (meta?.minCliVersion && compareVersion(APP_VERSION, meta.minCliVersion) < 0) {
        const errorMsg = t('pro.loader.requiresCliVersion', {
          minCliVersion: meta.minCliVersion,
          currentVersion: APP_VERSION,
        });
        loaderState = {
          loaded: false,
          error: errorMsg,
        };
        return {
          success: false,
          error: errorMsg,
        };
      }

      const require = createRequire(import.meta.url);
      delete require.cache[modulePath];

      if (devMode) {
        console.log(t('pro.loader.devSourceLoad'));
      }

      const moduleExports = require(modulePath);
      const proModule = (moduleExports.default || moduleExports.proModule || moduleExports) as ProModule & {
        init?: () => void;
      };

      if (typeof proModule.init === 'function') {
        proModule.init();
      }

      loadedModule = proModule;
      loaderState = {
        loaded: true,
        version: proModule.version,
      };

      return {
        success: true,
        module: proModule,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t('common.unknownError');
      loaderState = {
        loaded: false,
        error: errorMsg,
      };
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  static unload(): void {
    loadedModule = null;
    loaderState = { loaded: false };
    console.log(t('pro.loader.unloaded'));
  }

  static async reload(): Promise<{
    success: boolean;
    module?: ProModule;
    error?: string;
  }> {
    this.unload();
    return this.load();
  }

  static async ensure(): Promise<ProModule | null> {
    if (this.isLoaded()) {
      return loadedModule;
    }

    const result = await this.load();
    return result.success ? result.module || null : null;
  }
}
