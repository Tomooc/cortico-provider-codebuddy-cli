# Changelog

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
