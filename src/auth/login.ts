/**
 * OAuth 登录流程
 * 
 * 使用 OAuth 2.0 授权码模式 + PKCE 进行登录
 * 1. 启动本地 HTTP 服务器接收回调
 * 2. 打开浏览器跳转到 SSO 登录页
 * 3. 用户登录后 SSO 重定向回本地服务器
 * 4. 接收授权码并换取 Token
 */

import http from 'http';
import open from 'open';
import { URL } from 'url';
import { generatePKCE, generateState } from './pkce.js';
import { findAvailablePort, getCallbackUrl } from './port-finder.js';
import { TokenStore } from './token-store.js';
import { getSsoBaseUrl, OAUTH_CLIENT_ID } from '../shared/constants.js';
import { proxyFetch } from '../shared/http-client.js';
import { t } from '../i18n/index.js';
import type { AuthData, OAuthTokenResponse } from '../shared/types.js';

/**
 * 登录结果
 */
export interface LoginResult {
  success: boolean;
  user?: {
    id: string;
    name: string;
    email?: string;
    mobile?: string;
  };
  error?: string;
}

function summarizeTokenResponse(result: Record<string, any>): Record<string, any> {
  const tokenData = result.data || result;

  return {
    hasAccessToken: typeof tokenData?.access_token === 'string',
    hasRefreshToken: typeof tokenData?.refresh_token === 'string',
    hasUser: !!tokenData?.user,
    keys: Object.keys(tokenData || {}),
    success: result.success,
  };
}

/**
 * 登录回调 HTML 页面
 */
function getSuccessHtml(userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('auth.successTitle')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(165deg, #f8fbfd 0%, #e8f4fa 50%, #f0f7fb 100%);
      position: relative;
      overflow: hidden;
    }
    body::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -30%;
      width: 80%;
      height: 80%;
      background: radial-gradient(circle, rgba(29,126,185,0.06) 0%, transparent 70%);
      pointer-events: none;
    }
    body::after {
      content: '';
      position: absolute;
      bottom: -30%;
      left: -20%;
      width: 60%;
      height: 60%;
      background: radial-gradient(circle, rgba(29,126,185,0.04) 0%, transparent 70%);
      pointer-events: none;
    }
    .card {
      background: rgba(255,255,255,0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.9);
      border-radius: 24px;
      padding: 56px 64px;
      text-align: center;
      box-shadow:
        0 4px 24px rgba(29,126,185,0.08),
        0 1px 3px rgba(0,0,0,0.04);
      animation: slideUp 0.5s cubic-bezier(0.16,1,0.3,1);
      position: relative;
      z-index: 1;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .icon-wrapper {
      position: relative;
      width: 72px;
      height: 72px;
      margin: 0 auto 32px;
    }
    .icon-glow {
      position: absolute;
      inset: -8px;
      background: radial-gradient(circle, rgba(29,126,185,0.2) 0%, transparent 70%);
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.6; }
      50% { transform: scale(1.1); opacity: 0.3; }
    }
    .icon {
      position: relative;
      width: 72px;
      height: 72px;
      background: linear-gradient(135deg, #1d7eb9 0%, #2a9bd6 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(29,126,185,0.35);
    }
    .icon svg {
      width: 32px;
      height: 32px;
      stroke: white;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      animation: checkDraw 0.6s ease-out 0.2s both;
    }
    @keyframes checkDraw {
      from { stroke-dasharray: 30; stroke-dashoffset: 30; }
      to { stroke-dasharray: 30; stroke-dashoffset: 0; }
    }
    h1 {
      color: #1a2b3c;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.4px;
      margin-bottom: 8px;
    }
    .user {
      color: #1d7eb9;
      font-size: 16px;
      font-weight: 500;
      margin-bottom: 28px;
    }
    .divider {
      width: 40px;
      height: 2px;
      background: linear-gradient(90deg, transparent, rgba(29,126,185,0.3), transparent);
      margin: 0 auto 20px;
    }
    .hint {
      font-size: 13px;
      color: #8899a8;
      letter-spacing: 0.2px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrapper">
      <div class="icon-glow"></div>
      <div class="icon">
        <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </div>
    </div>
    <h1>${t('auth.successHeading')}</h1>
    <p class="user">${userName}</p>
    <div class="divider"></div>
    <p class="hint">${t('auth.closeWindow')}</p>
  </div>
</body>
</html>
`;
}

function getErrorHtml(error: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('auth.errorTitle')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(165deg, #fdfafa 0%, #faf0f0 50%, #fbf2f2 100%);
      position: relative;
      overflow: hidden;
    }
    body::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -30%;
      width: 80%;
      height: 80%;
      background: radial-gradient(circle, rgba(220,68,70,0.05) 0%, transparent 70%);
      pointer-events: none;
    }
    .card {
      background: rgba(255,255,255,0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.9);
      border-radius: 24px;
      padding: 56px 64px;
      text-align: center;
      max-width: 420px;
      box-shadow:
        0 4px 24px rgba(220,68,70,0.06),
        0 1px 3px rgba(0,0,0,0.04);
      animation: slideUp 0.5s cubic-bezier(0.16,1,0.3,1);
      position: relative;
      z-index: 1;
    }
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .icon-wrapper {
      position: relative;
      width: 72px;
      height: 72px;
      margin: 0 auto 32px;
    }
    .icon-glow {
      position: absolute;
      inset: -8px;
      background: radial-gradient(circle, rgba(220,68,70,0.15) 0%, transparent 70%);
      border-radius: 50%;
    }
    .icon {
      position: relative;
      width: 72px;
      height: 72px;
      background: linear-gradient(135deg, #dc4446 0%, #e85d5f 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 24px rgba(220,68,70,0.3);
    }
    .icon svg {
      width: 28px;
      height: 28px;
      stroke: white;
      stroke-width: 2.5;
      stroke-linecap: round;
      fill: none;
    }
    h1 {
      color: #1a2b3c;
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.4px;
      margin-bottom: 24px;
    }
    .error {
      font-size: 13px;
      color: #6b7280;
      background: rgba(0,0,0,0.03);
      padding: 14px 18px;
      border-radius: 12px;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      word-break: break-word;
      line-height: 1.5;
      border: 1px solid rgba(0,0,0,0.04);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-wrapper">
      <div class="icon-glow"></div>
      <div class="icon">
        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </div>
    </div>
    <h1>${t('auth.errorHeading')}</h1>
    <p class="error">${error}</p>
  </div>
</body>
</html>
`;
}

/**
 * 用授权码换取 Token
 */
async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<OAuthTokenResponse & { user?: any }> {
  const response = await proxyFetch(`${getSsoBaseUrl()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(t('auth.tokenExchangeFailed', {
      status: response.status,
      details: errorText,
    }));
  }
  
  const result = await response.json() as any;
  
  // 调试：打印完整的 token 响应
  if (process.env.DEBUG) {
    console.log('[DEBUG] Token response summary:', JSON.stringify(summarizeTokenResponse(result), null, 2));
  }
  
  // 适配 SSO 返回格式：{ success, data: { access_token, user, ... } }
  const tokenData = result.data || result;
  
  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_type: tokenData.token_type || 'Bearer',
    expires_in: tokenData.expires_in || 7200,
    user: tokenData.user,
  };
}

/**
 * 登录选项
 */
export interface LoginOptions {
  /** 授权 URL 生成后的回调，用于显示手动访问地址 */
  onAuthUrl?: (url: string) => void;
}

/**
 * 执行 OAuth 登录流程
 *
 * @param options 登录选项
 * @returns 登录结果
 *
 * @example
 * const result = await login({
 *   onAuthUrl: (url) => console.log(`请访问: ${url}`)
 * });
 * if (result.success) {
 *   console.log(`欢迎, ${result.user.name}`);
 * }
 */
export async function login(options: LoginOptions = {}): Promise<LoginResult> {
  // 1. 查找可用端口
  const port = await findAvailablePort();
  const redirectUri = getCallbackUrl(port);
  
  // 2. 生成 PKCE 参数和 state
  const pkce = generatePKCE();
  const state = generateState();
  
  // 3. 构建授权 URL
  const authUrl = new URL(`${getSsoBaseUrl()}/oauth/authorize`);
  authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
  authUrl.searchParams.set('code_challenge_method', pkce.codeChallengeMethod);

  // 通知调用方授权 URL（用于手动访问）
  if (options.onAuthUrl) {
    options.onAuthUrl(authUrl.toString());
  }

  // 4. 创建 Promise 来等待回调
  return new Promise((resolve) => {
    let resolved = false;
    
    // 创建 HTTP 服务器
    const server = http.createServer(async (req, res) => {
      if (resolved) return;
      
      const reqUrl = new URL(req.url || '', `http://127.0.0.1:${port}`);
      
      // 只处理回调路径
      if (reqUrl.pathname !== '/callback') {
        res.writeHead(404);
        res.end(t('auth.notFound'));
        return;
      }
      
      const code = reqUrl.searchParams.get('code');
      const returnedState = reqUrl.searchParams.get('state');
      const error = reqUrl.searchParams.get('error');
      const errorDescription = reqUrl.searchParams.get('error_description');
      
      // 检查错误
      if (error) {
        resolved = true;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getErrorHtml(errorDescription || error));
        server.close();
        resolve({
          success: false,
          error: errorDescription || error,
        });
        return;
      }
      
      // 验证 state
      if (returnedState !== state) {
        resolved = true;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getErrorHtml(t('auth.stateMismatch')));
        server.close();
        resolve({
          success: false,
          error: t('auth.stateMismatch'),
        });
        return;
      }
      
      // 检查授权码
      if (!code) {
        resolved = true;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getErrorHtml(t('auth.codeMissing')));
        server.close();
        resolve({
          success: false,
          error: t('auth.codeMissing'),
        });
        return;
      }
      
      try {
        // 5. 用授权码换取 Token
        const tokenData = await exchangeCodeForToken(code, pkce.codeVerifier, redirectUri);
        
        // 6. 获取用户信息（优先从 token 响应中获取）
        let userInfo;
        if (tokenData.user) {
          // SSO 在 token 响应中直接返回了用户信息
          const u = tokenData.user;
          userInfo = {
            id: u.id || u.userId || '',
            email: u.email,
            mobile: u.mobile || u.phone,
            // SSO 使用 showName 作为显示名称，userName 作为用户名
            name: u.showName || u.name || u.nickname || u.userName || u.email || u.mobile || t('auth.defaultUser'),
            avatar: u.avatar,
          };
        } else {
          // 调用 userinfo 接口
          userInfo = await TokenStore.fetchUserInfo(tokenData.access_token);
        }
        
        // 7. 保存认证数据
        const authData: AuthData = {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000,
          user: userInfo,
        };
        TokenStore.save(authData);
        
        // 8. 返回成功页面
        resolved = true;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getSuccessHtml(userInfo.name));
        server.close();
        
        resolve({
          success: true,
          user: {
            id: userInfo.id,
            name: userInfo.name,
            email: userInfo.email,
            mobile: userInfo.mobile,
          },
        });
      } catch (err) {
        resolved = true;
        const errorMsg = err instanceof Error ? err.message : t('common.unknownError');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getErrorHtml(errorMsg));
        server.close();
        resolve({
          success: false,
          error: errorMsg,
        });
      }
    });
    
    // 启动服务器
    server.listen(port, '127.0.0.1', async () => {
      // 打开浏览器
      try {
        await open(authUrl.toString());
      } catch (err) {
        // Windows 上可能因权限问题无法自动打开浏览器
        // 用户可以通过命令行输出的 URL 手动访问
        if (process.env.DEBUG) {
          console.error('[DEBUG] Failed to open browser:', err instanceof Error ? err.message : String(err));
        }
      }
    });
    
    // 超时处理（3 分钟）
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        server.close();
        resolve({
          success: false,
          error: t('auth.timeout'),
        });
      }
    }, 3 * 60 * 1000);

    // 确保定时器不阻止进程退出
    timeoutId.unref();
  });
}

/**
 * 获取授权 URL（用于手动打开浏览器的场景）
 */
export function getAuthorizationUrl(port: number): { url: string; pkce: ReturnType<typeof generatePKCE>; state: string } {
  const pkce = generatePKCE();
  const state = generateState();
  const redirectUri = getCallbackUrl(port);
  
  const authUrl = new URL(`${getSsoBaseUrl()}/oauth/authorize`);
  authUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
  authUrl.searchParams.set('code_challenge_method', pkce.codeChallengeMethod);
  
  return {
    url: authUrl.toString(),
    pkce,
    state,
  };
}
