# cortico-provider-codebuddy-cli

把 **CodeBuddy 官方 CLI** 接成 Coopanion（Cortico 内核）的一个模型端点。CLI 只当「无状态、只会按 JSON Schema 吐结构化结果」的推理后端，**工具执行权 100% 留在 Coopanion**。

> **仓库名与包名一致**：`cortico-provider-codebuddy-cli` — https://github.com/Tomooc/cortico-provider-codebuddy-cli
> Coopanion 扩展按包名 + `cortico-provider` 关键字识别，所以仓库名、扩展目录名、`dependencies` 键、tarball 文件名统一用这个包名。旧仓库名 `coopanion-workbuddy-cli` 会自动重定向到新地址，老 clone 与推送不会断。

## 原理

```
Coopanion 发起 Responses 请求（instructions + context items + tools）
  → 本 provider 拼 JSON 信封（messages + tools + responseSchema，工具名 enum 硬锁）
  → spawn codebuddy --print --output-format json --json-schema <schema>
        --tools StructuredOutput --strict-mcp-config --mcp-config {"mcpServers":{}}
        --no-session-persistence --max-turns 4 --system-prompt <MODEL_SYSTEM_PROMPT>
  → 只读 stdout 的 structured_output（缺失即报错，不用自由文本顶替）
  → 严格校验 {text, toolCalls}（未声明工具 → CLI_TOOL_CALL_INVALID）
  → 翻成 Cortico 的 Response / output items / 流事件 / usage / attempts
  → Coopanion 自己执行工具，再把结果作为 function_call_output 回灌进来
```

与 `dsh-dkn-codebuddy-cli` 同构的几条纪律：

- CLI 侧只留 `StructuredOutput` 一个出口，禁 MCP、禁会话落盘、`max-turns` 限死。
- 工具名写进 schema 的 `enum`，越界调用在解析期就被拒，不会静默丢。
- 数组形式的 CLI 输出必须恰好一条 `type === "result"`，否则 `CLI_RESULT_AMBIGUOUS`。
- 错误按固定正则分类（402 / 400 上下文 / 401 / 403 / 429 / EPERM / 网络），stderr 原文不外泄。

## 安装

### 方式一：Coopanion 扩展页（只认目录）

> **实测限制**：扩展页的安装接口（`POST /api/extensions/check` / `install`）只接受**目录路径**。填 `.tgz` 会被拒：`{"error":"目录不存在: ...tgz"}`；填解压后的目录则正常返回 `{"name":...,"version":...,"kind":"provider"}`。
>
> 所以：`tar -xzf cortico-provider-codebuddy-cli-0.2.5.tgz` 取出里面的 `package/` 目录再填，或者直接填源码目录。
>
> **要让别人真正一键装**：把包发布到 npm（`npm publish`，包名带 `cortico-provider` 关键字即可被「扩展」页的市场检索命中），之后别人只需在市场里搜索安装，不碰本地路径。

1. 把本目录打成 tarball：`npm pack`（或直接用目录本身）。
2. 打开 Coopanion → 「扩展」页 → 安装 → 填 **本地路径**（`...\cortico-provider-codebuddy-cli-0.2.5.tgz` 解压后的目录，或源码目录）。
3. 重启 Core（扩展页会提示 `restartRequired`）。
4. 「设置 → 模型端点」新建端点，模块选 **CodeBuddy CLI**。

### 方式二：一行脚本（推荐）

```powershell
pwsh -File tools/install.ps1
```

```sh
sh tools/install.sh
```

脚本会：定位 Coopanion → 把包复制到 `extensions/vendor/` 与 `extensions/node_modules/` → 在 `extensions/package.json` 里登记 `file:./vendor/cortico-provider-codebuddy-cli` → 请求 `/api/run/restart`。

> **不要**把依赖写成 `"cortico-provider-codebuddy-cli": "0.1.0"` 这种版本号。`0.1.0` 是 registry 语义，pnpm 会去 npmjs 拉包，而这个包没有发布 → `ERR_PNPM_FETCH_404`，并且会连带把**同一目录下任何 world 扩展的安装**一起打断（pnpm 装新包前要先解析该目录的全部依赖）。本地包一律用 `file:` 路径。

### 方式三：手动

```
<Coopanion>/data/extensions/
  package.json                      # dependencies 里加 "cortico-provider-codebuddy-cli": "file:./vendor/cortico-provider-codebuddy-cli"
  vendor/cortico-provider-codebuddy-cli/      # 源码副本（pnpm 的安装源）
  node_modules/cortico-provider-codebuddy-cli/ # 运行时加载的副本
```

改完 `POST http://127.0.0.1:17788/api/run/restart`。

## 前置条件

- Coopanion 0.2.x（框架 `cortico.api = 6`）。
- Node ≥ 22。
- 官方 CodeBuddy CLI 已安装并登录（`codebuddy --version` 可用）。默认查找顺序：`options.cliPath` → `%LOCALAPPDATA%\codebuddy\bin` → `%LOCALAPPDATA%\dsh-codebuddy-cli-{intl,cn}\cli` → `~/.codebuddy/bin` → `%APPDATA%\npm` → PATH。

### 国际版 / 国内版（区域适配）

国际版 CLI 必须同时带这两个环境变量，否则会落到官方默认 home（`~/.codebuddy`）用国内那份凭据去打 `copilot.tencent.com`，生成阶段直接 401：

```
CODEBUDDY_CONFIG_DIR          = ~/.dsh-codebuddy-cli-intl
CODEBUDDY_INTERNET_ENVIRONMENT = public
```

插件用 `resolveCliEnv({ region, configDir })` 统一解析（与 `dsh-codebuddy-cli-intl` 的 `lib/intl/cli-runtime.js` 同一口径），生成路径与 ACP 模型探测共用同一份 env。默认 `region=auto`：本机存在 `~/.dsh-codebuddy-cli-intl` 就走国际版，否则回落到 `~/.dsh-codebuddy-cli-cn`，都没有则不注入任何变量。

## 端点选项

端点页里有一张卡片 **「CodeBuddy CLI 选项（插件）」**，三项在这里选：

| 键 | 默认 | 说明 |
|---|---|---|
| `options.model` | `default`（跟随 CLI） | **下拉**，选项来自 CLI 的 ACP 模型目录；选具体 id 就传 `--model`，账本也记真实型号 |
| `options.effort` | `follow`（跟随请求） | **下拉**：`follow` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`，透传 `--effort` |
| `options.contextWindow` | 探测值 | **整数**，16000–1000000 token，手动覆盖上报给 Cortico 的窗口（决定上下文预算与裁剪） |
| `options.cliPath` | 自动 | codebuddy 可执行文件路径 |
| `options.region` | `auto` | **下拉**：`auto`（存在 `~/.dsh-codebuddy-cli-intl` 就走国际版）/ `intl` / `cn` / `official`（完全不注入区域变量） |
| `options.configDir` | 按区域 | CLI 配置目录；留空取区域默认（国际版 `~/.dsh-codebuddy-cli-intl`，国内版 `~/.dsh-codebuddy-cli-cn`） |
| `options.timeoutMs` | 180000 | 单次 CLI 调用超时（15000–900000） |
| `options.maxTurns` | 4 | 透传 `--max-turns`（1–16），防止 CLI 自己多轮跑 |

型号解析顺序：请求里的 `model` → `options.model` → `spec.model` → 跟随 CLI。Coopanion 发请求时 `request.model` 就等于 `spec.model`，所以 `default` 会被当作「未指定」跳过——这样 `options.model` 才抢得到。

> **两张不同的「模型」，别混**：卡片「模型与生成」里那格官方 `spec.model` 决定 `/api/usage` 账本记什么型号；插件这格 `options.model`（标题带「插件 · --model」）决定实际传给 CLI 的 `--model`。想让报表也显示真实型号，两处填同一个 id。

## 模型目录

不写死型号。`listModels()` 走 CLI 的 ACP 握手（`--acp` → `initialize` → `session/new`）读 `models.availableModels` 与 `currentModelId`，15 分钟缓存、失败 60 秒后重试。探测失败时只保留一项 `default`（跟随 CLI 当前模型），不臆造型号。

在作者机器（CLI 2.178.1）实测探测到的当前模型是 `hy4-preview`，可选 16 项，含 `deepseek-v4.1-flash`、`glm-5.3-flash`、`kimi-k3.1-pro`、`step-5-preview`、`mimo-v2.6-pro` 等。**不把你钉在这份表上**——它会随账号与 CLI 版本变。

想让账本记真实型号（而不是 `default`），把 `spec.model` 写成具体 id 即可；此时 provider 会传 `--model`。

## 常见错误

| code | 含义 / 处理 |
|---|---|
| `CLI_NOT_FOUND` | 找不到 codebuddy；填 `options.cliPath` |
| `CLI_TIMEOUT` | 超时，进程树已 `taskkill /T /F` |
| `CLI_OUTPUT_TOO_LARGE` | stdout 超 20 MiB |
| `CLI_OUTPUT_EMPTY` / `CLI_OUTPUT_INVALID` | stdout 为空或不是 JSON |
| `CLI_RESULT_AMBIGUOUS` | 输出里最终结果不唯一 |
| `CLI_STRUCTURED_OUTPUT_MISSING` | 没吐 `structured_output` |
| `CLI_STRUCTURED_OUTPUT_INVALID` | `structured_output` 不是 `{text, toolCalls}` |
| `CLI_STRUCTURED_OUTPUT_EMPTY` | 空文本且无工具调用 |
| `CLI_TOOL_CALL_INVALID` | 未声明工具 / 参数不是对象 |
| `CLI_TOOL_PROTOCOL_ERROR` | 模型把 Cortico 工具当 CLI 原生工具调用 |
| `CLI_AUTH_REQUIRED` (401) | CLI 登录失效，重新 `/login` |
| `CLI_INSUFFICIENT_BALANCE` (402) | 官方额度不足 |
| `CLI_ACCESS_DENIED` (403) / `CLI_RATE_LIMITED` (429) | 权限 / 限流 |
| `CLI_CONTEXT_TOO_LARGE` (400) | 对话超上下文 |
| `CLI_LOCAL_PERMISSION_DENIED` | 本机文件权限 |
| `CLI_NETWORK_ERROR` | 到官方服务的连接中断 |

## 开发与自测

```bash
node tools/selftest.mjs        # 5 组离线用例，不需要 CLI、不联网
node tools/probe-cli.mjs       # 看 spawn / 首字节 / exit / close 四个时刻
node tools/probe-tools.mjs     # 真实信封下验证模型会用 toolCalls 说话
node tools/probe-catalog.mjs   # ACP 握手，打印当前模型与可选目录
```

`selftest` 覆盖：信封与 schema 硬锁、结构化结果校验（文本 / 工具 / 未声明工具 / 坏参数 / 空回复）、事件流状态机（序号递增、`response.created` 首、`response.completed` 尾、item 闭合一致、usage）、子进程 stdin→stdout、错误分类。

## 目录

```
src/envelope.js      协议信封 + outputSchema + MODEL_SYSTEM_PROMPT
src/cli.js           定位 CLI / .cmd shim 拆包 / 子进程调度 / 错误分类 / structured_output 读取
src/result.js        严格校验 {text, toolCalls}
src/response.js      Response 底稿 / usage 换算 / Responses 事件流
src/model-catalog.js ACP 模型目录探测 + TTL 缓存
src/index.js         ProviderModule（含 config 分组、validateEntry、create）
tools/               安装脚本与四个探针/自测
```

## 许可

MIT，见 `LICENSE`。
