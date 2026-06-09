# AgileBuilder CLI

AgileBuilder CLI 是一个基于 Git 模板的项目脚手架与开发资源管理工具。通过 npm 全局安装后，它提供 `agilebuilder` / `ag` 命令行入口，可从 Git 模板地址或已登记的模板资源创建项目，并支持模板变量、文件路径与内容渲染、文件匹配规则以及显式授权的生成后 Hook。它同时提供本地工作空间、AgileBuilder Cloud 工作空间、模板资源、文档资源和 JSON 输出能力，适合个人开发者与中小团队统一项目初始化规范、沉淀可复用模板和开发上下文。面向 AI 原生开发流程，AgileBuilder 还提供 `agilebuilder-mcp` 服务模式，可被支持 MCP 协议的 AI IDE 或智能体调用，用于查询资源、读取文档上下文并标准化生成项目脚手架。

包名：`agilebuilder`  
命令：`agilebuilder`、`ag`、`agilebuilder-mcp`  
运行环境：Node.js `>=20.0.0`

## 核心能力

- 通过 Git URL 或已保存的模板资源创建项目。
- 在本地工作空间中管理模板资源和文档资源。
- 登录后访问 AgileBuilder Cloud 工作空间。
- 将文档资源作为 CLI 管理的知识材料，并通过 MCP resources 暴露给智能体。
- 通过 MCP tools 暴露资源查询和项目创建能力。
- 在文件内容和文件路径中渲染模板变量。
- 在明确授权后执行模板写入后的 Hook。
- 为自动化脚本提供 JSON 输出。

## 安装

全局安装：

```bash
npm install -g agilebuilder
```

从源码运行：

```bash
npm install
npm run build
node ./bin/agilebuilder.js --help
```

短命令 `ag` 与 `agilebuilder` 指向同一个 CLI。

## 快速开始

直接从 Git 模板创建项目：

```bash
ag create --git-url https://github.com/example/template.git --target ./my-app
```

注册本地模板资源，并从该资源创建项目：

```bash
ag space use local
ag res add template \
  --name web-app \
  --git-url https://github.com/example/template.git \
  --branch main \
  --tags "web,starter"

ag res list
ag create 1 --target ./my-app
```

传入模板变量：

```bash
ag create 1 \
  --target ./my-app \
  --var appName=my-app \
  --var useAuth=true
```

在脚本中使用 JSON 输出：

```bash
ag res list --json
ag create 1 --target ./my-app --json
```

## 工作空间

AgileBuilder 包含一个内置本地工作空间，也可以在登录后使用 Cloud 工作空间。

- `local`：资源保存在当前机器，不需要登录。
- Cloud 工作空间：来自 AgileBuilder Cloud，需要认证。

当前工作空间会影响资源命令和 `create <resource-id>` 的资源解析。

```bash
ag space list
ag space list --refresh
ag space current
ag space use local
ag space use <space-id>
```

资源写入命令默认使用当前工作空间。也可以通过 `--space-id <id>` 指定目标工作空间，而不切换当前工作空间：

```bash
ag res add template --space-id <space-id> --name api --git-url https://github.com/example/api-template.git
ag res remove <resource-id> --space-id <space-id> --yes
```

`--parent-id` 仅适用于 Cloud 资源。本地资源是扁平列表，不包含目录树。

## 认证

Cloud 资源、Cloud 工作空间、许可证刷新和设备管理都需要登录。

OAuth 登录：

```bash
ag login
```

CLI 会打开浏览器，并在 `127.0.0.1` 监听 OAuth 回调。默认从端口 `51280` 开始，最多向后探测 10 个端口。

API Key 登录：

```bash
ag login --api-key <key>
```

查看或清除认证状态：

```bash
ag auth status
ag auth require-token
ag logout
```

OAuth token 会在可行时自动刷新。API Key 会作为当前凭据保存，直到执行 `logout`。

## 后端选择

CLI 通过 `backend.profile` 选择后端端点。

| 值 | 行为 |
| --- | --- |
| `auto` | 当 locale 或时区显示为中国大陆环境时使用中国区，否则使用全球区。 |
| `china` | 使用 `agilebuilder.cn` 端点。 |
| `global` | 使用 `agilebuilder.net` 端点。 |

配置命令：

```bash
ag config list
ag config get backend.profile
ag config set backend.profile global
```

支持的配置项：

| 配置项 | 可用值 |
| --- | --- |
| `backend.profile` | `auto`、`china`、`global` |
| `language` | `auto`、`zh-CN`、`en-US` |
| `template.allowHooksDefault` | `true`、`false` |

注意：`template.allowHooksDefault` 当前会被保存到配置文件中，但 `create` 命令实际只有在传入 `--allow-hooks` 时才会执行 Hook。

当 `language` 为 `auto` 时，语言检测还会读取 `AGILEBUILDER_LANG`、`LC_ALL`、`LC_MESSAGES` 和 `LANG`。

## 数据存储

默认数据目录：

```text
~/.agilebuilder/core
```

主要文件：

| 文件 | 用途 |
| --- | --- |
| `config.json` | CLI 配置。 |
| `current-space.json` | 当前选中的工作空间 ID。 |
| `resources/local.json` | 本地模板资源和文档资源。 |
| `auth.enc` | 加密保存的认证数据。 |
| `logs/` | 预留日志目录。 |

可通过 `AGILEBUILDER_CORE1_DATA_DIR` 覆盖数据目录：

```bash
AGILEBUILDER_CORE1_DATA_DIR=/tmp/agilebuilder-core ag res list
```

## 资源管理

AgileBuilder 支持两类资源：

| 类型 | 用途 |
| --- | --- |
| `template` | Git 仓库、可选分支和子目录，用于 `create` 创建项目。 |
| `doc` | Markdown 或纯文本内容，可作为 CLI 管理的参考材料和 MCP 资源。 |

列出、搜索和查看资源：

```bash
ag res list
ag res list --type template
ag res search auth
ag res search auth --type doc
ag res get <id>
```

`res` 也可以写作 `resource`，`list` 也可以写作 `ls`。

添加模板资源：

```bash
ag res add template \
  --name service-template \
  --git-url https://github.com/example/service-template.git \
  --branch main \
  --subdir templates/node \
  --description "Node.js service starter" \
  --tags "node,service"
```

模板资源选项：

| 选项 | 是否必填 | 说明 |
| --- | --- | --- |
| `--name <name>` | 是 | 资源名称。 |
| `--git-url <url>` | 是 | Git 仓库 URL。 |
| `--branch <branch>` | 否 | 添加资源时默认值为 `main`。 |
| `--subdir <path>` | 否 | 仓库内模板目录。 |
| `--parent-id <id>` | 否 | 仅 Cloud 可用。 |
| `--space-id <id>` | 否 | 默认使用当前工作空间。 |
| `--description <text>` | 否 | 资源描述。 |
| `--tags <tags>` | 否 | 逗号分隔的标签。 |
| `--json` | 否 | 输出 JSON。 |

添加文档资源：

```bash
ag res add doc \
  --name architecture-notes \
  --file ./docs/architecture.md \
  --format markdown \
  --tags "docs,architecture"
```

文档内容可以来自 `--file` 或 `--content`，二者至少需要提供一个。

文档资源选项：

| 选项 | 是否必填 | 说明 |
| --- | --- | --- |
| `--name <name>` | 是 | 资源名称。 |
| `--file <path>` | 否 | 从文件读取内容。 |
| `--content <text>` | 否 | 直接传入文本内容。 |
| `--uri <uri>` | 否 | 本地文档默认值为 `local-doc://<name>`。 |
| `--format <format>` | 否 | `markdown` 或 `text`，默认 `markdown`。 |
| `--parent-id <id>` | 否 | 仅 Cloud 可用。 |
| `--space-id <id>` | 否 | 默认使用当前工作空间。 |
| `--description <text>` | 否 | 资源描述。 |
| `--tags <tags>` | 否 | 逗号分隔的标签。 |
| `--json` | 否 | 输出 JSON。 |

编辑资源：

```bash
ag res edit <id> --name new-name --description "Updated"
ag res edit <id> --tags "backend,starter"
ag res edit <doc-id> --file ./README.md --format markdown
```

校验规则：

- 至少需要传入一个可编辑字段。
- `--file` 和 `--content` 不能同时使用。
- 模板专属字段不能用于文档资源。
- 文档专属字段不能用于模板资源。
- `--parent-id` 仅适用于 Cloud。

删除资源：

```bash
ag res remove <id> --yes
ag res rm <id> --yes --json
```

删除时必须传入 `--yes`。`res browse` 命令目前只是占位，尚未实现。

## 创建项目

从 Git URL 创建：

```bash
ag create --git-url https://github.com/example/template.git --target ./app
```

从当前工作空间中的模板资源创建：

```bash
ag create <resource-id> --target ./app
```

选项：

| 选项 | 是否必填 | 说明 |
| --- | --- | --- |
| `[resource-id]` | 使用 `--git-url` 时不需要 | 必须指向模板资源。 |
| `--git-url <url>` | 使用资源 ID 时不需要 | 直接从 Git 仓库创建。 |
| `--branch <branch>` | 否 | 覆盖资源分支，或指定直接 Git 克隆的分支。 |
| `--subdir <path>` | 否 | 覆盖资源子目录，或指定直接 Git 模板子目录。 |
| `--target <dir>` | 是 | 输出目录。 |
| `--vars <path>` | 否 | JSON 对象文件，作为模板变量。 |
| `--var <key=value...>` | 否 | 一个或多个标量变量赋值。 |
| `--overwrite` | 否 | 允许写入非空目标目录。 |
| `--keep-git` | 否 | 命令接受该选项，但当前文件遍历逻辑仍会跳过 `.git` 目录。 |
| `--allow-hooks` | 否 | 允许执行支持的模板 Hook。 |
| `--json` | 否 | 输出 JSON。 |

目标目录安全规则：

- CLI 会拒绝写入不安全的根目录或系统目录。
- 已存在且非空的目录必须显式传入 `--overwrite`。
- 目标目录不存在时会自动创建。

变量优先级：

1. `--vars <path>` 中的变量。
2. 重复传入的 `--var key=value`。
3. 模板问题中的默认值，仅在变量仍缺失时应用。

`--var` 会将 `true`、`false`、`null` 和数字解析为对应标量类型，其他值保留为字符串。

当前实现是非交互式的。模板问题仅用于默认值应用和必填变量校验，不会弹出交互式输入。

## 模板配置

模板根目录应包含以下配置文件：

```text
.agilebuilder.config.yaml
```

如果没有找到配置文件，生成流程会使用默认配置继续执行，并输出警告。

配置示例：

```yaml
version: 1
name: service-template
description: Service starter
source:
  subdir: template
variables:
  enabled: true
  delimiter: "%"
  filePatterns:
    mode: include
    patterns:
      - "**/*.ts"
      - "package.json"
  inquirerQuestions:
    - name: appName
      type: input
      message: Application name
      required: true
      default: my-app
hooks:
  after_write:
    scriptType: shell
    script: npm install
    errorHandling: warn
```

变量渲染规则：

- `source.subdir` 是可选项，用于指向已获取模板目录内的实际模板文件根目录；当配置文件位于仓库根目录、生成文件位于 `template/` 等子目录时使用。
- `source.type` 不属于模板文件配置。模板的获取来源由命令参数、资源定义或 Cloud 模板定义决定。
- 文件内容使用 EJS 渲染。
- 默认 EJS 分隔符是 `%`，因此占位符形如 `<%= appName %>`。
- 当 `variables.enabled` 为 `true` 时，文件路径也会参与渲染。
- 文件路径支持 `{{ variableName }}` 和 EJS 表达式。
- 二进制文件不会渲染，会直接复制。
- `.agilebuilder.config.yaml` 不会复制到目标目录。

内置模板辅助函数：

```text
camelCase, pascalCase, kebabCase, snakeCase, uppercase, lowercase
```

示例：

```text
<%= pascalCase(appName) %>
<%= helpers.kebabCase(appName) %>
```

文件匹配模式：

| 模式 | 行为 |
| --- | --- |
| `all` | 渲染所有非二进制文件。 |
| `include` | 只渲染匹配任一 pattern 的文件。 |
| `exclude` | 渲染未匹配任何 pattern 的文件。 |

Hook 规则：

- 当前只会处理 `after_write`。
- 当前只支持执行 `scriptType: shell`。
- Hook 在目标目录中执行。
- 只有传入 `--allow-hooks` 时才会执行 Hook。
- `errorHandling: stop` 会在 Hook 失败时中止生成。
- `errorHandling: warn` 和 `continue` 会记录为跳过并继续执行。

## Cloud 模板配置

对于 Cloud 模板资源，后端可能返回模板定义。当配置来源为工作空间管理时，CLI 会根据 Cloud 资源定义构造模板配置。当配置来源为模板文件时，CLI 会从克隆后的模板中读取 `.agilebuilder.config.yaml`。

在后端支持的情况下，CLI 会在成功解析 Cloud 模板资源后记录资源访问。

## MCP Server

包中提供 MCP stdio server：

```bash
agilebuilder-mcp
```

MCP 客户端配置示例：

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "agilebuilder-mcp"
    }
  }
}
```

MCP tools：

| Tool | 说明 |
| --- | --- |
| `list_resources` | 列出当前工作空间中的资源，可选 `type`。 |
| `search_resources` | 搜索当前工作空间中的资源，可选 `keyword` 和 `type`。 |
| `get_resource` | 通过 `resourceId` 读取单个资源。 |
| `create_project` | 通过 `resourceId` 或 `gitUrl` 创建项目。 |

`create_project` 参数示例：

```json
{
  "resourceId": "1",
  "gitUrl": "https://github.com/example/template.git",
  "branch": "main",
  "subdir": "template",
  "targetPath": "./app",
  "variables": { "appName": "app" },
  "overwrite": false,
  "keepGit": false,
  "allowHooks": false
}
```

`targetPath` 必填。`resourceId` 和 `gitUrl` 至少需要提供一个。

MCP resources：

| URI | 说明 |
| --- | --- |
| `agilebuilder://docs/usage` | 使用说明。 |
| `agilebuilder://usage/agent-policy` | 智能体使用策略。 |
| `agilebuilder://docs/catalog` | 当前工作空间文档资源目录。 |
| `agilebuilder://local/docs/<id>` | 本地文档资源内容。 |
| `agilebuilder://cloud/docs/<id>` | Cloud 文档资源内容。 |

MCP server 使用与 CLI 相同的当前工作空间。

## 设备管理

设备命令需要登录：

```bash
ag device list
ag device revoke <device-id> --reason "No longer used"
ag device revoke-all
```

`revoke-all` 会撤销除当前设备之外的其他设备。

## JSON 输出与错误格式

支持 `--json` 的命令在成功时输出：

```json
{
  "ok": true,
  "data": {}
}
```

错误会输出到 stderr：

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "suggestion": "Optional suggestion",
    "category": "validation"
  }
}
```

未传入 `--json` 时，错误以可读文本输出。

## 命令参考

```text
agilebuilder [options] [command]
ag [options] [command]
```

全局选项：

| 选项 | 说明 |
| --- | --- |
| `-V, --version` | 输出版本号。 |
| `-h, --help` | 显示帮助。 |

命令：

| 命令 | 说明 |
| --- | --- |
| `config` | 管理 CLI 配置。 |
| `login` | 使用 OAuth 或 API Key 登录。 |
| `logout` | 清除本地认证。 |
| `auth status` | 显示认证状态。 |
| `auth require-token` | 要求当前存在可用 token，否则失败。 |
| `space list` / `space ls` | 列出本地和 Cloud 工作空间。 |
| `space current` | 显示当前工作空间。 |
| `space use <workspace>` | 选择 `local` 或 Cloud 工作空间 ID。 |
| `res list` / `res ls` | 列出资源。 |
| `res search <keyword>` | 搜索资源。 |
| `res get <id>` | 查看资源详情。 |
| `res add template` | 添加模板资源。 |
| `res add doc` | 添加文档资源。 |
| `res edit <id>` | 编辑资源。 |
| `res remove <id>` / `res rm <id>` | 删除资源。 |
| `create [resource-id]` | 从资源或 Git URL 创建项目。 |
| `device list` / `device ls` | 列出已注册设备。 |
| `device revoke <device-id>` | 撤销单个设备。 |
| `device revoke-all` | 撤销所有其他设备。 |

## 开发

```bash
npm install
npm run build
npm run typecheck
npm test
npm run dev -- --help
```

项目使用 TypeScript ESM。构建产物输出到 `dist/`，可执行入口位于 `bin/`。

## 已知限制

- `res browse` 存在但尚未实现。
- `create` 当前不会交互式收集模板变量。
- 当前只支持执行 `after_write` shell Hook。
- `template.allowHooksDefault` 会保存到配置中，但 `create` 尚未使用它；请显式传入 `--allow-hooks`。
- 本地资源是扁平列表，不支持目录。
- Cloud 操作依赖 AgileBuilder 后端 API 的可用性和当前用户权限。

## 许可证

MIT
