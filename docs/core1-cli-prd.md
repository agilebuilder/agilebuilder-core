# AgileBuilder Core1 CLI PRD

## 1. 背景

当前 `core` 包已经实现了 CLI、Web UI、MCP、本地资源、云端空间、登录、License 校验以及动态下载的 Pro 模块。但随着功能叠加，启动链路、模块边界和代码质量都变重了，后续需求又需要对 CLI 形态、模板执行、Pro 集成和 AI 调用方式做较大调整，因此 `core1` 采用干净重写。

补充约束：当前 `core` 还没有真实用户，因此 `core1` 不需要兼容旧数据，也不需要提供从 `core` 本地 SQLite、auth、license、resource-cache 等数据迁移的能力。

## 2. 产品目标

1. 提供一个轻量、快速、易维护的 AgileBuilder CLI。
2. 移除 CLI 中的 Web UI，只保留命令行和 MCP 能力。
3. 将原 `pro` 模板生成能力直接集成到 CLI 并开源，不再动态下载 Pro 模块。
4. 支持通过 `--git-url` 直接从 Git 模板仓库创建项目，即使本地没有注册该模板。
5. 在模板仓库根目录定义 AgileBuilder 配置文件，用于控制模板编译、变量、路径处理和 hooks。
6. 保留登录和不登录两种使用模式：不登录只能使用本地空间、本地资源和直接 Git 模板；登录后可以切换本地空间和云端空间。
7. 保留付费权益校验，但只在执行具体受限任务时查询，不在每个命令启动时查询。
8. 让 CLI 默认适合 AI 调用：参数明确、输出稳定、支持 `--json`、默认非交互。
9. MCP 默认读取当前选择空间中的资源；当配置允许不限制空间时，可以跨空间读取资源。
10. 支持 i18n，内置中文和英文两种语言。

## 3. 非目标

1. `core1` 不包含 Web UI。
2. 不兼容旧 `core` 本地数据。
3. 不保留 `pro-loader`、Pro 动态下载、Pro manifest 校验、Pro 更新命令。
4. MVP 不做桌面端集成。
5. MVP 不做模板市场 UI。
6. MVP 不做社区模板发布流程。

## 4. 用户与场景

### 4.1 人类 CLI 用户

- 管理本地资源：新增、查看、搜索、编辑、删除模板和文档。
- 使用 OAuth 或 API Key 登录。
- 切换本地空间和云端空间。
- 从本地资源、云端资源或 Git URL 创建项目。

### 4.2 AI Agent

- 查询当前空间可用资源。
- 读取本地或云端文档资源。
- 根据精确资源 ID 或 Git URL 创建项目。
- 获取结构化错误、建议和下一步操作。

### 4.3 模板作者

- 创建一个 Git 仓库作为模板仓库。
- 在仓库根目录添加 AgileBuilder 配置文件。
- 定义变量、文件匹配、路径编译和 hooks。
- 使用 CLI 本地测试模板生成效果。

## 5. 核心范围

### 5.1 空间模型

`core1` 始终内置一个本地空间。

| 模式 | 是否需要登录 | 能力 |
| --- | --- | --- |
| 本地空间 | 否 | 本地资源、本地文档、直接 Git 模板、内置模板生成 |
| 云端空间 | 是 | 云端资源列表、云端资源详情、云端模板生成、云端文档 |

规则：

1. 用户未登录时，默认有效空间为本地空间。
2. 用户已登录但未选择云端空间时，默认有效空间仍为本地空间。
3. `space use local` 永远可用。
4. 云端资源操作在未登录或 token 不可用时，必须返回可操作的认证错误。

### 5.2 登录认证

支持两种登录方式：

1. OAuth 2.0 + PKCE 浏览器登录。
2. API Key 登录：`ag login --api-key <key>`。

认证存储要求：

1. 认证数据存储在 `core1` 自己的数据目录。
2. 不复用 `core` 的认证文件。
3. OAuth Token 和 API Key 尽量加密存储。
4. OAuth access token 只在云端 API 调用需要时刷新。

### 5.3 License 与权益

必须保留的行为：

1. 通过 `/api/client/license` 或 `/api/client/license/refresh` 获取 License。
2. 对签名 License 响应做公钥验签。
3. License 可以本地缓存。
4. 普通命令启动时不主动获取或刷新 License。
5. 只有执行受限能力时才做权益检查。

需要权益检查的操作：

1. 获取后端要求 Trial/Pro 的云端资源详情。
2. 从需要 Trial/Pro 能力的云端模板创建项目。
3. 后续云同步、团队模板等受限能力。

说明：由于原 Pro 模板引擎会内置并开源，本地高级模板生成不再依赖 Pro 模块下载。

### 5.4 资源管理

MVP 支持两类资源：

1. `template`
2. `doc`

本地资源能力：

1. 新增模板资源。
2. 新增文档资源。
3. 列出资源。
4. 搜索和过滤资源。
5. 查看资源详情。
6. 编辑资源元数据。
7. 删除资源。

云端资源能力：

1. 在当前云端空间内列出和搜索资源。
2. 按需读取资源树。
3. 获取资源详情。
4. 使用云端资源后记录访问。

### 5.5 项目创建

项目创建支持三种来源：

1. 本地资源 ID。
2. 云端资源 ID，可选传入 space ID。
3. 直接 Git URL。

直接 Git URL 要求：

1. `ag create --git-url <url> --target <dir>` 可以直接创建项目，不要求先注册本地资源。
2. 支持参数：`--branch`、`--subdir`、`--vars`、`--var key=value`、`--interactive`、`--overwrite`、`--keep-git`、`--allow-hooks`。
3. 如果仓库根目录存在 AgileBuilder 模板配置文件，则按配置执行。
4. 如果没有配置文件，则按普通 Git 模板复制到目标目录。
5. 可以通过 `--save-resource --name <name>` 把 Git 模板保存成本地资源。

### 5.6 模板配置文件

支持以下文件名，按优先级读取：

1. `agilebuilder.config.json`
2. `agilebuilder.config.yaml`
3. `agilebuilder.yaml`
4. `agilebuilder.yml`

MVP Schema 示例：

```yaml
version: 1
name: react-admin
description: React admin starter
source:
  type: git
  subdir: .
variables:
  enabled: true
  filePatterns:
    mode: include
    patterns:
      - "**/*"
  delimiter: "%"
  inquirerQuestions:
    - name: projectName
      type: input
      message: Project name
      default: my-app
hooks:
  after_write:
    stage: after_write
    scriptType: shell
    script: npm install
    errorHandling: warn
market:
  category: frontend
  tags:
    - react
    - typescript
  version: 1.0.0
```

规则：

1. `version` 必填。
2. `variables.enabled=false` 时，不做内容和路径变量编译。
3. `filePatterns` 控制哪些文件参与编译。
4. 路径编译默认开启。文件路径推荐使用跨平台安全占位符 `{{ variableName }}`，内容编译使用 EJS。
5. shell hooks 默认禁用，只有命令传入 `--allow-hooks` 才允许执行。
6. hook 错误策略支持 `stop`、`warn`、`continue`。

### 5.7 模板引擎

模板引擎从现有 `pro/src/modules/project-generator` 清理迁入 `core1`。

MVP 能力：

1. 从 Git 拉取模板。
2. 支持 editor/in-memory source，便于测试和后续云端编辑器模板。
3. 构建虚拟文件系统。
4. 从 JSON、命令行变量或交互提示收集变量。
5. 使用 EJS 编译文件内容。
6. 编译文件路径。
7. 跳过二进制文件。
8. 限制模板大小和文件数量。
9. 写入目标目录。
10. 只有显式允许时执行 hooks。

必须清理的问题：

1. 删除调试 console 输出。
2. 删除 Pro marker 文件生成。
3. Git 操作使用安全的参数化进程调用或 `simple-git`，不拼接 shell 字符串。
4. 非交互模式严格校验必填变量，缺失则失败。
5. 增加变量收集、EJS 编译、路径编译、hook 策略单元测试。

### 5.8 MCP

MCP 启动命令：

```bash
ag mcp
```

默认行为：

1. 读取当前选择空间。
2. 未登录时回退本地空间。
3. 不在每个 MCP 请求前刷新 License。
4. 只有请求云端资源时才准备云端认证。

配置：

```bash
ag config set mcp.spaceIsolation true
ag config set mcp.spaceIsolation false
```

规则：

1. `mcp.spaceIsolation=true`：MCP 只读当前空间。
2. `mcp.spaceIsolation=false`：MCP 可以搜索用户可访问的其他空间。

MVP MCP tools：

1. `list_resources`
2. `get_resource`
3. `search_resources`
4. `create_project`

MVP MCP resources：

1. 本地文档资源。
2. 当前云端空间文档资源。
3. CLI 内置使用说明和资源目录。

### 5.9 输出规范

1. 所有非交互命令都支持 `--json`。
2. JSON 输出结构稳定并文档化。
3. 人类输出可以使用简洁表格或普通文本。
4. JSON 错误必须包含 `code`、`message`、`suggestion`。
5. 默认不强制交互；只有传入 `--interactive` 或人类命令缺少必要参数时才提示。
6. 输出文本必须走 i18n，不在命令实现中硬编码中英文文案。

### 5.10 i18n

`core1` 必须内置中文和英文：

1. 支持语言：`zh-CN`、`en-US`。
2. 默认配置为 `auto`，根据系统 locale、环境变量和时区推断语言。
3. 用户可以通过 `ag config set language zh-CN` 或 `ag config set language en-US` 固定语言。
4. 命令名称、参数名、JSON 字段名和错误码保持英文稳定，不做本地化。
5. 命令描述、help 文案、人类输出、错误 message、suggestion 需要本地化。
6. JSON 输出中的结构字段保持稳定；`message` 和 `suggestion` 可以按当前语言本地化。
7. MCP tool 名称、参数 schema 字段和错误 code 保持英文稳定；tool description 和错误 message 支持本地化。
8. 缺失翻译时回退到 `en-US`，并在测试中覆盖关键命令的翻译完整性。

## 6. 命令设计

### 6.1 根命令

```bash
ag --help
ag --version
```

根命令不得访问网络，不得执行重初始化。

### 6.2 Auth

```bash
ag login
ag login --api-key <key>
ag logout
ag auth status --json
```

登录成功后可以尝试获取一次 License 来填充云端空间列表，但 License 获取失败不能导致登录失败。

### 6.3 Space

```bash
ag space list --json
ag space current --json
ag space use local
ag space use <space-id>
```

`space list` 默认优先使用缓存 License；只有缓存缺失、过期或传入 `--refresh` 时才访问网络。

### 6.4 Resources

```bash
ag res list --type template --json
ag res search <keyword> --json
ag res get <resource-id> --json
ag res add template --name <name> --git-url <url> --branch main
ag res add doc --name <name> --file ./README.md
ag res edit <resource-id> ...
ag res remove <resource-id> --yes
ag res browse
```

`res browse` 是面向人类的交互式浏览命令。`res list/get/search` 默认面向脚本和 AI。

### 6.5 Create

```bash
ag create <resource-id> --target ./app
ag create <resource-id> --target ./app --vars vars.json
ag create --git-url https://github.com/org/template.git --target ./app
ag create --git-url https://github.com/org/template.git --branch main --subdir starter --target ./app
```

### 6.6 Config

```bash
ag config list --json
ag config get <key>
ag config set <key> <value>
```

重要配置：

1. `backend.profile`: `auto`、`china`、`global`
2. `language`: `auto`、`zh-CN`、`en-US`
3. `mcp.spaceIsolation`: `true`、`false`
4. `template.allowHooksDefault`: `true`、`false`

后端环境内置默认地址：

| Profile | SSO 前端 | SSO 后端 | Workspace 后端 |
| --- | --- | --- | --- |
| `china` | `https://auth.agilebuilder.cn` | `https://api-auth.agilebuilder.cn` | `https://api-app.agilebuilder.cn` |
| `global` | `https://auth.agilebuilder.net` | `https://api-auth.agilebuilder.net` | `https://api-app.agilebuilder.net` |

后端地址固定为 AgileBuilder 官方服务，不支持通过环境变量覆盖，也不支持对接第三方后端服务。

### 6.7 Device

```bash
ag device list --json
ag device revoke <device-id>
ag device revoke-all
```

设备命令必须登录后使用。

## 7. 后端 API 依赖

以后端文档为准：

```text
D:\Products\AgileBuilder\v2\workspace1\server\docs\CLIENT_API.md
```

MVP 依赖接口：

1. `GET /api/client/version-check`
2. `GET /api/client/license`
3. `POST /api/client/license/refresh`
4. `POST /api/client/device/register`
5. `GET /api/client/device/list`
6. `POST /api/client/device/revoke`
7. `POST /api/client/device/revoke-all`
8. `GET /api/client/user/profile`
9. `GET /api/client/user/settings`
10. `GET /api/client/user/spaces`
11. `GET /api/client/spaces/:spaceId`
12. `GET /api/client/spaces/:spaceId/tree`
13. `GET /api/client/spaces/:spaceId/tree/:nodeId`
14. `GET /api/client/spaces/:spaceId/resources`
15. `GET /api/client/spaces/:spaceId/resources/recent`
16. `GET /api/client/spaces/:spaceId/resources/:resourceId`
17. `POST /api/client/spaces/:spaceId/resources/:resourceId/access`

`core1` 不依赖 Pro module 相关接口，因为 Pro 引擎会内置开源。

## 8. 本地存储

MVP 推荐存储结构：

```text
~/.agilebuilder/core/
  config.json
  auth.enc
  current-space.json
  license-cache.json
  device.json
  resources/
    local.json
  cloud-cache/
    <space-id>.json
  logs/
```

选择 JSON 存储的原因：

1. 不需要兼容旧数据。
2. 本地资源数量预期较小。
3. JSON 更容易调试和人工修复。
4. AI Agent 更容易理解当前状态。

如果后续出现大量资源、并发写入或复杂查询需求，可以在 repository 接口后替换为 SQLite。

## 9. 安全要求

1. shell hooks 默认不执行。
2. 校验目标路径，避免写入明显系统目录。
3. 目标目录非空时，必须传 `--overwrite` 或交互确认。
4. 不记录 access token、API key、refresh token、License 签名等敏感信息。
5. 来自 Git 仓库的模板配置默认视为不可信。
6. 限制模板大小和文件数量。
7. Git 操作不能拼接 shell 字符串。
8. License 验签通过后才能信任权益数据。

## 10. 性能要求

1. `ag --help`、`ag --version`、命令解析不得访问网络。
2. 本地 `res list --json` 不初始化云端客户端。
3. MCP 读取本地资源不刷新 License。
4. token refresh 需要 single-flight，避免并发重复刷新。
5. 模板生成可输出进度，但不得输出大量 debug 日志。

## 11. 验收标准

MVP 达成条件：

1. 未登录用户可以通过 Git URL 创建项目。
2. 未登录用户可以管理本地模板和文档资源。
3. 登录用户可以切换云端空间，并从云端模板创建项目。
4. MCP 可以列出资源，并从本地资源 ID 或 Git URL 创建项目。
5. 普通本地命令不触发 License 检查。
6. `core1` 中不存在旧 `pro-loader` 动态下载模型。

## 12. 交付计划

### Phase 0：项目基础

1. 创建 `core1` package、TypeScript、构建和测试脚手架。
2. 创建无重启动作的 CLI 入口。
3. 添加输出、错误、配置、路径、存储基础模块。
4. 添加 i18n 基础设施和 `zh-CN`、`en-US` 语言包。

### Phase 1：本地资源

1. 实现 JSON 本地资源仓库。
2. 实现 `res list/search/get/add/edit/remove`。
3. 实现 `--json` 输出。
4. 添加存储和命令 handler 测试。

### Phase 2：模板引擎与 Git URL 创建

1. 迁移并清理旧 `pro` 模板生成器。
2. 实现模板配置文件解析和校验。
3. 实现 `create --git-url`。
4. 实现 `create <local-resource-id>`。
5. 添加变量编译、路径编译、配置解析、目标目录安全测试。

### Phase 3：认证、空间、License

1. 实现 OAuth 登录。
2. 实现 API Key 登录。
3. 实现 token store 和刷新。
4. 实现 License 获取、缓存、验签。
5. 实现 `space list/current/use`。

### Phase 4：云端资源

1. 实现 Client API wrapper。
2. 实现云端资源 repository。
3. 实现云端资源列表和详情。
4. 实现从云端模板资源创建项目。
5. 确保权益检查只发生在受限云端操作中。

### Phase 5：MCP

1. 实现 MCP server。
2. 添加资源 tools。
3. 添加项目创建 tool。
4. 实现当前空间和跨空间策略。
5. 添加本地测试和生产环境联调测试，不再维护模拟云端接口测试。

### Phase 6：加固与发布

1. 添加 smoke tests。
2. 添加 package files 和发布脚本。
3. 编写 CLI README。
4. 复核 hooks、Git 模板和目标路径安全边界。
5. 补齐关键命令的中英文文案和翻译完整性测试。

## 13. 待确认问题

1. `create --git-url` 默认是否删除 `.git`？建议默认删除，提供 `--keep-git`。
2. MVP 是否同时支持 YAML 和 JSON 配置？建议支持两者，模板作者体验更好。
3. shell hooks 是否必须同时满足模板配置和 CLI `--allow-hooks`？建议必须显式传 `--allow-hooks`。
4. 云端 free 空间是否允许列出模板，但只在详情或执行时报 Pro/Trial 权限错误？建议跟随当前后端行为。
5. License 验签公钥在 `core1` 中如何分发？建议作为源码内置常量或打包资源，并保留版本标识。
