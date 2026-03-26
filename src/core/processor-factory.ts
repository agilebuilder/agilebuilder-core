import type { TemplateProcessor } from './types.js';
import { BasicProcessor } from './basic-processor.js';
import { ProProcessor } from './pro-processor.js';
import { TokenStore } from '../auth/token-store.js';
import { AccessChecker } from '../license/checker.js';
import { ProDownloader } from '../pro-loader/downloader.js';
import { SpaceManager } from '../license/space.js';
import { LOCAL_SPACE_ID } from '../shared/constants.js';
import { t } from '../i18n/index.js';
import {
  CloudResourceLoginRequiredError,
  CloudResourceTokenUnavailableError,
  CloudSpaceRequiresProError,
  ProModuleMissingError,
  ProModuleDownloadError,
} from './errors.js';

export {
  CloudResourceLoginRequiredError,
  CloudResourceTokenUnavailableError,
  CloudSpaceRequiresProError,
  ProModuleMissingError,
  ProModuleDownloadError,
};

export class ProcessorFactory {
  private static basicProcessor: BasicProcessor | null = null;
  private static proProcessor: ProProcessor | null = null;

  static getBasicProcessor(): BasicProcessor {
    if (!this.basicProcessor) {
      this.basicProcessor = new BasicProcessor();
    }
    return this.basicProcessor;
  }

  static getProProcessor(): ProProcessor {
    if (!this.proProcessor) {
      this.proProcessor = new ProProcessor();
    }
    return this.proProcessor;
  }

  static async getProcessor(): Promise<TemplateProcessor> {
    await AccessChecker.refreshLicenseIfNeeded();

    const currentSpace = SpaceManager.getCurrentSpace();

    if (currentSpace?.spaceId === LOCAL_SPACE_ID) {
      return this.getBasicProcessor();
    }

    const hasPro = await AccessChecker.hasProAccess();
    if (!hasPro) {
      throw new CloudSpaceRequiresProError(currentSpace?.spaceName || t('common.unknownError'));
    }

    const localVersion = ProDownloader.getLocalVersion();
    if (localVersion) {
      return this.getProProcessor();
    }

    console.log(t('pro.downloading'));
    const downloadResult = await ProDownloader.download();

    if (!downloadResult.success) {
      throw new ProModuleDownloadError(
        `${t('pro.downloadFailed', { error: downloadResult.error })}\n${t('mcp.auth.proDownloadRetrySuggestion')}`
      );
    }

    console.log(t('pro.downloadSuccess', { version: downloadResult.version }));
    return this.getProProcessor();
  }

  static getProcessorByType(type: 'basic' | 'pro'): TemplateProcessor {
    return type === 'pro' ? this.getProProcessor() : this.getBasicProcessor();
  }

  static async prepareCloudProcessor(): Promise<{
    token: string;
    processor: ProProcessor;
  }> {
    await AccessChecker.refreshLicenseIfNeeded();

    if (!AccessChecker.isLoggedIn()) {
      throw new CloudResourceLoginRequiredError();
    }

    const token = await TokenStore.getValidToken();
    if (!token) {
      throw new CloudResourceTokenUnavailableError();
    }

    const hasPro = await AccessChecker.hasProAccess();
    if (!hasPro) {
      const currentSpace = SpaceManager.getCurrentSpace();
      throw new CloudSpaceRequiresProError(currentSpace?.spaceName || t('common.unknownError'));
    }

    const localVersion = ProDownloader.getLocalVersion();
    if (!localVersion) {
      console.log(t('pro.downloading'));
      const downloadResult = await ProDownloader.download();

      if (!downloadResult.success) {
        throw new ProModuleDownloadError(
          `${t('pro.downloadFailed', { error: downloadResult.error })}\n${t('mcp.auth.proDownloadRetrySuggestion')}`
        );
      }

      console.log(t('pro.downloadSuccess', { version: downloadResult.version }));
    }

    return {
      token,
      processor: this.getProProcessor(),
    };
  }

  static async getRecommendedType(): Promise<'basic' | 'pro'> {
    const hasPro = await AccessChecker.hasProAccess();
    return hasPro ? 'pro' : 'basic';
  }

  static async checkProModuleStatus(): Promise<{
    hasPro: boolean;
    hasModule: boolean;
    needsDownload: boolean;
  }> {
    const hasPro = await AccessChecker.hasProAccess();
    const localVersion = ProDownloader.getLocalVersion();
    const hasModule = !!localVersion;

    return {
      hasPro,
      hasModule,
      needsDownload: hasPro && !hasModule,
    };
  }
}
