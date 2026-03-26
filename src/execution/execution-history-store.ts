/**
 * 执行历史存储
 *
 * 本地JSON文件存储，CLI和GUI共享
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync
} from 'fs';
import { dirname } from 'path';
import { join } from 'path';
import { getDataDir } from '../shared/paths.js';
import type { ExecutionRecord, ExecutionHistoryData } from './types.js';

// 默认配置
const DEFAULT_MAX_RECORDS = 100;
const HISTORY_FILE_NAME = 'execution-history.json';

/**
 * 获取执行历史文件路径
 */
function getHistoryFilePath(): string {
  return join(getDataDir(), HISTORY_FILE_NAME);
}

/**
 * 执行历史存储管理器
 */
export class ExecutionHistoryStore {

  /**
   * 保存执行历史数据
   */
  static save(data: ExecutionHistoryData): void {
    const historyFile = getHistoryFilePath();
    const dir = dirname(historyFile);

    // 确保目录存在
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // 写入JSON文件
    writeFileSync(historyFile, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * 读取执行历史数据
   */
  static load(): ExecutionHistoryData {
    const historyFile = getHistoryFilePath();

    if (!existsSync(historyFile)) {
      return {
        records: [],
        maxRecords: DEFAULT_MAX_RECORDS,
      };
    }

    try {
      const content = readFileSync(historyFile, 'utf-8');
      const data = JSON.parse(content) as ExecutionHistoryData;

      // 确保数据结构完整
      return {
        records: data.records || [],
        maxRecords: data.maxRecords || DEFAULT_MAX_RECORDS,
      };
    } catch {
      // 文件损坏，返回空数据
      return {
        records: [],
        maxRecords: DEFAULT_MAX_RECORDS,
      };
    }
  }

  /**
   * 添加一条执行记录
   */
  static add(record: ExecutionRecord): void {
    const data = this.load();

    // 添加到开头
    data.records.unshift(record);

    // 限制记录数量
    if (data.records.length > data.maxRecords) {
      data.records = data.records.slice(0, data.maxRecords);
    }

    this.save(data);
  }

  /**
   * 获取所有执行记录
   */
  static getAll(): ExecutionRecord[] {
    const data = this.load();
    return data.records;
  }

  /**
   * 根据ID获取执行记录
   */
  static getById(id: string): ExecutionRecord | null {
    const data = this.load();
    return data.records.find(r => r.id === id) || null;
  }

  /**
   * 删除一条执行记录
   */
  static deleteById(id: string): boolean {
    const data = this.load();
    const initialLength = data.records.length;
    data.records = data.records.filter(r => r.id !== id);

    if (data.records.length < initialLength) {
      this.save(data);
      return true;
    }
    return false;
  }

  /**
   * 清空所有执行记录
   */
  static clear(): void {
    const historyFile = getHistoryFilePath();

    if (existsSync(historyFile)) {
      unlinkSync(historyFile);
    }
  }

  /**
   * 获取记录数量
   */
  static count(): number {
    const data = this.load();
    return data.records.length;
  }
}
