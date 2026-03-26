/**
 * 通用工具函数
 */

/**
 * 解析 JSON 字符串，失败返回 null
 */
export function parseJSON<T = any>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * 将对象转为 JSON 字符串
 */
export function stringifyJSON(obj: any): string | null {
  if (!obj) return null;
  try {
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}

/**
 * 延迟函数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 格式化日期时间
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * 验证 Git URL
 */
export function isValidGitUrl(url: string): boolean {
  const gitUrlPattern = /^(https?:\/\/|git@)[\w\-.]+(:\d+)?(\/|:)[\w\-./]+\.git$/i;
  const githubPattern = /^https?:\/\/github\.com\/[\w\-]+\/[\w\-]+$/i;
  const gitlabPattern = /^https?:\/\/gitlab\.com\/[\w\-]+\/[\w\-]+$/i;
  
  return gitUrlPattern.test(url) || githubPattern.test(url) || gitlabPattern.test(url);
}
