/**
 * PKCE (Proof Key for Code Exchange) 工具
 * 
 * 用于 OAuth 2.0 授权码模式的安全增强
 * 适用于 Public 客户端（CLI、SPA、移动端）
 */

import { randomBytes, createHash } from 'crypto';

/**
 * PKCE 参数
 */
export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * 生成随机字符串
 * @param length 字节长度（最终字符串长度为 length * 2）
 */
function generateRandomString(length: number): string {
  return randomBytes(length).toString('hex');
}

/**
 * 生成 code_challenge（SHA256 哈希 + Base64URL 编码）
 * @param verifier code_verifier 原始值
 */
function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest();
  
  // Base64URL 编码（替换 + 为 -，/ 为 _，去掉 =）
  return hash.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * 生成 PKCE 参数
 * 
 * @returns PKCE 参数对象
 * 
 * @example
 * const pkce = generatePKCE();
 * // 授权请求时使用 pkce.codeChallenge
 * // 换取 Token 时使用 pkce.codeVerifier
 */
export function generatePKCE(): PKCEParams {
  // 生成 32 字节（64 字符）的随机 code_verifier
  const codeVerifier = generateRandomString(32);
  
  // 生成 code_challenge
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

/**
 * 生成随机 state 参数（防 CSRF）
 * @param length 字节长度
 */
export function generateState(length: number = 16): string {
  return generateRandomString(length);
}
