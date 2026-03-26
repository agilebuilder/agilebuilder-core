/**
 * 模板处理器类型定义
 */

import type { Template } from '../shared/types.js';

/**
 * 克隆选项
 */
export interface CloneOptions {
  /** 模板 */
  template: Template;
  /** 目标路径 */
  targetPath: string;
  /** 变量（Pro 功能） */
  variables?: Record<string, any>;
  /** 跳过 Git 历史 */
  skipGitHistory?: boolean;
}

/**
 * 克隆结果
 */
export interface CloneResult {
  /** 是否成功 */
  success: boolean;
  /** 目标路径 */
  targetPath: string;
  /** 使用的处理器类型 */
  processorType: 'basic' | 'pro';
  /** 错误信息 */
  error?: string;
  /** 处理的文件数（变量替换） */
  processedFiles?: number;
}

/**
 * 模板处理器接口
 */
export interface TemplateProcessor {
  /** 获取处理器名称 */
  getName(): string;
  
  /** 获取处理器类型 */
  getType(): 'basic' | 'pro';
  
  /** 是否支持变量处理 */
  supportsVariables(): boolean;
  
  /** 克隆模板 */
  clone(options: CloneOptions): Promise<CloneResult>;
}
