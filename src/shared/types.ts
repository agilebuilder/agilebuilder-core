/**
 * 全局类型定义
 */

/**
 * 本地资源基础数据库模型
 */
export interface LocalResource {
  id: number;
  name: string;
  type: 'template' | 'doc';
  description: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 本地模板资源数据库模型
 */
export interface LocalTemplateResource extends LocalResource {
  type: 'template';
  git_url: string;
  branch: string;
  category: string | null;
  template_type: string;
  variables: string | null;
  post_clone_commands: string | null;
  clone_count: number;
  last_cloned_at: string | null;
}

/**
 * 本地文档资源数据库模型
 */
export interface LocalDocResource extends LocalResource {
  type: 'doc';
  uri: string;
  content: string;
  format: string;
  word_count: number;
}

/**
 * 本地资源联合类型
 */
export type LocalResourceRecord = LocalTemplateResource | LocalDocResource;

/**
 * 创建模板资源的输入数据
 */
export interface CreateTemplateInput {
  name: string;
  description?: string;
  git_url: string;
  branch?: string;
  tags?: string[];
  category?: string;
  template_type?: string;
  variables?: Record<string, any>;
  post_clone_commands?: string[];
}

/**
 * 更新模板资源的输入数据
 */
export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  git_url?: string;
  branch?: string;
  tags?: string[];
  category?: string;
  template_type?: string;
  variables?: Record<string, any>;
  post_clone_commands?: string[];
}

/**
 * 创建文档资源的输入数据
 */
export interface CreateDocInput {
  name: string;
  description?: string;
  tags?: string[];
  uri: string;
  content: string;
  format?: string;
}

/**
 * 更新文档资源的输入数据
 */
export interface UpdateDocInput {
  name?: string;
  description?: string;
  tags?: string[];
  uri?: string;
  content?: string;
  format?: string;
}

/**
 * 模板数据库模型（兼容现有处理器接口）
 */
export type Template = LocalTemplateResource;

/**
 * MCP 克隆模板参数
 */
export interface CloneTemplateParams {
  templateName: string;
  targetPath: string;
  projectName?: string;
  skipGitHistory?: boolean;
}

/**
 * MCP 工具响应
 */
export interface MCPToolResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: string;
    suggestion?: string;
    category?: 'auth' | 'permission' | 'network' | 'validation' | 'resource' | 'system';
    retryable?: boolean;
    metadata?: Record<string, any>;
  };
}

/**
 * 模板列表项 (用于 MCP 返回)
 */
export interface TemplateListItem {
  name: string;
  description: string | null;
  category: string | null;
  tags: string[];
  git_url: string;
  branch: string;
  clone_count: number;
  last_cloned_at: string | null;
}

/**
 * 模板详情 (用于 MCP 返回)
 */
export interface TemplateInfo extends TemplateListItem {
  type: string;
  variables: Record<string, any> | null;
  post_clone_commands: string[] | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// Auth 相关类型（Pro 功能）
// ============================================

/**
 * 用户信息
 */
export interface UserInfo {
  id: string;
  email?: string;
  mobile?: string;
  name: string;
  avatar?: string;
}

/**
 * 认证数据（本地加密存储）
 */
export interface AuthData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: UserInfo;
}

/**
 * OAuth Token 响应
 */
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

// ============================================
// License 相关类型（Pro 功能）
// ============================================

/**
 * 权益计划类型
 */
export type PlanType = 'free' | 'trial' | 'pro';

/**
 * Space 计划信息（后端返回格式）
 */
export interface SpacePlan {
  type: PlanType;
  expiresAt: string | null;
  trialDaysRemaining: number | null;
}

/**
 * Space 信息（后端返回格式）
 */
export interface SpaceInfo {
  id: string;
  name: string;
  type: 'personal' | 'team';
  plan: SpacePlan;
  role: 'owner' | 'admin' | 'member';
  features: string[];
}

/**
 * 当前选中的 Space（本地存储格式）
 */
export interface CurrentSpace {
  spaceId: string;
  spaceName: string;
  plan: PlanType;
  features: string[];
  selectedAt: number;
}

/**
 * License 基本信息（后端返回格式）
 */
export interface LicenseInfo {
  issuedAt: string;
  expiresAt: string;
  serverTime: string;
}

/**
 * License 用户信息（后端返回格式）
 */
export interface LicenseUserInfo {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  hasPro: boolean;
}

/**
 * License 数据（后端返回的 data 部分）
 */
export interface LicenseData {
  license: LicenseInfo;
  user: LicenseUserInfo;
  spaces: SpaceInfo[];
}

/**
 * License 签名声明内容
 */
export interface SignedClaims<T = unknown> {
  data: T;
  timestamp: number;
  jti: string;
  deviceId?: string;
  clientType?: string;
}

export type LicenseClaims = SignedClaims<LicenseData>;

/**
 * License 签名信息（后端返回格式）
 */
export interface LicenseSignature {
  payload: string;       // Base64 编码的数据
  sign: string;          // RSA-SHA256 签名
  algorithm: string;     // 算法标识，如 'RS256'
  timestamp: number;     // 签名时间戳
}

/**
 * 服务端返回的完整 License 响应
 */
export interface LicenseResponse {
  data: LicenseData;
  signature: LicenseSignature;
}

export interface SignedDataResponse<T = unknown> {
  data: T;
  signature: LicenseSignature;
}

// ============================================
// Pro 模块相关类型
// ============================================

/**
 * Pro 模块元信息
 */
export interface ProModuleMeta {
  version: string;
  minCliVersion: string;
  sha256: string;
  size: number;
  updatedAt: string;
  features: string[];
}

export type SignedProModuleMeta = SignedDataResponse<ProModuleMeta>;

/**
 * Pro 模块接口定义
 */
export interface ProModule {
  version: string;

  /** 处理模板变量 */
  processVariables(
    content: string,
    variables: Record<string, any>
  ): string;

  /** 带变量替换的克隆 */
  cloneWithVariables(
    template: Template,
    targetPath: string,
    variables: Record<string, any>
  ): Promise<void>;

  /** 执行生命周期钩子 */
  executeHooks?(
    hookType: 'pre-clone' | 'post-clone',
    context: any
  ): Promise<void>;

  /** 从模板定义生成项目 (新 API) */
  generate?(
    definition: ProjectTemplateDefinition,
    options: ProjectGenerateOptions
  ): Promise<ProjectGenerateResult>;
}

/**
 * 项目模板定义 (Pro 模块新 API)
 */
export interface ProjectTemplateDefinition {
  id: string;
  version: string;
  source: TemplateSourceConfig;
  variables: VariableConfig;
  hooks: HooksDefinition;
}

/**
 * 模板来源配置
 */
export interface TemplateSourceConfig {
  type: 'git' | 'upload' | 'editor';
  git?: { repo: string; branch: string; subfolder?: string };
  upload?: { fileId: string; fileUrl: string; fileName: string };
  editor?: { files: Array<{ path: string; content: string }> };
}

/**
 * 变量配置
 */
export interface VariableConfig {
  enabled: boolean;
  filePatterns: { mode: 'all' | 'include' | 'exclude'; patterns: string[] };
  delimiter?: string;
  formSchema?: FormSchema;
  /** Inquirer 问题列表（可直接用于 inquirer） */
  inquirerQuestions?: InquirerQuestion[];
}

/**
 * Inquirer 问题定义
 */
export interface InquirerQuestion {
  name: string;
  type: 'input' | 'number' | 'confirm' | 'list' | 'rawlist' | 'checkbox' | 'password' | 'editor';
  message: string;
  default?: any;
  choices?: Array<{ name: string; value: any } | string>;
  validateExpression?: string;
  filterExpression?: string;
  whenExpression?: string;
  transformerExpression?: string;
  metadata?: Record<string, any>;
}

/**
 * 表单 Schema
 */
export interface FormSchema {
  title?: string;
  description?: string;
  fields: FormField[];
}

/**
 * 表单字段
 */
export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select' | 'multiselect' | 'password';
  default?: any;
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: Array<{ label: string; value: any }>;
}

/**
 * 钩子定义
 */
export interface HooksDefinition {
  before_fetch?: HookConfig;
  after_fetch?: HookConfig;
  after_form?: HookConfig;
  after_compile?: HookConfig;
  after_write?: HookConfig;
}

/**
 * 钩子配置
 */
export interface HookConfig {
  stage: string;
  scriptType: 'nodejs' | 'shell' | 'custom';
  script: string;
  errorHandling: 'stop' | 'continue' | 'warn';
  env?: Record<string, string>;
}

/**
 * 项目生成选项
 */
export interface ProjectGenerateOptions {
  targetDir: string;
  templateId?: string;
  variables?: Record<string, any>;
  interactive?: boolean;
  overwrite?: boolean;
  onProgress?: (progress: { stage: string; message: string }) => void;
  onLog?: (message: string) => void;
}

/**
 * 项目生成结果
 */
export interface ProjectGenerateResult {
  success: boolean;
  targetDir?: string;
  filesWritten?: string[];
  filesSkipped?: string[];
  variables?: Record<string, any>;
  duration?: number;
  error?: string;
  logs?: string[];
}

// ============================================
// 模板处理器接口
// ============================================

/**
 * 克隆选项
 */
export interface CloneOptions {
  template: Template;
  targetPath: string;
  variables?: Record<string, any>;
  skipGitHistory?: boolean;
}

/**
 * 模板处理器接口
 */
export interface TemplateProcessor {
  /** 克隆模板 */
  clone(options: CloneOptions): Promise<void>;

  /** 是否支持变量处理 */
  supportsVariables(): boolean;

  /** 获取处理器名称 */
  getName(): string;
}

// ============================================
// 资源树相关类型（Cloud 资源管理）
// ============================================

/**
 * 资源类型
 */
export type ResourceType = 'template' | 'pipeline' | 'doc';

/**
 * 节点类型
 */
export type NodeType = 'folder' | 'resource';

/**
 * 工作区树节点（后端返回格式）
 */
export interface WorkspaceTreeNode {
  id: string;
  name: string;
  type: NodeType;
  hasChildren: boolean;
  resourceId?: string;
  resourceType?: ResourceType;
  sortOrder: number;
}

/**
 * 面包屑节点
 */
export interface BreadcrumbNode {
  id: string;
  name: string;
  type: NodeType;
}

/**
 * 获取目录树响应
 */
export interface TreeResponse {
  items: WorkspaceTreeNode[];
  parentId?: string;
}

/**
 * 获取面包屑响应
 */
export interface BreadcrumbResponse {
  items: BreadcrumbNode[];
}

/**
 * 云端资源列表项（client resources 接口）
 */
export interface CloudResourceListItem {
  id: string;
  spaceId: string;
  spaceName?: string;
  name: string;
  type: ResourceType;
  description?: string;
  tags: string[];
  nodeId?: string;
  path?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 云端资源列表响应（client resources 接口）
 */
export interface CloudResourceListResponse {
  items: CloudResourceListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 资源详情（后端返回格式）
 */
export interface ResourceDetail {
  id: string;
  name: string;
  type: ResourceType;
  description?: string;
  tags: string[];
  version: number;
  published: boolean;
  createdAt: string;
  updatedAt: string;
  // 模板特有字段
  template?: {
    sourceType?: 'git' | 'upload' | 'editor';
    definition?: {
      version: string;
      source: {
        type: 'git' | 'upload' | 'editor';
        git?: {
          repo: string;
          branch: string;
          subfolder?: string;
        };
        upload?: {
          fileId: string;
          fileUrl: string;
          fileName: string;
          fileSize: number;
          uploadedAt: string;
        };
        editor?: {
          files: Array<{
            path: string;
            content: string;
            language?: string;
          }>;
        };
      };
      variables: {
        enabled: boolean;
        filePatterns: {
          mode: 'all' | 'include' | 'exclude';
          patterns: string[];
        };
        delimiter?: string;
        formSchema?: Record<string, any>;
        inquirerQuestions?: InquirerQuestion[];
      };
      hooks: Record<string, any>;
    };
    readme?: string;
    usageCount?: number;
  };
  // Pipeline 特有字段
  pipeline?: {
    definition?: Record<string, any>;
    metadata?: Record<string, any>;
  };
  // 文档特有字段
  doc?: {
    content?: string;
    format?: string;
    wordCount?: number;
  };
}

/**
 * 资源树缓存数据
 */
export interface ResourceTreeCache {
  spaceId: string;
  spaceName: string;
  updatedAt: number;
  nodes: Map<string | null, WorkspaceTreeNode[]>; // parentId -> children
}

/**
 * 资源树缓存存储格式（JSON 序列化）
 */
export interface ResourceTreeCacheStorage {
  spaceId: string;
  spaceName: string;
  updatedAt: number;
  nodes: Array<{
    parentId: string | null;
    children: WorkspaceTreeNode[];
  }>;
}
