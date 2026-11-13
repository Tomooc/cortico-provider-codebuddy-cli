# Changelog

## 0.2.7

- 修国内版：`resolveCliEnv` 的 `cn` 分支改为官方 `dsh-codebuddy-cli-cn` 口径 —— 只设 `CODEBUDDY_INTERNET_ENVIRONMENT=internal`，不显式指定目录就不塞 `CODEBUDDY_CONFIG_DIR`（强塞一个不存在的 `~/.dsh-codebuddy-cli-cn` 会让 CLI 读不到登录态，等于国内版不可用）。
- 新增 `applyCliEnv(base, { region, configDir })`：真正传给子进程的环境；cn 与自动回落时清掉从父进程继承的 `CODEBUDDY_CONFIG_DIR`，避免国际版通道串到国内版；`official` 既不注入也不清理。
- `src/index.js` 的 `cliEnvOf()` 改用 `applyCliEnv`。
- 模型下拉显示积分倍率：CLI 的 `_meta.credits`（`x0.29 credits`）压成 `×0.29` 拼进 `displayName`（如 `Hy4 Preview · ×0.29`）。Cortico 的 `ListedModel` 没有倍率字段、端点页只渲染 `displayName`，因此只能放在标签里；`id` 不变，不影响 `--model` 透传。
- 实测：`/api/providers/codebuddy-intl/models` 返回 `Hy4 Preview · ×0.29`、`Hy3 · ×0.00`、`Primary · ×3.31`、`GPT-6-Astra · ×6.67` 等；`applyCliEnv` 四档输出经安装副本核对（auto/intl → intl home + public，cn → 仅 internal，official → 原样）；selftest 5/5。

## 0.2.6

- 新增「区域（国际版 / 国内版）」端点配置：`auto`（检测到 `~/.dsh-codebuddy-cli-intl` 即走国际版）/ `intl` / `cn` / `official`。国际版会注入 `CODEBUDDY_CONFIG_DIR` 与 `CODEBUDDY_INTERNET_ENVIRONMENT=public`；不带这两个变量时 CLI 会落到官方默认 home（`~/.codebuddy`）拿国内凭据去打 `copilot.tencent.com`，生成阶段直接 401。
- 新增「CLI 配置目录」：留空按区域取默认（国际版 `~/.dsh-codebuddy-cli-intl`，国内版 `~/.dsh-codebuddy-cli-cn`），填了则覆盖。
- `src/cli.js` 新增 `resolveCliEnv({ region, configDir })`；`cliCandidates()` 补上 `%LOCALAPPDATA%\dsh-codebuddy-cli-{intl,cn}\cli`。
- `src/model-catalog.js` 的 ACP 探测接受 `env` 并传给 spawn，与生成路径共用同一份区域环境。
- `src/index.js` 用 `cliEnvOf()` 统一解析，接入 `respondWith` 与 `listModels`；`compatibilityKey()` 纳入 `region` / `configDir`。
- 新增 `tools/probe-intl-e2e.mjs`：端到端验证信封 → spawn（插件自己的区域 env）→ `structured_output` → 严格校验。
- 实测：Coopanion 0.2.20（`cortico.api = 6`）加载通过；`POST /api/providers/codebuddy-intl/test` 返回 `{"ok":true,"status":200,"model":"hy4free"}`。

## 0.2.5

- 仓库改名为 `cortico-provider-codebuddy-cli`，与插件包名对齐；README 标题与开头的「仓库名 / 包名」对照同步更新，并注明旧名 `coopanion-workbuddy-cli` 会自动重定向。
- 代码零变更，`src/*` 与 0.2.4 逐字节相同。

## 0.2.4

- README 的项目名改为仓库名 `coopanion-workbuddy-cli`，并在开头注明包名仍为 `cortico-provider-codebuddy-cli`（Coopanion 扩展按包名识别，改包名会让已装扩展失联）。
- 代码零变更，`src/*` 与 0.2.3 逐字节相同。

## 0.2.3

- 修文档编码事故：README 曾被 PowerShell 以非 UTF-8 编码回写，导致 GitHub 上整篇显示为乱码（`把` → `鎶?`）。本版以 UTF-8 重写 README 全文。
- 代码零变更：`src/*` 与 0.2.2 逐字节相同；受影响的只有文档与上一次打出的 tarball 内那份 README。

## 0.2.2

- 端点页把插件自有的三项单独成卡并改名，避免与 Coopanion 内置的「模型」字段混淆：卡片标题 `CodeBuddy CLI 选项（插件）`，字段 `模型（插件 · --model）` / `推理强度（--effort）` / `上下文窗口（插件覆盖 · token）`。
- 卡片描述里写明：内置 `spec.model` 决定账本记什么型号，`options.model` 决定实际传给 CLI 的 `--model`。
- 无行为变更，仅文案与分组；`options.*` 的字段路径、enum、取值范围保持不变。

## 0.2.1

- 端点页新增三个可选配置：**模型**（下拉，选项来自 ACP 探测的目录，含「跟随 CLI 当前模型」）、**推理强度**（`--effort`：follow / minimal / low / medium / high / xhigh / max）、**上下文窗口**（16000–1000000 token，手动覆盖探测值）。
- 修一个真 bug：`request.model` 等于 `spec.model`（默认 `default`）时会抢在 `options.model` 前面，导致 `--model` 永远不传。现在 `default` 一律当「未指定」跳过。
- `listModels()` 与 `contextWindow()` 都会应用手动窗口；`compatibilityKey()` 纳入三个新配置，改完即时重建实例。

## 0.2.0

- 模型目录改为走 CodeBuddy CLI 的 ACP 握手探测（`--acp` → `initialize` → `session/new`），不再写死型号；探测失败只退回「跟随 CLI 当前模型」一项。
- 补齐可分发 manifest：`cortico.icon` / `cortico.describe` / `cortico.tags`、`license`、`keywords`（`cortico-provider` 等）、`files`。
- 新增 `tools/install.ps1`、`tools/install.sh`：一行装进 Coopanion 扩展目录，并登记为 `file:` 依赖（绝不查 npm registry）。

## 0.1.0

- 首个可用版本：把 CodeBuddy CLI 接成 Cortico provider（`kind=codebuddy-cli`, `api=6`）。
- 协议信封 + `outputSchema`（工具名 enum 硬锁）+ `StructuredOutput` 单出口。
- 严格解析 `structured_output`，未声明工具 / 坏参数 / 空回复直接判错。
- 按 `ResponseAccumulator` 状态机装配 Responses 事件流。
- 子进程调度：20 MiB stdout 上限、超时杀进程树、固定模式错误分类（401/402/403/429/400 上下文/网络）。
