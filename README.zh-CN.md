# AgileBuilder Core

[English](./README.md)

> 面向团队的模板化项目脚手架与 AI 协作运行时，通过 CLI、Web UI 与 MCP AI IDE 集成提供统一能力。

AgileBuilder Core 是 AgileBuilder CLI 与 MCP Server 背后的可安装运行时。它围绕一个很明确的目标来设计：

- 团队可以基于可复用的项目模板快速创建项目
- 团队可以把工程规范和项目文档作为共享上下文沉淀下来
- AI IDE 在生成或修改代码前可以先读取这些上下文
- 开发者可以通过 CLI 或 Web UI 维护这一整套能力

这个仓库就是对外发布的开源 `core` 包，npm 包名为 `agilebuilder`。

## 目录

- [这个项目是什么](#这个项目是什么)
- [为什么是 AgileBuilder](#为什么是-agilebuilder)
- [安装](#安装)
- [快速开始](#快速开始)
- [公开 CLI 命令](#公开-cli-命令)
- [隐藏命令与高级命令](#隐藏命令与高级命令)
- [配置与环境变量](#配置与环境变量)
- [认证与工作空间模型](#认证与工作空间模型)
- [资源模型](#资源模型)
- [Web UI](#web-ui)
- [MCP 与 AI IDE 集成](#mcp-与-ai-ide-集成)
- [开源 Core 与 SaaS](#开源-core-与-saas)
- [编程式 API](#编程式-api)
- [Pro 模块边界](#pro-模块边界)
- [本地数据目录](#本地数据目录)
- [开发](#开发)
- [安全与隐私说明](#安全与隐私说明)
- [开源范围](#开源范围)
- [反馈与许可证](#反馈与许可证)

## 这个项目是什么

AgileBuilder Core 不是一个单纯的脚手架 CLI，也不是一个单纯的 MCP Server。更准确地说，它是一个**面向团队项目启动、资源治理和 AI 协作开发的本地执行层**。

运行时提供的核心能力包括：

- CLI 入口：`agilebuilder`、`ag`、`agilebuilder-mcp`
- 用户目录下的本地状态管理
- 登录、登出与 token 刷新
- 本地与云端工作空间选择
- 本地与云端资源浏览
- 基于模板资源创建项目
- 本地 Web UI 服务
- Pro 模块下载、校验、装载与更新

落到实际使用场景上，AgileBuilder Core 能帮助团队：

- 把可复用的项目模板作为受管理资源维护起来
- 不再依赖复制旧仓库的方式，而是从团队模板快速创建新项目
- 把团队文档、研发规范和项目约束沉淀为 AI 可读取的上下文
- 让 AI IDE 通过 MCP 在写代码前先读取模板和文档
- 通过 CLI 或 Web UI 管理模板、文档、工作空间和运行时配置

这个包也导出了一部分编程式 API，但对大多数用户来说，最主要的接口仍然是 CLI、Web UI 和 MCP。

## 为什么是 AgileBuilder

AgileBuilder 的价值，可以从四条互相联动的工作流来理解。

### 1. 基于团队模板的项目脚手架

AgileBuilder 把模板视为一等资源。团队可以在本地工作空间或云端工作空间中维护项目模板，并把它们作为新项目的标准起点。

这件事的价值在于，它把“项目初始化”从临时操作变成了受治理的流程：

- 团队只需要定义一次经过认可的项目起始结构
- 开发者和 AI 助手都复用同一套模板目录
- 不同语言、框架和业务线都可以形成稳定的一致性起点
- 模板升级可以集中维护，而不是散落在多个仓库中复制传播

### 2. 让 AI 遵循团队开发规范

AgileBuilder 同时把文档视为一等资源，并通过 MCP 的资源 URI 暴露给 AI IDE。这样 AI 在开始生成或修改代码前，就可以先读取团队约束。

这些约束通常包括：

- 架构说明
- 编码规范
- 交付检查清单
- 模板使用说明
- 项目特定约束

这里最核心的价值是：**提供项目模板的同一个运行时，也同时提供约束 AI 如何实现这些项目的规则与文档**。

### 3. 通过 Web UI 做可视化维护

Web UI 不是一个演示壳，而是日常维护模型的一部分。它提供了更直观的方式来：

- 浏览模板和文档
- 查看本地与云端资源
- 管理资源元数据和内容
- 查看运行时配置，而不是直接编辑本地原始文件

因此 AgileBuilder 同时适合习惯终端的开发者，也适合偏向可视化维护方式的团队。

### 4. 一个运行时，两种交付形态

AgileBuilder 可以合理地表述为：

- 一个开源免费的 `core` 运行时，负责本地 CLI、Web UI 与 MCP 工作流
- 一个 AgileBuilder SaaS 平台，负责共享云端工作空间、托管资源与团队协作能力

这个定位和当前代码实现是一致的：

- 本地优先工作流由开源运行时提供
- 云端工作空间和云端资源由后端集成能力提供
- AI IDE 集成通过本地 MCP Server 暴露
- 模板驱动的项目创建由运行时和 MCP 工具层实现

## 安装

### 全局安装

```bash
npm install -g agilebuilder
```

安装后可用命令：

- `agilebuilder`
- `ag`
- `agilebuilder-mcp`

### 本地开发安装

```bash
npm install
cd ui
npm install
cd ..
```

## 快速开始

### 1. 查看 CLI

```bash
ag --help
ag --version
```

### 2. 登录

```bash
ag login
```

登录流程基于 OAuth 2.0 Authorization Code + PKCE。CLI 会：

1. 在 `127.0.0.1` 启动一个临时本地回调服务
2. 打开浏览器
3. 用授权码换取 token
4. 把加密后的认证状态保存到本地

### 3. 选择工作空间

```bash
ag space
ag space list
ag space current
```

### 4. 浏览模板和文档

```bash
ag res list
```

模板和文档都作为资源来管理。在本地工作空间中，你可以交互式地新增、编辑和删除它们；在云端工作空间中，你可以浏览团队共享资源目录。

### 5. 启动 Web UI

```bash
ag ui
```

如果你希望以可视化方式管理模板、文档和运行时配置，可以使用 Web UI。
本地 UI 默认绑定到 `127.0.0.1`，设计目标是仅供本机使用。

### 6. 为 AI IDE 启动 MCP

```bash
agilebuilder-mcp
```

然后把 AI IDE 连接到这个 MCP Server，这样它就可以：

- 发现可用的项目模板
- 在建项前读取模板元数据
- 读取团队文档与使用指引
- 通过受控模板流程创建项目

## 公开 CLI 命令

根帮助刻意保持简洁。以下是默认会出现在主帮助中的命令。

### `ag login`

登录 AgileBuilder Cloud。

说明：

- 未登录时，根帮助显示 `login`
- 已登录时，根帮助改为显示 `logout`
- 即使主帮助里没显示，两个命令本身都仍然可执行

### `ag logout`

退出当前账号并清除本地认证状态。

### `ag space`

工作空间管理命令。

可用形式：

```bash
ag space
ag space list
ag space ls
ag space current
```

行为：

- `ag space` 打开交互式工作空间选择器
- `list` 和 `ls` 输出所有可用工作空间
- `current` 输出当前工作空间

### `ag res`

浏览并管理当前工作空间下的资源。

可用形式：

```bash
ag res
ag resource
ag res list
ag res list --offline
ag res add
ag res edit
ag res remove
ag res remove --force
ag res rm --force
```

行为说明：

- `ag res` 与 `ag resource` 等价
- `list` 进入交互式资源浏览
- `list --offline` 尽量使用本地缓存
- `add`、`edit`、`remove` 只在本地工作空间可用
- `remove` 还有别名 `rm`

### `ag ui`

启动本地 Web UI 服务。

```bash
ag ui
ag ui --port 3456
ag ui --no-open
```

### `ag config`

打开交互式 CLI 配置。

当前主要管理：

- CLI 语言：`auto`、`zh-CN`、`en-US`
- 后端档位：`auto`、`china`、`global`

## 隐藏命令与高级命令

这些命令是运行时的一部分，但默认不会出现在根帮助中。

### `ag status`

显示当前登录状态与运行时摘要。

输出信息包括：

- CLI 版本
- 当前账号
- 邮箱或手机号
- token 是否有效
- 当前工作空间
- 当前计划
- Pro 权限状态

### `ag pro`

Pro 模块管理入口，也支持交互式菜单。

可用子命令：

```bash
ag pro
ag pro info
ag pro load
ag pro unload
ag pro update
ag pro verify
```

典型用途：

- 查看已安装 Pro 模块详情
- 校验完整性
- 装载或卸载模块
- 下载更新

注意：

- `pro` 管理要求用户已登录
- 还要求当前账号下至少存在一个有 Pro 能力的工作空间

### `ag device`

设备管理命令。

```bash
ag device list
ag device revoke <device-id>
ag device revoke-all
```

典型用途：

- 查看当前账号下已注册设备
- 撤销单个设备
- 撤销除当前设备外的所有设备

### `ag mcp-debug-resources`

调试 MCP 当前能看到哪些模板与文档资源。

```bash
ag mcp-debug-resources
ag mcp-debug-resources --json
ag mcp-debug-resources --all-spaces
ag mcp-debug-resources --all-spaces --json
```

适用于：

- AI IDE 看不到你预期的模板
- MCP 暴露的文档数量少于预期
- 需要比较“当前工作空间可见性”和“跨工作空间可见性”

## 配置与环境变量

### CLI 配置文件

CLI 偏好设置保存在本地数据目录中的：

```text
~/.agilebuilder/v2/config.json
```

### 后端档位自动判定

当后端档位设为 `auto` 时，运行时会根据 locale 和 timezone 自动推断：

- `zh-CN` locale 或中国时区 -> `china`
- 否则 -> `global`

你也可以通过交互式命令手动修改：

```bash
ag config
```

### CLI 环境变量加载顺序

CLI 入口会按如下顺序加载环境变量：

1. `.env.local`
2. `.env`

这个行为适用于 `agilebuilder` 和 `ag`。

### MCP 的一个重要区别

`agilebuilder-mcp` 不会自动读取 `.env.local` 或 `.env`。

因此在 AI IDE 场景里，如果你需要自定义后端地址、调试开关或代理，应该直接在 MCP 配置里通过 `env` 传入。

### 支持的环境变量

- `AG_BACKEND_CHINA_SSO_URL`
- `AG_BACKEND_CHINA_WORKSPACE_URL`
- `AG_BACKEND_GLOBAL_SSO_URL`
- `AG_BACKEND_GLOBAL_WORKSPACE_URL`
- `DEBUG`
- `AG_PROXY`

示例：

```env
AG_BACKEND_CHINA_SSO_URL=https://china-auth.example.com
AG_BACKEND_CHINA_WORKSPACE_URL=https://china-workspace.example.com
AG_BACKEND_GLOBAL_SSO_URL=https://api-auth.agilebuilder.net
AG_BACKEND_GLOBAL_WORKSPACE_URL=https://api-app.agilebuilder.net
# DEBUG=true
# AG_PROXY=http://127.0.0.1:9099
```

### 代理支持

如果设置了 `AG_PROXY`，HTTP 请求会走代理感知的 fetch 封装。调试输出已做脱敏，不会直接打印完整代理凭据。

## 认证与工作空间模型

### 本地优先

即使用户没有登录，运行时也始终支持本地工作空间。

这意味着：

- CLI 可以在不登录云端的情况下完成本地工作流
- 本地资源支持离线使用
- 依赖云端的能力仍然要求登录且后端可达

### 工作空间类型

运行时同时支持：

- 内置本地工作空间
- 来自认证账号上下文的云端工作空间

当前选中的工作空间会影响：

- 哪些资源可见
- 是否使用云端 API
- 当前计划和功能集
- 是否可能激活 Pro 能力

## 资源模型

AgileBuilder Core 把模板和文档统一视为资源。

### 本地资源

在本地工作空间中，资源管理是交互式的，并保存在本地数据库中。

当前支持的本地资源类型：

- template
- document

可用操作：

- create
- edit
- remove
- browse

### 云端资源

在云端工作空间中，资源通过当前工作空间上下文和后端 API 进行浏览。

当前行为包括：

- 交互式浏览
- 本地缓存回退
- 模板详情读取
- 文档详情读取
- 基于模板资源创建项目

### 为什么这个模型重要

这个资源模型正是把“脚手架能力”和“AI 协作能力”连接起来的关键：

- 模板定义了新项目应该如何开始
- 文档定义了这些项目应该如何实现和维护
- MCP 以受控方式把两者都暴露给 AI IDE

## Web UI

Web UI 由 CLI 运行时在本地托管。

启动方式：

```bash
ag ui
```

默认监听地址为：

```text
http://127.0.0.1:3456
```

当前 UI 主要用于：

- 浏览模板和文档
- 查看资源详情
- 进入资源创建与编辑流程
- 查看运行时配置

当前服务端公开的路由包括：

- `/api/templates`
- `/api/docs`
- `/api/resources`
- `/api/settings`

## MCP 与 AI IDE 集成

### MCP 暴露了什么

MCP 运行时同时暴露工具和可读资源。

### Tools

当前工具包括：

- `listTemplates`
- `searchTemplates`
- `getTemplateInfo`
- `createProjectByTemplate`

推荐的 AI IDE 工作流：

1. `listTemplates` 或 `searchTemplates`
2. `getTemplateInfo`
3. 读取相关文档资源
4. `createProjectByTemplate`

### Resources

MCP 还暴露指导性资源和文档资源，主要 URI 家族如下：

- `agilebuilder://usage/agent-policy`
- `agilebuilder://usage/guide`
- `agilebuilder://docs/catalog`
- `agilebuilder://docs/local/{id}`
- `agilebuilder://docs/cloud/{spaceId}/{resourceId}`

这很重要，因为这个项目的设计目标之一，就是让 AI 在生成或修改代码前先读取项目和团队特定文档。

换句话说，AgileBuilder 的目标不是让 AI 只依赖通用模型记忆，而是让它建立在以下上下文之上：

- 团队模板目录
- 建项元数据
- 本地文档
- 云端文档
- 运行时自身暴露的使用指引

### 通用 MCP 配置示例

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "agilebuilder-mcp"
    }
  }
}
```

### 带显式环境变量的 MCP 配置

当 AI IDE 需要自定义后端地址、代理或调试配置时，建议用这种形式：

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "agilebuilder-mcp",
      "env": {
        "AG_BACKEND_GLOBAL_SSO_URL": "https://api-auth.agilebuilder.net",
        "AG_BACKEND_GLOBAL_WORKSPACE_URL": "https://api-app.agilebuilder.net",
        "DEBUG": "false"
      }
    }
  }
}
```

### 开发环境下的 MCP 配置

```json
{
  "mcpServers": {
    "agilebuilder": {
      "command": "node",
      "args": ["D:/path/to/core/dist/mcp/index.js"]
    }
  }
}
```

### AI IDE 应该如何使用 AgileBuilder

如果 AI IDE 已通过 MCP 连接到 AgileBuilder，推荐的行为是：

- 通过 MCP tools 浏览模板，而不是凭空猜模板名
- 在创建项目之前先看模板详情
- 在处理现有项目时，先读取暴露出的文档资源
- 只有在目标路径明确后，才调用 `createProjectByTemplate`

这就是 AgileBuilder 希望提供给 AI 的核心工作方式：**先选择团队模板，先读取团队文档，再在这些约束下生成或修改代码**。

## 开源 Core 与 SaaS

AgileBuilder 最合理的对外表述，是双形态产品：

- 一个开源免费的 `core` 运行时，负责本地 CLI、Web UI 与 MCP 工作流
- 一个 AgileBuilder SaaS 平台，负责共享云端工作空间、托管资源与团队协作能力

这个仓库就是其中的开源部分。

对用户来说，实际理解可以很直接：

- 如果你需要一个本地、可脚本化、可集成 AI IDE 的开发运行时，使用开源 Core
- 如果你需要共享工作空间资源和更完整的团队协作平台，使用 AgileBuilder SaaS

## 编程式 API

这个包提供两个 Node 入口：

- `agilebuilder`：面向外部用户的公开稳定导出
- `agilebuilder/internal`：仅供官方工作区包使用的内部导出，例如桌面端 sidecar

公开入口刻意保持较小的 API 面。目前 `dist/index.js` 只暴露少量稳定运行时 API。

也就是说，Node 端消费者可以这样导入：

```ts
import { login, logout, isLoggedIn, APP_VERSION } from 'agilebuilder';
```

内部入口则用于第一方包：

```ts
import { TokenStore, ProcessorFactory } from 'agilebuilder/internal';
```

`agilebuilder/internal` 不属于公开 semver 稳定承诺，后续版本可能调整。对大多数用户来说，CLI、Web UI、MCP，以及上面这组较小的公开 Node API，才是稳定接口。

## Pro 模块边界

这个仓库包含的是 Pro 模块管理的开源侧能力：

- 状态检查
- 下载流程
- 完整性校验
- 装载与卸载
- 更新编排

但它不包含闭源 Pro 模块本体实现。

## 本地数据目录

运行时数据默认保存在：

```text
~/.agilebuilder/v2/
```

常见文件与目录包括：

- `templates.db`
- `auth.dat`
- `license.dat`
- `current-space.json`
- `.device`
- `config.json`
- `.initialized`
- `ignored-versions.json`
- `modules/pro/index.js`

该目录可能包含敏感信息，不应直接分享。

## 开发

### 构建

```bash
npm run build
```

这会构建：

- `dist/` 下的 TypeScript 输出
- `ui/dist/` 下的 Web UI 构建产物

### 测试

```bash
npm test
```

当前自动化检查覆盖：

- Auth、License、Pro 模块完整性相关的编译后单元测试
- CLI 版本和帮助输出
- 公开命令面检查
- MCP stdio 启动
- 旧构建产物残留检查

### 在源码目录下运行

```bash
npm run dev
npm run start
npm run mcp
npm run ui:dev
```

### 发布前校验

在发版前，建议至少执行：

```bash
npm run build
npm test
npm audit --omit=dev
npm pack --dry-run
```

## 安全与隐私说明

- 不要在公开 issue 中粘贴 token、refresh token、device ID 或原始缓存文件
- 不要直接共享整个 `~/.agilebuilder/v2/` 目录
- 不要在公开问题报告里附带私有后端地址或内网信息
- CLI 和 MCP 的调试输出虽然已经做过脱敏，但发 issue 前仍建议人工复核

## 开源范围

这个仓库适合开源协作的内容包括：

- CLI 行为
- MCP runtime 与 tool 暴露
- Web UI runtime
- 本地数据模型
- 资源浏览与项目创建流程
- 文档、测试、打包与 CI

它不适合承载私有后端实现细节或闭源 Pro 内部实现。

## 反馈与许可证

仓库地址：

- `https://github.com/agilebuilder/agilebuilder-core`

Issue：

- `https://github.com/agilebuilder/agilebuilder-core/issues`

主页：

- `https://www.agilebuilder.net`

许可证：

- MIT
