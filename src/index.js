// Cortico provider 模块：把 CodeBuddy 官方 CLI 当成「无状态、只按 JSON Schema 吐结构化结果」的推理后端。
// 工具执行权 100% 留在 Cortico；CLI 侧只有一个出口 StructuredOutput。
import { randomUUID } from 'node:crypto'
import { GenerationError, unknownMeters } from 'cortico/core/generation.ts'
import { MODEL_SYSTEM_PROMPT, buildEnvelope, requestTools } from './envelope.js'
import { applyCliEnv, readCliResult, resolveCli, runCli } from './cli.js'
import { parseStructuredOutput } from './result.js'
import { baseResponse, metersFromUsage, streamResponse, usageOf } from './response.js'
import { createModelCatalog } from './model-catalog.js'

const DEFAULT_TIMEOUT_MS = 180000
const DEFAULT_MAX_TURNS = 4
/** 「不传 --model」的哨兵：由 CLI 自己的当前模型决定。 */
const FOLLOW_CLI_ID = 'default'
const FOLLOW_CLI = { id: FOLLOW_CLI_ID, displayName: '跟随 CLI 当前模型' }
/** 「不传 --effort」的哨兵：强度跟随请求里的 reasoning.effort。 */
const FOLLOW_REQUEST_ID = 'follow'

/** `codebuddy --effort` 接受的挡位（取自 `codebuddy --help`）。 */
export const EFFORTS = [
  { id: 'minimal', label: 'minimal · 最快' },
  { id: 'low', label: 'low · 快' },
  { id: 'medium', label: 'medium · 标准' },
  { id: 'high', label: 'high · 深' },
  { id: 'xhigh', label: 'xhigh · 更深' },
  { id: 'max', label: 'max · 最深' }
]
const EFFORT_IDS = EFFORTS.map((item) => item.id)

/** 区域：auto 按本机存在的 home 自动选；official 完全不改环境。 */
export const REGIONS = [
  { id: 'auto', label: '自动（有 ~/.dsh-codebuddy-cli-intl 就走国际版）' },
  { id: 'intl', label: '国际版（CODEBUDDY_INTERNET_ENVIRONMENT=public）' },
  { id: 'cn', label: '国内版（CODEBUDDY_INTERNET_ENVIRONMENT=internal）' },
  { id: 'official', label: '官方默认（不注入任何区域变量）' }
]
const REGION_IDS = REGIONS.map((item) => item.id)

/** 上下文窗口可手动改的范围（token）。 */
export const CONTEXT_WINDOW_MIN = 16000
export const CONTEXT_WINDOW_MAX = 1000000
const CONTEXT_WINDOW_FALLBACK = 200000

/** 模型目录只探测一份，`config()` 与 `listModels()` 共用同一份快照。 */
const catalog = createModelCatalog()

const TIERS = [
  { id: 'off', label: '不思考', thinking: false },
  { id: 'low', label: '思考 · 快', thinking: true, effort: 'low' },
  { id: 'high', label: '思考 · 标准', thinking: true, effort: 'high' },
  { id: 'max', label: '思考 · 最深', thinking: true, effort: 'max' }
]

function optionsOf(entry) {
  return entry && typeof entry.options === 'object' && entry.options !== null && !Array.isArray(entry.options) ? entry.options : {}
}

function intOption(value, min, max, fallback) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback
  return Math.round(parsed)
}

function cliPathOf(entry) {
  const value = optionsOf(entry).cliPath
  return typeof value === 'string' ? value.trim() : ''
}

/** 配置目录：留空则按区域取默认（国际版 ~/.dsh-codebuddy-cli-intl）。 */
function configDirOf(entry) {
  const value = optionsOf(entry).configDir
  return typeof value === 'string' ? value.trim() : ''
}

function regionOf(entry) {
  const value = optionsOf(entry).region
  if (typeof value !== 'string') return 'auto'
  const trimmed = value.trim().toLowerCase()
  return REGION_IDS.includes(trimmed) ? trimmed : 'auto'
}

/** 生成与探测共用同一份区域环境。 */
function cliEnvOf(entry) {
  return applyCliEnv(process.env, { region: regionOf(entry), configDir: configDirOf(entry) })
}

/** 积分倍率：CLI 的 _meta.credits 形如 "x0.29 credits"，压成 ×0.29 挂到下拉标签上。 */
function creditsLabel(credits) {
  const text = typeof credits === 'string' ? credits.trim() : ''
  if (!text) return ''
  const matched = text.match(/[x×]\s*([\d.]+)/iu)
  return matched ? `×${matched[1]}` : text.slice(0, 24)
}

/** 手动上下文窗口；0 = 没设，用探测值。 */
function contextWindowOf(entry) {
  return intOption(optionsOf(entry).contextWindow, CONTEXT_WINDOW_MIN, CONTEXT_WINDOW_MAX, 0)
}

/** 推理强度：`follow` / 空 → ''（跟随请求）；其余必须是 CLI 认的挡位。 */
function effortOf(entry) {
  const value = optionsOf(entry).effort
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed || trimmed === FOLLOW_REQUEST_ID) return ''
  return EFFORT_IDS.includes(trimmed) ? trimmed : ''
}

function normalize(entry) {
  const options = { ...optionsOf(entry) }
  for (const key of ['cliPath', 'model', 'configDir', 'region']) {
    if (typeof options[key] === 'string') {
      const trimmed = options[key].trim()
      if (trimmed) options[key] = trimmed
      else delete options[key]
    }
  }
  if (options.effort === undefined || options.effort === null || options.effort === '') delete options.effort
  if (options.contextWindow === undefined || options.contextWindow === null || options.contextWindow === '') delete options.contextWindow
  return { ...entry, options }
}

/**
 * 型号解析：请求里的 model → options.model → spec.model。
 * Coopanion 发请求时 request.model 就是 spec.model，所以 `default` 必须当「未指定」跳过，
 * 否则 options.model 永远抢不到。
 */
function resolveModel(request, settings, spec) {
  const candidates = [request && request.model, settings.model, spec.model]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (trimmed && trimmed !== FOLLOW_CLI_ID) return trimmed
  }
  return FOLLOW_CLI_ID
}

/** CLI 参数：单次无状态运行、禁 MCP、禁会话落盘、只允许 StructuredOutput。 */
function buildArgs({ model, effort, schema, maxTurns }) {
  return [
    '--print',
    '--output-format', 'json',
    '--json-schema', JSON.stringify(schema),
    '--tools', 'StructuredOutput',
    '--strict-mcp-config',
    '--mcp-config', '{"mcpServers":{}}',
    '--no-session-persistence',
    '--max-turns', String(maxTurns),
    '--system-prompt', MODEL_SYSTEM_PROMPT,
    ...(model && model !== FOLLOW_CLI_ID ? ['--model', model] : []),
    ...(effort ? ['--effort', effort] : [])
  ]
}

function attemptFor(origin, generationId, purpose) {
  return {
    id: randomUUID(),
    generationId,
    ordinal: 0,
    origin: structuredClone(origin),
    startedAt: new Date().toISOString(),
    elapsedMs: 0,
    requestId: null,
    responseId: null,
    outcome: 'failed',
    status: null,
    serviceTier: null,
    requestedServiceTier: null,
    purpose,
    meters: unknownMeters(),
    charges: []
  }
}

/** 真正的一次调用：拼信封 → spawn CLI → 读 structured_output → 校验 → 装事件流。 */
async function respondWith(name, entry, host, request, options) {
  const current = host && typeof host.currentEntry === 'function' ? host.currentEntry() : null
  const live = current && typeof current === 'object' ? { ...entry, ...current } : entry
  const settings = optionsOf(live)
  const spec = live && typeof live.spec === 'object' && live.spec !== null ? live.spec : {}
  const model = resolveModel(request, settings, spec)
  const effortFromRequest = request.reasoning && typeof request.reasoning.effort === 'string' && request.reasoning.effort !== 'none' && request.reasoning.effort !== FOLLOW_REQUEST_ID
    ? request.reasoning.effort
    : ''
  const effort = effortOf(live) || effortFromRequest
  const timeoutMs = intOption(settings.timeoutMs, 15000, 900000, DEFAULT_TIMEOUT_MS)
  const maxTurns = intOption(settings.maxTurns, 1, 16, DEFAULT_MAX_TURNS)
  const origin = options.origin && typeof options.origin === 'object'
    ? options.origin
    : { instance: name, module: 'codebuddy-cli', model, compatibilityDomain: String(live && live.baseUrl ? live.baseUrl : 'http://127.0.0.1/codebuddy-cli') }
  const generationId = randomUUID()
  const attempt = attemptFor(origin, generationId, options.diagnostic ? 'diagnostic' : 'generation')
  const startedMs = Date.now()
  try {
    const tools = requestTools(request)
    const envelope = buildEnvelope(request, options)
    const invocation = await resolveCli(cliPathOf(live))
    const result = await runCli(invocation, buildArgs({ model, effort, schema: envelope.schema, maxTurns }), {
      input: envelope.prompt,
      timeoutMs,
      env: cliEnvOf(live),
      signal: options.signal
    })
    const parsedCli = readCliResult(result.stdout, result.stderr)
    const parsed = parseStructuredOutput(parsedCli.structured, tools)
    const response = baseResponse(request, parsedCli.model || model)
    const meters = metersFromUsage(parsedCli.usage)
    attempt.meters = meters
    attempt.elapsedMs = Date.now() - startedMs
    attempt.outcome = options.signal && options.signal.aborted ? 'discarded' : 'completed'
    attempt.status = 200
    const final = streamResponse({
      emit: options.onEvent,
      response,
      text: parsed.text,
      calls: parsed.calls,
      usage: usageOf(meters)
    })
    attempt.responseId = final.id
    return { response: final, origin, attempts: [attempt] }
  } catch (error) {
    attempt.elapsedMs = Date.now() - startedMs
    attempt.outcome = options.signal && options.signal.aborted ? 'aborted' : 'failed'
    const status = error && typeof error.status === 'number' ? error.status : 0
    const body = error && typeof error.body === 'string' ? error.body : ''
    const message = error instanceof Error ? error.message : String(error)
    const cause = error instanceof Error ? error : undefined
    throw new GenerationError(message, [attempt], null, origin, status, body, cause ? { cause } : undefined)
  }
}

/** 端点页的配置组：模型 / 推理强度 / 上下文窗口 / CLI 与调用参数。 */
function configGroup(name, entry, language) {
  const key = (field) => `providers.${name}.options.${field}`
  const cliPath = cliPathOf(entry)
  const cliEnv = cliEnvOf(entry)
  // 顺手踢一次探测；失败不抛，`listModels()` 会给出结论。
  void catalog.get({ cliPath, env: cliEnv })
  const snapshot = catalog.snapshot(cliPath)
  const modelIds = snapshot.models.map((model) => model.id).filter((id) => id && id !== FOLLOW_CLI_ID)
  const modelProperties = modelIds.length
    ? {
      type: 'string',
      enum: [FOLLOW_CLI_ID, ...modelIds],
      title: '模型（插件 · --model）',
      description: `来自 CodeBuddy CLI 的模型目录（共 ${modelIds.length} 个）；选「跟随 CLI 当前模型」则不传 --model。`
    }
    : {
      type: 'string',
      title: '模型 ID',
      description: snapshot.error ? `模型目录探测失败（${snapshot.error}），可手填模型 ID，留空则跟随 CLI。` : '模型目录探测中；留空则跟随 CLI 当前模型。'
    }
  return [{
    id: `llm.codebuddy.${name}`,
    owner: 'provider:codebuddy-cli',
    schema: {
      type: 'object',
      title: 'CodeBuddy CLI 选项（插件）',
      description: '这里是插件自己的模型 / 推理强度 / 上下文窗口，与上面那格官方「模型」（spec.model）不是一回事：那格决定账本记什么型号，这里决定实际传给 CLI 的 --model 与 --effort。',
      properties: {
        [key('model')]: modelProperties,
        [key('effort')]: {
          type: 'string',
          enum: [FOLLOW_REQUEST_ID, ...EFFORT_IDS],
          title: '推理强度（--effort）',
          description: `透传 --effort；「跟随请求」表示不传、由 Cortico 的 reasoning.effort 决定。可选：${EFFORT_IDS.join(' / ')}。`
        },
        [key('contextWindow')]: {
          type: 'integer',
          minimum: CONTEXT_WINDOW_MIN,
          maximum: CONTEXT_WINDOW_MAX,
          title: '上下文窗口（插件覆盖 · token）',
          description: `手动指定窗口，覆盖 CLI 探测值；范围 ${CONTEXT_WINDOW_MIN}–${CONTEXT_WINDOW_MAX}，留空用探测值（探测不到时按 ${CONTEXT_WINDOW_FALLBACK}）。`
        },
        [key('cliPath')]: {
          type: 'string',
          title: 'CLI 路径',
          description: 'codebuddy 可执行文件；留空自动查找安装目录与 PATH。'
        },
        [key('region')]: {
          type: 'string',
          enum: [...REGION_IDS],
          title: '区域（国际版 / 国内版）',
          description: '国际版会注入 CODEBUDDY_INTERNET_ENVIRONMENT=public 与 CODEBUDDY_CONFIG_DIR；官方默认表示完全不改环境。'
        },
        [key('configDir')]: {
          type: 'string',
          title: 'CLI 配置目录',
          description: '留空按区域取默认（国际版 ~/.dsh-codebuddy-cli-intl，国内版 ~/.dsh-codebuddy-cli-cn）；填了则覆盖。'
        },
        [key('timeoutMs')]: {
          type: 'integer',
          title: '超时（毫秒）',
          description: '单次 CLI 调用超时，默认 180000，范围 15000–900000。'
        },
        [key('maxTurns')]: {
          type: 'integer',
          title: '最大轮数',
          description: '透传 --max-turns，默认 4，范围 1–16；防止 CLI 自己多轮跑。'
        }
      }
    }
  }]
}

const MODULE = {
  id: 'codebuddy-cli',
  title: 'CodeBuddy CLI',
  description: '把 CodeBuddy 官方 CLI 当作无状态的 JSON Schema 推理后端：CLI 只负责吐出 {text,toolCalls}，工具由 Cortico 自己执行。',
  describe: { protocols: ['codebuddy-cli'], auth: [], local: true, input: ['text'] },
  // 框架要求 baseUrl 是不含凭据的 HTTP(S) URL；本模块不发起任何网络请求，它只是配置槽位。
  defaultBaseUrl: 'http://127.0.0.1/codebuddy-cli',
  baseUrlSuggestions: ['http://127.0.0.1/codebuddy-cli'],
  reasoningTiers: TIERS,
  effortSuggestions: [...EFFORT_IDS],
  serviceTiers: [],
  config: configGroup,
  normalize,
  validateEntry(entry) {
    const settings = optionsOf(entry)
    if (settings.cliPath !== undefined && typeof settings.cliPath !== 'string') throw new Error('cliPath 必须是字符串')
    if (settings.model !== undefined && typeof settings.model !== 'string') throw new Error('model 必须是字符串')
    if (settings.configDir !== undefined && typeof settings.configDir !== 'string') throw new Error('configDir 必须是字符串')
    if (settings.region !== undefined && settings.region !== '' && !REGION_IDS.includes(String(settings.region).trim().toLowerCase())) {
      throw new Error(`region 只能是 ${REGION_IDS.join(' / ')}`)
    }
    if (settings.effort !== undefined && settings.effort !== '' && settings.effort !== FOLLOW_REQUEST_ID && !EFFORT_IDS.includes(settings.effort)) {
      throw new Error(`effort 只能是 ${[FOLLOW_REQUEST_ID, ...EFFORT_IDS].join(' / ')}`)
    }
    if (settings.contextWindow !== undefined && settings.contextWindow !== '') {
      const window = Number(settings.contextWindow)
      if (!Number.isFinite(window) || window < CONTEXT_WINDOW_MIN || window > CONTEXT_WINDOW_MAX) {
        throw new Error(`contextWindow 必须是 ${CONTEXT_WINDOW_MIN}–${CONTEXT_WINDOW_MAX} 之间的整数`)
      }
    }
    if (settings.timeoutMs !== undefined && !Number.isFinite(Number(settings.timeoutMs))) throw new Error('timeoutMs 必须是数字')
    if (settings.maxTurns !== undefined && !Number.isFinite(Number(settings.maxTurns))) throw new Error('maxTurns 必须是数字')
  },
  accepts: () => false,
  contextOverflow(error) {
    if (!error) return false
    if (error.status !== 0 && error.status !== 400 && error.status !== 413) return false
    return /context|too long|too many tokens/i.test(String(error.body || error.message || ''))
  },
  create(name, entry, host) {
    const client = {
      async respond(request, options) {
        return respondWith(name, entry, host, request, options || {})
      },
      bind() {
        return client
      }
    }
    /** 现场读一次端点，改完配置不用重启即生效。 */
    const liveEntry = () => {
      const live = host && typeof host.currentEntry === 'function' ? host.currentEntry() : null
      return normalize(live && typeof live === 'object' ? { ...entry, ...live } : entry)
    }
    return {
      client,
      // 目录不写死：问 CLI 要；探测失败只留「跟随 CLI」一项。
      listModels: async () => {
        const live = liveEntry()
        const override = contextWindowOf(live)
        const snapshot = await catalog.get({ cliPath: cliPathOf(live), env: cliEnvOf(live) })
        const rows = snapshot.models.map((model) => {
          const window = override || model.contextWindow
          // 框架的 ListedModel 没有倍率字段，下拉只渲染 displayName，所以把倍率拼进标签。
          const credits = creditsLabel(model.credits)
          const displayName = credits ? `${model.displayName} · ${credits}` : model.displayName
          return { id: model.id, displayName, ...(window ? { contextWindow: window } : {}) }
        })
        const head = override ? { ...FOLLOW_CLI, contextWindow: override } : { ...FOLLOW_CLI }
        return [head, ...rows.filter((row) => row.id !== FOLLOW_CLI_ID)]
      },
      contextWindow(model) {
        const live = liveEntry()
        const override = contextWindowOf(live)
        if (override) return override
        const found = catalog.snapshot(cliPathOf(live)).models.find((item) => item.id === model)
        return found && found.contextWindow ? found.contextWindow : undefined
      },
      compatibilityKey() {
        const live = liveEntry()
        return [name, cliPathOf(live) || 'auto', regionOf(live), configDirOf(live) || 'auto', optionsOf(live).model || FOLLOW_CLI_ID, effortOf(live) || FOLLOW_REQUEST_ID, String(contextWindowOf(live) || 'auto')]
      }
    }
  }
}

export default MODULE
