# Core1 CLI 验收测试报告

日期：2026-06-06

测试工作区：`D:\Products\AgileBuilder\v2\cli`

Core1 包目录：`D:\Products\AgileBuilder\v2\cli\core1`

临时测试目录：`D:\Products\AgileBuilder\v2\cli\case-temp`

测试结果：通过，有观察项

## 测试范围

本次测试聚焦于当前 `core1` CLI 中无需真实云端后端凭证即可验证的功能。

已覆盖范围：

- CLI 入口、版本号和帮助信息。
- 通过 `AGILEBUILDER_CORE1_DATA_DIR` 使用隔离的本地配置与资源存储。
- `config` 的 list/get/set。
- `space` 的 list/current/use local。
- `auth status`、`logout`，以及无 token 时的预期失败行为。
- `device list` 在无 token 时的预期失败行为。
- 通过公开 GitHub 仓库执行直接 `create --git-url` 模板生成。
- 模板生成后的项目结果验证。
- 本地资源 add/list/search/get/remove。
- 基于本地已注册 template resource 创建项目。
- 参数校验和错误路径行为。

未覆盖范围：

- 真实 `login --api-key` 或 OAuth 登录。
- 云端工作区和云端资源。
- device list/revoke 成功路径。
- MCP stdio 工具集成。

以上路径需要有效的后端凭证或 MCP 客户端测试框架。

## 测试夹具

本次使用的公开模板仓库：

| 用例 | 克隆地址 |
| --- | --- |
| `template-case-basic-copy` | `https://github.com/agilebuilder/template-case-basic-copy.git` |
| `template-case-vars-paths` | `https://github.com/agilebuilder/template-case-vars-paths.git` |
| `template-case-file-patterns` | `https://github.com/agilebuilder/template-case-file-patterns.git` |
| `template-case-subdir-source` | `https://github.com/agilebuilder/template-case-subdir-source.git` |
| `template-case-multi-template-repo` | `https://github.com/agilebuilder/template-case-multi-template-repo.git` |
| `template-case-hooks` | `https://github.com/agilebuilder/template-case-hooks.git` |

本地夹具说明文档：

- `D:\Products\AgileBuilder\v2\cli\case\README.md`
- `D:\Products\AgileBuilder\v2\cli\case\github-template-case-inventory.md`

## 测试脚本

可执行测试脚本：

```powershell
D:\Products\AgileBuilder\v2\cli\case-temp\run-core1-cli-acceptance.ps1
```

脚本每次运行都会重置以下目录：

```text
D:\Products\AgileBuilder\v2\cli\case-temp\data
D:\Products\AgileBuilder\v2\cli\case-temp\outputs
D:\Products\AgileBuilder\v2\cli\case-temp\logs
```

脚本会设置：

```powershell
$env:AGILEBUILDER_CORE1_DATA_DIR = "D:\Products\AgileBuilder\v2\cli\case-temp\data"
```

这样可以确保本地资源和配置测试不会污染真实用户数据目录。

## 构建命令

```powershell
cd D:\Products\AgileBuilder\v2\cli\core1
npm run build
```

结果：通过。

## 验收测试命令

```powershell
cd D:\Products\AgileBuilder\v2\cli\core1
powershell -ExecutionPolicy Bypass -File D:\Products\AgileBuilder\v2\cli\case-temp\run-core1-cli-acceptance.ps1
```

结果：

```text
PASS: 47 command cases completed.
```

汇总文件：

```text
D:\Products\AgileBuilder\v2\cli\case-temp\core1-cli-acceptance-summary.json
```

详细 stdout/stderr 日志：

```text
D:\Products\AgileBuilder\v2\cli\case-temp\logs
```

## 命令用例

本次共执行 47 条命令用例。

| 用例 | 预期退出码 | 命令参数 |
| --- | --- | --- |
| `version` | 0 | `--version` |
| `help` | 0 | `--help` |
| `config-list-default` | 0 | `config list --json` |
| `config-set-language` | 0 | `config set language en-US --json` |
| `config-get-language` | 0 | `config get language --json` |
| `config-set-hooks-default` | 0 | `config set template.allowHooksDefault true --json` |
| `config-get-hooks-default` | 0 | `config get template.allowHooksDefault --json` |
| `space-list` | 0 | `space list --json` |
| `space-current` | 0 | `space current --json` |
| `space-use-local` | 0 | `space use local --json` |
| `auth-status-empty` | 0 | `auth status --json` |
| `logout` | 0 | `logout --json` |
| `auth-require-token-fail` | 1 | `auth require-token --json` |
| `device-list-fail-no-token` | 1 | `device list --json` |
| `create-basic-direct` | 0 | `create --git-url https://github.com/agilebuilder/template-case-basic-copy.git --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\basic-direct --json` |
| `create-vars-direct` | 0 | `create --git-url https://github.com/agilebuilder/template-case-vars-paths.git --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\vars-direct --var projectName=demo-api ownerName=AgileBuilder --json` |
| `create-vars-json-direct` | 0 | `create --git-url https://github.com/agilebuilder/template-case-vars-paths.git --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\vars-json-direct --vars D:\Products\AgileBuilder\v2\cli\case\template-case-vars-paths\sample-vars.json --json` |
| `create-file-patterns-direct` | 0 | `create --git-url https://github.com/agilebuilder/template-case-file-patterns.git --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\file-patterns-direct --var projectName=pattern-demo --json` |
| `create-subdir-source-direct` | 0 | `create --git-url https://github.com/agilebuilder/template-case-subdir-source.git --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\subdir-source-direct --json` |
| `create-multi-api-direct` | 0 | `create --git-url https://github.com/agilebuilder/template-case-multi-template-repo.git --subdir templates/api --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\multi-api-direct --var serviceName=orders --json` |
| `create-multi-web-direct` | 0 | `create --git-url https://github.com/agilebuilder/template-case-multi-template-repo.git --subdir templates/web --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\multi-web-direct --var appTitle=Dashboard --json` |
| `create-hooks-skipped-direct` | 0 | `create --git-url https://github.com/agilebuilder/template-case-hooks.git --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\hooks-skipped-direct --json` |
| `create-hooks-allowed-direct` | 0 | `create --git-url https://github.com/agilebuilder/template-case-hooks.git --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\hooks-allowed-direct --allow-hooks --json` |
| `res-list-empty` | 0 | `res list --json` |
| `res-add-template-basic` | 0 | `res add template --name basic-copy --git-url https://github.com/agilebuilder/template-case-basic-copy.git --branch main --description "Basic copy case" --tags case,basic --json` |
| `res-add-template-api-subdir` | 0 | `res add template --name multi-api --git-url https://github.com/agilebuilder/template-case-multi-template-repo.git --branch main --subdir templates/api --description "API subdir case" --tags case,subdir --json` |
| `res-add-doc-file` | 0 | `res add doc --name local-doc --file D:\Products\AgileBuilder\v2\cli\case-temp\resource-doc.md --format markdown --description "Local document" --tags case,doc --json` |
| `res-list-all` | 0 | `res list --json` |
| `res-list-template` | 0 | `res list --type template --json` |
| `res-search-basic` | 0 | `res search basic --json` |
| `res-search-doc` | 0 | `res search document --type doc --json` |
| `res-get-template-1` | 0 | `res get 1 --json` |
| `res-get-doc-3` | 0 | `res get 3 --json` |
| `create-resource-basic` | 0 | `create 1 --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\resource-basic --json` |
| `create-resource-subdir` | 0 | `create 2 --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\resource-subdir --var serviceName=billing --json` |
| `res-remove-without-yes-fail` | 1 | `res remove 1 --json` |
| `res-remove-template-1` | 0 | `res remove 1 --yes --json` |
| `res-get-removed-fail` | 1 | `res get 1 --json` |
| `res-list-after-remove` | 0 | `res list --json` |
| `create-missing-source-fail` | 1 | `create --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\missing-source --json` |
| `create-missing-required-var-fail` | 1 | `create --git-url https://github.com/agilebuilder/template-case-vars-paths.git --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\missing-var --json` |
| `create-target-not-empty-fail` | 1 | `create --git-url https://github.com/agilebuilder/template-case-basic-copy.git --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\basic-direct --json` |
| `create-target-overwrite-ok` | 0 | `create --git-url https://github.com/agilebuilder/template-case-basic-copy.git --target D:\Products\AgileBuilder\v2\cli\case-temp\outputs\basic-direct --overwrite --json` |
| `res-invalid-type-fail` | 1 | `res list --type bad --json` |
| `res-get-missing-fail` | 1 | `res get 9999 --json` |
| `config-unknown-key-fail` | 1 | `config get unknown.key --json` |
| `res-browse-not-implemented` | 0 | `res browse` |

## 生成项目验证

测试脚本在项目生成后执行了文件系统断言。

已验证的直接 Git URL 生成场景：

- `template-case-basic-copy`：`src/index.js` 存在，并且 `.git` 未被复制。
- `template-case-vars-paths`：`demo-api/README.md` 包含 `AgileBuilder`；`demo-api/src/demo-api.ts` 包含 `demo-api`。
- 使用 `--vars` 的 `template-case-vars-paths`：`json-vars-app/README.md` 包含 `AgileBuilder JSON`。
- `template-case-file-patterns`：渲染文件包含 `pattern-demo`；原始文件仍保留字面量 `<%= projectName %>`。
- `template-case-subdir-source`：`src/main.ts` 包含 `nested-source-app`；根目录专用文件未生成。
- `template-case-multi-template-repo` 的 API 子模板：`package.json` 包含 `orders-api`。
- `template-case-multi-template-repo` 的 Web 子模板：`index.html` 包含 `Dashboard`。
- 未传 `--allow-hooks` 的 `template-case-hooks`：`HOOK_RAN.txt` 不存在。
- 传入 `--allow-hooks` 的 `template-case-hooks`：`HOOK_RAN.txt` 存在，并包含 `Hook executed`。

已验证的基于资源创建项目场景：

- 资源 `1` 成功生成 basic copy 用例。
- 资源 `2` 使用 `subdir: templates/api`，成功生成 `billing-api`。

## 本地资源测试结果

本地资源存储正确支持：

- 空列表。
- 添加 template 资源。
- 添加带 `subdir` 的 template 资源。
- 从文件添加 doc 资源。
- 列出全部资源。
- 按 `--type template` 列表过滤。
- 按关键词搜索。
- 按关键词和 doc 类型搜索。
- 按 ID 获取 template。
- 按 ID 获取 doc。
- remove 不带 `--yes` 时拒绝删除。
- 带 `--yes` 删除成功。
- 删除后的资源无法再获取。

删除后，资源存储保留了资源 `2` 和资源 `3`，符合预期。

## 错误路径结果

以下预期失败场景均返回非零退出码，并输出结构化 JSON 错误：

- 缺少 create source：`CREATE_SOURCE_REQUIRED`。
- 缺少必填模板变量：`TEMPLATE_VARS_MISSING`。
- target 非空且未传 `--overwrite`：`TARGET_NOT_EMPTY`。
- 非法资源类型：`UNSUPPORTED_RESOURCE_TYPE`。
- 资源不存在：`RESOURCE_NOT_FOUND`。
- 未知配置 key：包装为系统错误，消息为 `Unknown config key: unknown.key`。
- auth token 不可用：`AUTH_TOKEN_UNAVAILABLE`。
- 未登录时执行 device list：`AUTH_TOKEN_UNAVAILABLE`。

同时验证了 `--overwrite` 可以允许写入已有 target。

## 观察项

1. `res` 当前没有 edit/update 命令。

   用户期望测试本地资源“增删改查”。当前 CLI 已实现 add、list、search、get、remove，但没有 edit/update，因此“改”不是当前已支持能力，无法作为成功路径测试。

2. `res browse` 输出未实现提示，但退出码为 `0`。

   命令：

   ```powershell
   node dist\cli\index.js res browse
   ```

   输出：

   ```text
   Error: Interactive resource browser is not implemented yet.
   ```

   由于它输出的是错误语义，如果该命令表示尚不支持，返回非零退出码可能更合适。

3. `config set template.allowHooksDefault true` 可以保存配置，但当前不会影响 `create`。

   本次测试中 hook 行为仍然需要显式传入 `--allow-hooks`。这与当前 `create` 命令实现一致，因为它只把 `options.allowHooks` 传给模板引擎。如果 `template.allowHooksDefault` 设计上应该生效，则 `create` 需要读取并应用该配置。

4. 本地 doc 文件内容包含 Windows PowerShell 生成的 UTF-8 BOM。

   这没有影响资源 add/list/get 行为。如果后续需要更干净的文档测试夹具，可以使用无 BOM 的 UTF-8 文件。

## 结论

Core1 CLI 通过了本次本地与 Git 模板验收测试。

当前已实现的主流程工作正常：

- 公开 Git URL 克隆和项目生成。
- 变量渲染和路径渲染。
- filePatterns 渲染行为。
- 嵌套 source 目录行为。
- 多模板仓库 `--subdir` 行为。
- hook 默认跳过和显式允许执行行为。
- 本地 template/doc 资源 add/list/search/get/remove。
- 从本地 template resource 创建项目。
- 基础 config、workspace、auth-status 和参数校验错误处理。

建议下一步测试：

- 增加一轮带后端认证的验收测试，覆盖 `login`、云端 space、云端 resource 和 device 命令。
- 增加 MCP stdio 测试框架，覆盖 `list_resources`、`get_resource` 和 `create_project`。
- 决定是否实现 `res edit/update`，以及 `res browse` 在未实现状态下是否应返回非零退出码。
