import type { TemplateProcessor, CloneOptions, CloneResult } from './types.js';
import type {
  ProModule,
  ResourceDetail,
  ProjectGenerateResult,
} from '../shared/types.js';
import { ProManager } from '../pro-loader/manager.js';
import { ProLoader } from '../pro-loader/loader.js';
import { convertToTemplateDefinition, supportsNewGenerator } from '../resource/definition-converter.js';
import { t } from '../i18n/index.js';

export class ProProcessor implements TemplateProcessor {
  private proModule: ProModule | null = null;

  getName(): string {
    return 'Pro Processor';
  }

  getType(): 'basic' | 'pro' {
    return 'pro';
  }

  supportsVariables(): boolean {
    return true;
  }

  private async ensureLoaded(): Promise<ProModule> {
    if (!this.proModule) {
      if (!ProLoader.isLoaded()) {
        const result = await ProLoader.load();
        if (!result.success) {
          throw new Error(t('pro.processor.loadFailed', { error: result.error }));
        }
      }

      this.proModule = ProManager.getModule();
      if (!this.proModule) {
        throw new Error(t('pro.processor.unavailable'));
      }
    }

    return this.proModule;
  }

  async clone(options: CloneOptions): Promise<CloneResult> {
    const { template, targetPath, variables = {} } = options;

    try {
      const proModule = await this.ensureLoaded();
      await proModule.cloneWithVariables(template, targetPath, variables);

      return {
        success: true,
        targetPath,
        processorType: 'pro',
        processedFiles: Object.keys(variables).length > 0 ? undefined : 0,
      };
    } catch (error) {
      return {
        success: false,
        targetPath,
        processorType: 'pro',
        error: error instanceof Error ? error.message : t('pro.processor.cloneUnknownError'),
      };
    }
  }

  supportsNewGenerator(resource: ResourceDetail): boolean {
    return supportsNewGenerator(resource);
  }

  async generateFromCloud(
    resource: ResourceDetail,
    targetPath: string,
    options?: {
      variables?: Record<string, any>;
      interactive?: boolean;
      overwrite?: boolean;
      onProgress?: (progress: { stage: string; message: string }) => void;
      onLog?: (message: string) => void;
    }
  ): Promise<ProjectGenerateResult> {
    try {
      const proModule = await this.ensureLoaded();
      if (!proModule.generate) {
        throw new Error(t('pro.processor.generateUnsupported'));
      }

      const definition = convertToTemplateDefinition(resource);
      return await proModule.generate(definition, {
        targetDir: targetPath,
        templateId: resource.id,
        variables: options?.variables,
        interactive: options?.interactive,
        overwrite: options?.overwrite,
        onProgress: options?.onProgress,
        onLog: options?.onLog,
      });
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : t('pro.processor.generateUnknownError'),
      };
    }
  }
}
