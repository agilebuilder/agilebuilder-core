/**
 * License 模块导出
 */

// 设备 ID
export { getDeviceId, isValidDeviceId } from './device.js';

// License 存储
export { LicenseStore } from './license-store.js';

// Space 管理
export { SpaceManager } from './space.js';

// API 客户端
export { LicenseApi } from './api.js';

// 签名验证
export { 
  verifyLicenseSignature, 
  verifyLicenseResponse,
  isPublicKeyConfigured,
} from './signature.js';

// 权益检查
export { AccessChecker, PRO_FEATURES } from './checker.js';
export type { ProFeature, AccessCheckResult } from './checker.js';
