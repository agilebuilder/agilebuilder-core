/**
 * 设备 ID 管理
 * 
 * 生成并持久化唯一设备标识，用于 License 绑定
 */

import { createHash, randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { homedir, hostname, platform, arch, cpus, networkInterfaces } from 'os';
import { getDeviceFilePath } from '../shared/paths.js';

/**
 * 获取机器特征指纹
 * 
 * 基于以下信息生成：
 * - 主机名
 * - 操作系统
 * - CPU 型号
 * - 第一个非内部网卡的 MAC 地址
 */
function getMachineFingerprint(): string {
  const parts: string[] = [];
  
  // 主机名
  parts.push(hostname());
  
  // 操作系统信息
  parts.push(platform());
  parts.push(arch());
  
  // CPU 信息
  const cpu = cpus()[0];
  if (cpu) {
    parts.push(cpu.model);
  }
  
  // MAC 地址（获取第一个非内部网卡）
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    const netList = nets[name];
    if (!netList) continue;
    
    for (const net of netList) {
      // 跳过内部地址和 IPv6
      if (!net.internal && net.family === 'IPv4' && net.mac !== '00:00:00:00:00:00') {
        parts.push(net.mac);
        break;
      }
    }
  }
  
  // 用户主目录（作为额外标识）
  parts.push(homedir());
  
  return parts.join(':');
}

/**
 * 生成设备 ID
 * 
 * 使用机器指纹 + 随机盐值生成 SHA256 哈希
 */
function generateDeviceId(): string {
  const fingerprint = getMachineFingerprint();
  const salt = randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  
  const hash = createHash('sha256')
    .update(`${fingerprint}:${salt}:${timestamp}`)
    .digest('hex');
  
  // 返回前 32 位作为设备 ID
  return hash.substring(0, 32);
}

/**
 * 获取或创建设备 ID
 * 
 * 首次调用时生成并保存，后续调用返回已保存的 ID
 */
export function getDeviceId(): string {
  const deviceFile = getDeviceFilePath();
  
  // 如果已存在，直接返回
  if (existsSync(deviceFile)) {
    try {
      const content = readFileSync(deviceFile, 'utf-8').trim();
      if (content && content.length === 32) {
        return content;
      }
    } catch {
      // 读取失败，重新生成
    }
  }
  
  // 生成新的设备 ID
  const deviceId = generateDeviceId();
  
  // 保存到文件
  const dir = dirname(deviceFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(deviceFile, deviceId, 'utf-8');
  
  return deviceId;
}

/**
 * 验证设备 ID 格式
 */
export function isValidDeviceId(deviceId: string): boolean {
  return typeof deviceId === 'string' && /^[a-f0-9]{32}$/.test(deviceId);
}
