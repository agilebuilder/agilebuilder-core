/**
 * 设备管理 API 客户端
 * 
 * 对接后端 /api/client/device/* 接口
 */

import { APP_VERSION, CLIENT_TYPE } from '../shared/constants.js';
import { ApiClient } from '../shared/api-client.js';
import { getDeviceId } from '../license/device.js';
import { TokenStore } from '../auth/token-store.js';
import { platform, release, hostname } from 'os';
import { t } from '../i18n/index.js';

/**
 * 设备信息
 */
export interface DeviceInfo {
  id: string;
  deviceId: string;
  deviceType: string;
  deviceName: string;
  os: string;
  osVersion: string;
  clientVersion: string;
  lastActiveAt: string;
  lastIp: string;
  status: 'active' | 'revoked';
  isCurrent: boolean;
  createdAt: string;
}

/**
 * 设备列表响应
 */
interface DeviceListResponse {
  devices: DeviceInfo[];
  total: number;
  activeCount: number;
}

/**
 * 获取操作系统名称
 */
function getOsName(): string {
  const p = platform();
  switch (p) {
    case 'win32': return 'Windows';
    case 'darwin': return 'macOS';
    case 'linux': return 'Linux';
    default: return p;
  }
}

/**
 * 设备管理 API
 */
export class DeviceApi {
  
  /**
   * 注册设备
   * 
   * 对接后端: POST /api/client/device/register
   */
  static async register(): Promise<{
    success: boolean;
    isNew?: boolean;
    error?: string;
  }> {
    const token = await TokenStore.getValidToken();
    if (!token) {
      return { success: false, error: t('device.notLoggedInError') };
    }
    
    const result = await ApiClient.post<{ isNew: boolean }>(
      '/api/client/device/register',
      {
        deviceId: getDeviceId(),
        deviceName: hostname(),
        deviceType: CLIENT_TYPE,
        os: getOsName(),
        osVersion: release(),
        clientVersion: APP_VERSION,
      },
      { token }
    );
    
    return {
      success: result.success,
      isNew: result.data?.isNew,
      error: result.error,
    };
  }
  
  /**
   * 获取设备列表
   * 
   * 对接后端: GET /api/client/device/list
   */
  static async list(): Promise<{
    success: boolean;
    data?: DeviceListResponse;
    error?: string;
  }> {
    const token = await TokenStore.getValidToken();
    if (!token) {
      return { success: false, error: t('device.notLoggedInError') };
    }
    
    return ApiClient.get<DeviceListResponse>('/api/client/device/list', { token });
  }
  
  /**
   * 撤销设备
   * 
   * 对接后端: POST /api/client/device/revoke
   */
  static async revoke(deviceId: string, reason?: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const token = await TokenStore.getValidToken();
    if (!token) {
      return { success: false, error: t('device.notLoggedInError') };
    }
    
    return ApiClient.post(
      '/api/client/device/revoke',
      { deviceId, reason: reason || t('device.revokeReasonUserInitiated') },
      { token }
    );
  }
  
  /**
   * 撤销所有其他设备
   * 
   * 对接后端: POST /api/client/device/revoke-all
   */
  static async revokeAll(): Promise<{
    success: boolean;
    revokedCount?: number;
    error?: string;
  }> {
    const token = await TokenStore.getValidToken();
    if (!token) {
      return { success: false, error: t('device.notLoggedInError') };
    }
    
    const result = await ApiClient.post<{ revokedCount: number }>(
      '/api/client/device/revoke-all',
      {},
      { token }
    );
    
    return {
      success: result.success,
      revokedCount: result.data?.revokedCount,
      error: result.error,
    };
  }
}
