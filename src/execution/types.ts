/**
 * 执行历史记录类型定义
 */

// 执行状态
export type ExecutionStatus = 'idle' | 'preparing' | 'running' | 'success' | 'failed' | 'cancelled';

// 日志条目
export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

// 资源信息（简化版）
export interface ResourceInfo {
  id: string;
  name: string;
  type: string;
  description?: string;
}

// 执行记录
export interface ExecutionRecord {
  id: string;
  resource: ResourceInfo;
  targetPath: string;
  parameters: Record<string, unknown>;
  status: ExecutionStatus;
  startedAt: number;
  finishedAt?: number;
  logs: LogEntry[];
  error?: string;
}

// 执行历史数据结构
export interface ExecutionHistoryData {
  records: ExecutionRecord[];
  maxRecords: number;
}
