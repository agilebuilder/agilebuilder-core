export interface UserInfo {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
  avatar?: string;
}

export interface OAuthAuthData {
  authType: 'oauth';
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: UserInfo;
}

export interface ApiKeyAuthData {
  authType: 'apiKey';
  apiKey: string;
  createdAt: number;
  user?: UserInfo;
}

export type AuthData = OAuthAuthData | ApiKeyAuthData;

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user?: Record<string, unknown>;
}
