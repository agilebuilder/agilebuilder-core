# AgileBuilder Core

[English](./README.md)

> 面向 AI 原生开发流程的 CLI 与 MCP 运行时，用于基于模板创建项目，并把团队文档作为 AI 可读取的工程上下文。

AgileBuilder Core 是 AgileBuilder 命令行与 MCP Server 背后的可安装运行时。它提供本地优先的模板与文档资源管理能力，让团队可以维护可复用项目模板、沉淀项目文档，并让 AI IDE 在创建或修改代码前先读取这些上下文。

该 npm 包发布名为 `agilebuilder`。

## 目录

- [提供的能力](#提供的能力)
- [安装](#安装)
- [快速开始](#快速开始)
- [CLI 命令](#cli-命令)
- [工作空间](#工作空间)
- [资源模型](#资源模型)
- [创建项目](#创建项目)
- [模板配置](#模板配置)
- [认证与云端访问](#认证与云端访问)
- [MCP 集成](#mcp-集成)
- [配置](#配置)
- [环境变量](#环境变量)
- [本地数据目录](#本地数据目录)
- [编程接口](#编程接口)
- [开发](#开发)
- [发版检查](#发版检查)
- [当前限制](#当前限制)
- [安全与隐私](#安全与隐私)
- [开源范围](#开源范围)
- [反馈与许可证](#反馈与许可证)

## 提供的能力

AgileBuilder Core 是一个轻量级运行时，覆盖项目初始化、资源管理和 AI 辅助开发场景。

当前提供：

- CLI 入口：`agilebuilder`、`ag`、`agilebuilder-mcp`
- 无需登录即可使用的本地工作空间
- 登录后的云端工作空间选择
- 模板和文档两类资源的本地与云端操作
- 基于 Git 模板创建项目，支持变量、可选 hooks 和子目录模板
- API Key 与 OAuth 登录
- 登录账号的设备管理
- 面向 AI IDE 的 MCP tools 和可读取资源
- 适合自动化脚本使用的 JSON 输出

推荐工作流：

1. 将模板和文档登记为资源。
2. 选择本地或云端工作空间。
3. 基于资源模板或直接 Git URL 创建项目。
4. 通过 MCP 将模板和文档暴露给 AI IDE，让生成代码前先读取团队上下文。

## 安装

全局安装：

```bash
npm install -g agilebuilder
```

安装后会提供三个命令：

```text
agilebuilder
ag
agilebuilder-mcp
```

运行要求：

- Node.js `>=20.0.0`
- Git 可在 `PATH` 中访问，用于克隆模板

验证安装：

```bash
ag --version
ag --help
```

## 快速开始

使用内置本地工作空间：

```bash
ag space list --json
ag space current --json
ag space use local --json
```

添加本地模板资源：

```bash
ag res add template \
  --name basic-copy \
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git \
  --branch main \
  --description "Basic copy case" \
  --tags "case,basic" \
  --json
```

查看资源：

```bash
ag res list --json
ag res search basic --type template --json
```

直接从 Git URL 创建项目：

```bash
ag create \
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git \
  --target ./output/basic-copy \
  --json
```

从已登记的模板资源创建项目：

```bash
ag create <template-resource-id> --target ./output/app --json
```

为 AI IDE 启动 MCP Server：

```bash
agilebuilder-mcp
```

## CLI 命令

根命令提供：

```text
config
login
logout
auth
space
res, resource
create
device
```

常用命令形式：

```bash
ag config list --json
ag login --api-key <API_KEY>
ag auth status --json
ag logout --json

ag space list --json
ag space list --refresh --json
ag space current --json
ag space use local --json
ag space use <space-id> --json

ag res list --json
ag res search <keyword> --json
ag res get <resource-id> --json
ag res add template --name <name> --git-url <url> --json
ag res add doc --name <name> --file <path> --json
ag res edit <resource-id> --name <new-name> --json
ag res remove <resource-id> --yes --json

ag create --git-url <url> --target <dir> --json
ag create <template-resource-id> --target <dir> --json

ag device list --json
ag device revoke <device-id> --reason <text> --json
ag device revoke-all --json
```

还有一个用于排查 MCP 可见资源的隐藏诊断命令：

```bash
ag mcp-debug-resources --json
```

## 工作空间

AgileBuilder Core 始终提供内置本地工作空间：

```bash
ag space use local --json
```

本地工作空间特性：

- 无需登录即可使用
- 资源保存为本地 JSON 文件
- 支持模板和文档资源写入
- 没有目录树，因此不支持 `--parent-id`

云端工作空间特性：

- 需要登录，并且后端服务可访问
- 使用当前选中的云端工作空间作为命令上下文
- 在后端实现对应 client APIs 的前提下，支持资源列表、搜索、详情、新增、编辑、删除，以及基于模板资源创建项目
- 支持 `--parent-id` 将云端资源放入指定文件夹节点

资源写命令默认使用当前工作空间。需要显式指定目标工作空间时，可以传入 `--space-id <id>`。

## 资源模型

AgileBuilder Core 将模板和文档都视为一等资源。

支持的资源类型：

- `template`
- `doc`

列表和搜索：

```bash
ag res list --json
ag res list --type template --json
ag res search react --json
ag res search guide --type doc --json
```

读取单个资源：

```bash
ag res get <resource-id> --json
```

### 模板资源

添加模板资源：

```bash
ag res add template \
  --name basic-copy \
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git \
  --branch main \
  --subdir templates/app \
  --description "Basic application template" \
  --tags "case,basic" \
  --json
```

选项：

```text
--name <name>          必填
--git-url <url>        必填
--branch <branch>      可选，默认 main
--subdir <path>        可选
--parent-id <id>       可选，仅云端资源支持
--space-id <id>        可选，默认当前工作空间
--description <text>   可选
--tags <tags>          可选，英文逗号分隔
--json                 可选，输出 JSON
```

模板资源可编辑字段：

```text
--name
--description
--tags
--git-url
--branch
--subdir
```

### 文档资源

从文件添加文档：

```bash
ag res add doc \
  --name local-guide \
  --file ./README.md \
  --format markdown \
  --description "Local guide" \
  --tags "docs,local" \
  --json
```

从内联内容添加文档：

```bash
ag res add doc \
  --name note \
  --content "Hello AgileBuilder" \
  --format text \
  --json
```

选项：

```text
--name <name>          必填
--file <path>          可选
--content <text>       可选
--uri <uri>            可选，默认 local-doc://<name>
--format <format>      可选，markdown 或 text，默认 markdown
--parent-id <id>       可选，仅云端资源支持
--space-id <id>        可选，默认当前工作空间
--description <text>   可选
--tags <tags>          可选，英文逗号分隔
--json                 可选，输出 JSON
```

添加文档时必须提供 `--file` 或 `--content`。

文档资源可编辑字段：

```text
--name
--description
--tags
--uri
--file
--content
--format
```

### 编辑和删除

编辑资源：

```bash
ag res edit <resource-id> --name new-name --description "Updated" --json
```

删除资源：

```bash
ag res remove <resource-id> --yes --json
ag res remove <resource-id> --space-id <space-id> --yes --json
```

校验规则：

- 至少传入一个可编辑字段。
- `--file` 和 `--content` 不能同时使用。
- 模板专属字段不能用于文档资源。
- 文档专属字段不能用于模板资源。
- `--parent-id` 仅支持云端资源。

## 创建项目

直接从 Git URL 创建：

```bash
ag create \
  --git-url https://github.com/agilebuilder/template-case-basic-copy.git \
  --branch main \
  --target ./output/basic-copy \
  --json
```

从当前工作空间中的模板资源创建：

```bash
ag create <template-resource-id> --target ./output/app --json
```

使用模板仓库中的子目录：

```bash
ag create \
  --git-url https://github.com/agilebuilder/template-case-multi-template-repo.git \
  --subdir templates/api \
  --target ./output/api \
  --json
```

传入模板变量：

```bash
ag create \
  --git-url https://github.com/agilebuilder/template-case-vars-paths.git \
  --target ./output/demo-api \
  --var projectName=demo-api \
  --var packageName=@demo/api \
  --json
```

从 JSON 文件加载变量：

```bash
ag create \
  --git-url https://github.com/agilebuilder/template-case-vars-paths.git \
  --target ./output/demo-api \
  --vars ./sample-vars.json \
  --json
```

常用选项：

```text
--git-url <url>        直接使用 Git 模板 URL
--branch <branch>      Git 分支
--subdir <path>        模板子目录
--target <dir>         必填，输出目录
--var <key=value>      模板变量，可重复传入
--vars <path>          包含模板变量的 JSON 文件
--overwrite            允许写入非空目标目录
--keep-git             保留克隆出来的 .git 目录
--allow-hooks          允许执行模板 hooks
--json                 输出 JSON
```

默认行为：

- 生成结果会移除 `.git`
- 不执行模板 hooks
- 目标目录非空时失败，除非传入 `--overwrite`

## 模板配置

模板根目录可以包含 AgileBuilder 配置文件。如果没有找到配置文件，生成流程会输出 warning，并使用默认配置继续执行。

模板引擎支持：

- 文件内容中的变量替换
- 文件名和目录名中的变量替换
- 可选的文件匹配规则
- 显式允许后执行 hooks
- 云端资源提供的 workspace 级模板定义

对于云端模板资源，`template.definition.configSource` 决定变量和 hooks 来源：

- `workspace` 使用后端返回的工作空间模板定义
- `template_files` 读取模板根目录中的配置文件

hooks 默认禁用。只有在你信任模板来源时才应使用 `--allow-hooks`。

## 认证与云端访问

使用 API Key 登录：

```bash
ag login --api-key <API_KEY>
```

启动浏览器 OAuth 登录：

```bash
ag login
```

查看登录状态：

```bash
ag auth status --json
```

退出登录：

```bash
ag logout --json
```

认证说明：

- 本地工作空间操作不需要登录。
- 云端工作空间和设备管理需要有效认证。
- API Key 适合自动化脚本和无浏览器环境。
- OAuth 使用 Authorization Code + PKCE。

设备管理：

```bash
ag device list --json
ag device revoke <device-id> --reason "No longer used" --json
ag device revoke-all --json
```

## MCP 集成

启动 MCP Server：

```bash
agilebuilder-mcp
```

通用 MCP 配置：

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "agilebuilder-mcp"
    }
  }
}
```

开发环境 MCP 配置：

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "node",
      "args": ["D:/path/to/agilebuilder/dist/mcp/index.js"]
    }
  }
}
```

可用 MCP tools：

```text
list_resources
search_resources
get_resource
create_project
```

参数概要：

```text
list_resources:   { type?: "template" | "doc" }
search_resources: { keyword?: string, type?: "template" | "doc" }
get_resource:     { resourceId: string }
create_project:   { resourceId?: string, gitUrl?: string, branch?: string, subdir?: string, targetPath: string, variables?: object, overwrite?: boolean, keepGit?: boolean, allowHooks?: boolean }
```

MCP resources：

- 暴露 AgileBuilder 使用指南
- 暴露本地文档资源
- 登录并选中云端工作空间后，暴露当前云端工作空间中的文档资源

MCP 使用当前选中的工作空间。需要改变 MCP 可见资源时，先用 CLI 切换工作空间，再启动 MCP Server：

```bash
ag space use local --json
agilebuilder-mcp
```

或：

```bash
ag login --api-key <API_KEY>
ag space use <space-id> --json
agilebuilder-mcp
```

## 配置

查看当前配置：

```bash
ag config list --json
```

读取单个配置项：

```bash
ag config get language --json
```

设置配置项：

```bash
ag config set language en-US --json
ag config set backend.profile global --json
ag config set template.allowHooksDefault true --json
```

支持的配置项：

```text
backend.profile              auto | china | global
language                     auto | zh-CN | en-US
template.allowHooksDefault   true | false
```

当 `backend.profile` 为 `auto` 时，运行时会根据 locale 和 timezone 推断：

- `zh-CN` locale 或中国时区 -> `china`
- 其他情况 -> `global`

## 环境变量

数据目录：

```text
AGILEBUILDER_CORE1_DATA_DIR
```

语言：

```text
AGILEBUILDER_LANG
LC_ALL
LC_MESSAGES
LANG
```

后端 endpoint 内置为 AgileBuilder 官方服务，不支持通过环境变量覆盖。

## 本地数据目录

默认情况下，AgileBuilder Core 将本地数据保存在：

```text
~/.agilebuilder/core
```

测试或隔离实验时可以覆盖：

```bash
AGILEBUILDER_CORE1_DATA_DIR=/tmp/agilebuilder-core1-data
```

常见本地文件：

```text
config.json
current-space.json
device.json
auth.enc
license-cache.json
resources/local.json
```

本地数据目录可能包含敏感信息，不应公开分享。

## 编程接口

包提供一个较小的 ESM 入口：

```ts
import { APP_VERSION } from "agilebuilder";
```

公开 API 刻意保持精简。对于大多数集成场景，建议优先使用 CLI 或 MCP Server，而不是导入内部模块。

## 开发

安装依赖：

```bash
npm install
```

构建：

```bash
npm run build
```

运行测试：

```bash
npm test
```

只做类型检查：

```bash
npm run typecheck
```

从 TypeScript 源码运行 CLI：

```bash
npm run dev -- --help
```

运行编译后的 CLI：

```bash
node dist/cli/index.js --help
```

运行编译后的 MCP Server：

```bash
node dist/mcp/index.js
```

## 发版检查

发布前建议执行：

```bash
npm run build
npm test
npm audit --omit=dev
npm pack --dry-run
```

npm 包配置为包含：

- `bin/`
- 编译后的 `dist/`
- `docs/`
- 中英文 README
- license 和开源维护文档

编译后的测试文件不会进入发布包。

## 当前限制

- `res browse` 命令存在但尚未实现；请使用 `res list`、`res search` 和 `res get`。
- 资源 add/edit 当前只支持 flags，不支持用 JSON 文件定义资源。
- `--parent-id` 仅支持云端资源，因为本地资源没有目录树。
- 云端资源写入依赖后端实现兼容的 client APIs。
- 当前升级版运行时聚焦 CLI 和 MCP，不打包旧版本地 Web UI runtime。
- Pro 模块管理不属于当前升级版 CLI 包的一部分。

## 安全与隐私

- 不要公开 access token、refresh token、API Key、device ID 或原始缓存文件。
- 不要公开整个本地数据目录。
- 将 CLI 和 MCP 输出粘贴到公开 issue 前，应先人工复核。
- 只对可信模板使用 `--allow-hooks`。
- 如果模板变量包含业务敏感数据，生成的项目结果也应按敏感数据处理。

安全问题报告方式见 [SECURITY.md](./SECURITY.md)。

## 开源范围

该仓库适合围绕以下内容进行开源协作：

- CLI 行为
- MCP runtime 和 tool 暴露
- 本地数据模型
- 云端 client 集成边界
- 资源管理与项目创建流程
- 文档、测试、打包和 CI

该仓库不承载私有后端实现细节，也不承载闭源 Pro 内部实现。

## 反馈与许可证

仓库：

- `https://github.com/agilebuilder/agilebuilder-core`

Issues：

- `https://github.com/agilebuilder/agilebuilder-core/issues`

主页：

- `https://www.agilebuilder.net`

许可证：

- MIT

补充参考：

- [当前 CLI 参考](./docs/core1-current-cli-reference.md)
- [生产测试计划](./docs/production-test-plan.md)
