/**
 * 基础模板处理器（开源版）
 * 
 * 提供基本的 Git 克隆功能
 */

import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { simpleGit } from 'simple-git';
import type { TemplateProcessor, CloneOptions, CloneResult } from './types.js';

export class BasicProcessor implements TemplateProcessor {
  
  getName(): string {
    return 'Basic Processor';
  }
  
  getType(): 'basic' | 'pro' {
    return 'basic';
  }
  
  supportsVariables(): boolean {
    return false;
  }
  
  async clone(options: CloneOptions): Promise<CloneResult> {
    const { template, targetPath, skipGitHistory = true } = options;
    
    try {
      const git = simpleGit();
      
      // 克隆仓库
      await git.clone(template.git_url, targetPath, [
        '--branch',
        template.branch,
        '--single-branch',
        '--depth',
        '1',
      ]);
      
      // 如果跳过历史，删除 .git 目录
      if (skipGitHistory) {
        const gitDir = `${targetPath}/.git`;
        if (existsSync(gitDir)) {
          await rm(gitDir, { recursive: true, force: true });
        }
      }
      
      return {
        success: true,
        targetPath,
        processorType: 'basic',
      };
    } catch (error) {
      return {
        success: false,
        targetPath,
        processorType: 'basic',
        error: error instanceof Error ? error.message : 'Unknown error during clone',
      };
    }
  }
}
