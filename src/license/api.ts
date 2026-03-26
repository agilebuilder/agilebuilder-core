/**
 * License API 客户端
 * 
 * 封装与 Workspace 后端的 License API 交互
 */

import { CLIENT_TYPE } from '../shared/constants.js';
import { ApiClient } from '../shared/api-client.js';
import { getDeviceId } from './device.js';
import type { LicenseResponse, SpaceInfo } from '../shared/types.js';

/**
 * License API 客户端
 */
export class LicenseApi {
  
  /**
   * 获取 License
   * 
   * 对接后端: GET /api/client/license
   */
  static async getLicense(accessToken: string): Promise<{
    success: boolean;
    data?: LicenseResponse;
    error?: string;
  }> {
    // 真实 API
    return ApiClient.get<LicenseResponse>('/api/client/license', { token: accessToken });
  }
  
  /**
   * 刷新 License
   * 
   * 对接后端: POST /api/client/license/refresh
   */
  static async refreshLicense(accessToken: string): Promise<{
    success: boolean;
    data?: LicenseResponse;
    error?: string;
  }> {
    return ApiClient.post<LicenseResponse>(
      '/api/client/license/refresh',
      { deviceId: getDeviceId(), clientType: CLIENT_TYPE },
      { token: accessToken }
    );
  }
  
  /**
   * 获取 Space 列表
   * 
   * 注意：Space 列表已包含在 License 响应中，此方法用于单独获取
   */
  static async getSpaces(accessToken: string): Promise<{
    success: boolean;
    data?: SpaceInfo[];
    error?: string;
  }> {
    // Space 数据从 License 中获取
    const licenseResult = await this.getLicense(accessToken);
    
    if (!licenseResult.success || !licenseResult.data) {
      return {
        success: false,
        error: licenseResult.error,
      };
    }
    
    return {
      success: true,
      data: licenseResult.data.data.spaces,
    };
  }
}
