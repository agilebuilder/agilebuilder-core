/**
 * 资源定义转换器
 * 将 ResourceDetail 转换为 ProjectTemplateDefinition
 */

import type {
  ResourceDetail,
  ProjectTemplateDefinition,
  TemplateSourceConfig,
  VariableConfig,
  HooksDefinition,
} from '../shared/types.js';
import { t } from '../i18n/index.js';

/**
 * 将资源详情转换为项目模板定义
 */
export function convertToTemplateDefinition(
  resource: ResourceDetail
): ProjectTemplateDefinition {
  const template = resource.template;
  const definition = template?.definition;

  if (!definition) {
    throw new Error(t('resource.definitionMissing', { id: resource.id }));
  }

  return {
    id: resource.id,
    version: definition.version || '1.0',
    source: definition.source as TemplateSourceConfig,
    variables: convertVariableConfig(definition.variables),
    hooks: (definition.hooks || {}) as HooksDefinition,
  };
}

/**
 * 转换变量配置（处理类型差异）
 */
function convertVariableConfig(variables: {
  enabled: boolean;
  filePatterns: {
    mode: 'all' | 'include' | 'exclude';
    patterns: string[];
  };
  delimiter?: string;
  formSchema?: Record<string, any>;
  inquirerQuestions?: Array<Record<string, any>>;
}): VariableConfig {
  return {
    enabled: variables.enabled,
    filePatterns: variables.filePatterns,
    delimiter: variables.delimiter || '%',
    formSchema: variables.formSchema as VariableConfig['formSchema'],
    inquirerQuestions: variables.inquirerQuestions as VariableConfig['inquirerQuestions'],
  };
}

/**
 * 检查资源是否支持新的生成器
 */
export function supportsNewGenerator(resource: ResourceDetail): boolean {
  return resource.type === 'template' && !!resource.template;
}
