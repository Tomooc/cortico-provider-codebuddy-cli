// 官方 CodeBuddy CLI 的子进程调度：无状态、一次调用、只信 stdout 的 JSON。
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { access, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const IS_WIN = process.platform === 'win32'
const MAX_STDOUT_BYTES = 20 * 1024 * 1024
const MAX_STDERR_BYTES = 32 * 1024

export class CliError extends Error {
  constructor(code, message, { status = 0, body = '', facts } = {}) {
    super(message)
    this.name = 'CliError'
    this.code = code
    this.status = status
    this.body = body
    if (facts) this.facts = facts
  }
}

async function exists(target) {
  try { await access(target); return true } catch { return false }
}

/** CLI 候选：显式配置 > 环境变量 > 官方安装目录 > PATH 上的同名命令。 */
export function cliCandidates(configured = '') {
  const out = []
  const seen = new Set()
  const push = (value, source) => {
    if (typeof value !== 'string') return
    const trimmed = value.trim()
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ path: trimmed, source })
  }
  push(configured, 'config')
  push(process.env.CODEBUDDY_CLI_PATH, 'env')
  const names = IS_WIN ? ['codebuddy.exe', 'codebuddy.cmd', 'codebuddy-code.exe', 'cbc.exe'] : ['codebuddy', 'codebuddy-code', 'cbc']
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  const roots = [
    path.join(localAppData, 'codebuddy', 'bin'),
    path.join(localAppData, 'dsh-codebuddy-cli-intl', 'cli'),
    path.join(localAppData, 'dsh-codebuddy-cli-cn', 'cli'),
    path.join(os.homedir(), '.codebuddy', 'bin'),
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'npm'),
    path.join(process.env.ProgramFiles || 'C:/Program Files', 'codebuddy', 'bin')
  ]
  for (const root of roots) for (const name of names) push(path.join(root, name), 'install')
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path')
  for (const dir of String(process.env[pathKey] || '').split(path.delimiter).filter(Boolean)) {
    for (const name of names) push(path.join(dir, name), 'path')
  }
  return out
}

/** Windows 上的 .cmd 包装层会吞掉 stdin 上的协议输入，这里解析出真正的 node 入口。 */
async function unwrapShim(file) {
  try {
    if ((await stat(file)).size > 65536) return null
    const shim = await readFile(file, 'utf8')
    for (const match of shim.matchAll(/"([^"\r\n]*(?:codebuddy|tencent-ai)[\\/][^"\r\n]*[\\/]bin[\\/][^"\r\n]+?)"/giu)) {
      const candidate = match[1].replace(/^%~dp0/iu, `${path.dirname(file)}\\`).replace(/^%dp0%/iu, path.dirname(file))
      if (candidate.includes('%')) continue
      const resolved = path.resolve(path.dirname(file), candidate)
      if (await exists(resolved)) return resolved
    }
  } catch {}
  return null
}

const INTL_HOME = () => path.join(os.homedir(), '.dsh-codebuddy-cli-intl')
const CN_HOME = () => path.join(os.homedir(), '.dsh-codebuddy-cli-cn')

/**
 * 区域环境片段。
 * 国际版必须同时带 CONFIG_DIR 与 INTERNET_ENVIRONMENT=public，否则会落到官方默认 home
 * （~/.codebuddy）用国内那份失效凭据，生成阶段直接 401。
 * 国内版与官方 dsh-codebuddy-cli-cn 同口径：只设 internal；不显式指定目录就不塞 CONFIG_DIR，
 * 让 CLI 用官方默认 home（强塞一个不存在的 ~/.dsh-codebuddy-cli-cn 会让它读不到登录态）。
 */
export function resolveCliEnv({ region = 'auto', configDir = '' } = {}) {
  const pick = String(region || 'auto').trim().toLowerCase()
  if (pick === 'official' || pick === 'default' || pick === 'none') return {}
  const explicit = typeof configDir === 'string' ? configDir.trim() : ''
  if (pick === 'intl') {
    return { CODEBUDDY_CONFIG_DIR: explicit || INTL_HOME(), CODEBUDDY_INTERNET_ENVIRONMENT: 'public' }
  }
  if (pick === 'cn') {
    return { ...(explicit ? { CODEBUDDY_CONFIG_DIR: explicit } : {}), CODEBUDDY_INTERNET_ENVIRONMENT: 'internal' }
  }
  if (explicit) return { CODEBUDDY_CONFIG_DIR: explicit, CODEBUDDY_INTERNET_ENVIRONMENT: 'public' }
  if (existsSync(INTL_HOME())) return { CODEBUDDY_CONFIG_DIR: INTL_HOME(), CODEBUDDY_INTERNET_ENVIRONMENT: 'public' }
  return {}
}

/**
 * 真正传给子进程的环境。
 * 国内版与自动回落时，父进程继承来的 CODEBUDDY_CONFIG_DIR 会被清掉，避免国际版通道串到国内版。
 * official 表示完全不介入：既不注入也不清理。
 */
export function applyCliEnv(base = process.env, { region = 'auto', configDir = '' } = {}) {
  const pick = String(region || 'auto').trim().toLowerCase()
  const explicit = typeof configDir === 'string' ? configDir.trim() : ''
  if (pick === 'official' || pick === 'default' || pick === 'none') return { ...base }
  if (pick === 'auto' && !explicit && !existsSync(INTL_HOME())) return { ...base }
  const fragment = resolveCliEnv({ region: pick, configDir: explicit })
  const env = { ...base }
  if (!fragment.CODEBUDDY_CONFIG_DIR) delete env.CODEBUDDY_CONFIG_DIR
  return { ...env, ...fragment }
}

/** 返回 { command, args }；找不到时抛 CLI_NOT_FOUND。 */
export async function resolveCli(configured = '') {
  const tried = []
  for (const candidate of cliCandidates(configured)) {
    tried.push(candidate.path)
    if (!(await exists(candidate.path))) continue
    const base = path.basename(candidate.path).toLowerCase()
    if (IS_WIN && /\.cmd$/u.test(base)) {
      const entry = await unwrapShim(candidate.path)
      if (entry) {
        const node = path.join(path.dirname(candidate.path), 'node.exe')
        if (await exists(node)) return { command: node, args: [entry], source: candidate.source, cli: candidate.path }
        if (path.basename(process.execPath).toLowerCase() === 'node.exe') return { command: process.execPath, args: [entry], source: candidate.source, cli: candidate.path }
      }
      // 没解析出入口才退回包装层，并把命令行整体交给 shell。
      return { command: candidate.path, args: [], source: candidate.source, cli: candidate.path, shell: IS_WIN }
    }
    return { command: candidate.path, args: [], source: candidate.source, cli: candidate.path }
  }
  throw new CliError('CLI_NOT_FOUND', `找不到 CodeBuddy CLI；已尝试：${tried.join(' / ') || '无候选路径'}。请在端点设置里填写 codebuddy 可执行文件路径。`)
}

/** 一次无状态调用：把提示词写进 stdin，取 stdout；超时/取消都杀整个进程树。 */
export function runCli(invocation, args, { input = '', timeoutMs = 180000, signal, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new CliError('ABORTED', '请求已取消。'))
    const startedAt = Date.now()
    const child = spawn(invocation.command, [...(invocation.args ?? []), ...args], {
      cwd: os.tmpdir(),
      env: { ...env, CODEBUDDY_DISABLE_AUTO_MEMORY: '1', CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS: '1' },
      windowsHide: true,
      shell: invocation.shell === true && IS_WIN,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let bytes = 0
    let settled = false
    let timedOut = false
    let killedBySize = false
    const facts = () => ({ elapsedMs: Date.now() - startedAt, stdoutBytes: bytes, stderrBytes: Buffer.byteLength(stderr), timeoutMs, timedOut })
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      if (error) { error.facts ??= facts(); reject(error) } else resolve(value)
    }
    const kill = () => {
      try {
        if (IS_WIN && Number.isInteger(child.pid)) spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
        else child.kill('SIGKILL')
      } catch {}
    }
    const onAbort = () => { finish(new CliError('ABORTED', '请求已取消。')); kill() }
    const timer = setTimeout(() => { timedOut = true; finish(new CliError('CLI_TIMEOUT', `CodeBuddy CLI 在 ${Math.round(timeoutMs / 1000)} 秒内未完成调用。`)); kill() }, timeoutMs)
    timer.unref?.()
    signal?.addEventListener('abort', onAbort, { once: true })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      if (settled) return
      bytes += Buffer.byteLength(chunk)
      if (bytes > MAX_STDOUT_BYTES) {
        killedBySize = true
        finish(new CliError('CLI_OUTPUT_TOO_LARGE', 'CodeBuddy CLI 的 stdout 超过 20 MiB 上限。'))
        kill()
        return
      }
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-MAX_STDERR_BYTES) })
    child.stdin.on('error', () => {})
    child.once('error', (error) => {
      finish(new CliError(error?.code === 'ENOENT' ? 'CLI_NOT_FOUND' : 'CLI_START_FAILED',
        error?.code === 'ENOENT' ? '找不到 CodeBuddy CLI，请在端点设置里填写路径。' : '无法启动 CodeBuddy CLI。'))
    })
    child.once('close', (code) => {
      if (settled) return
      if (killedBySize) return
      if (timedOut) return
      if (code !== 0) return finish(classifyFailure(stdout, stderr, `CLI_EXIT_${code ?? 'UNKNOWN'}`, `CodeBuddy CLI 退出，代码 ${code ?? '未知'}。`))
      finish(undefined, { stdout, stderr, elapsedMs: Date.now() - startedAt })
    })
    child.stdin.end(input)
  })
}

/** 只按固定模式识别上游语义；stderr 原文不外泄（可能带 key）。 */
export function classifyFailure(stdout = '', stderr = '', fallbackCode = 'CLI_FAILED', fallbackMessage = 'CodeBuddy CLI 调用失败。') {
  const clean = (value) => String(value ?? '').replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
  const notices = `${clean(stderr)}\n${clean(stdout)}`
  const patterns = [
    [/^\s*(?:Error:\s*)?Tool [A-Za-z0-9_.:-]+ not found in agent cli\.?\s*$/imu, 'CLI_TOOL_PROTOCOL_ERROR', '模型把 Cortico 工具误当成 CLI 原生工具调用，未交付本次工具请求。'],
    [/^\s*(?:(?:API\s+)?Error:\s*)?(?:HTTP\s+)?402\b[^\r\n]*(?:insufficient[ _-]balance|balance[ _-]insufficient)/imu, 'CLI_INSUFFICIENT_BALANCE', 'CodeBuddy 官方服务返回余额不足（402）。', 402],
    [/^\s*(?:(?:API\s+)?Error:\s*)?(?:HTTP\s+)?400\b[^\r\n]*(?:prompt\s+(?:is\s+)?too\s+long|context\s+(?:length|window)\s+(?:is\s+)?too\s+long|tokens?\s*>\s*[\d,]+\s*maximum)/imu, 'CLI_CONTEXT_TOO_LARGE', '本次对话超过模型输入上下文上限（400）。', 400],
    [/^\s*(?:Error:\s*)?(?:HTTP\s+)?401\b[^\r\n]*(?:authentication required|unauthorized|sign in|login)/imu, 'CLI_AUTH_REQUIRED', 'CodeBuddy CLI 登录鉴权失败（401），请在官方 CLI 中重新登录。', 401],
    [/^\s*(?:Error:\s*)?(?:HTTP\s+)?403\b[^\r\n]*(?:forbidden|access denied|permission)/imu, 'CLI_ACCESS_DENIED', 'CodeBuddy CLI 服务拒绝访问（403）。', 403],
    [/^\s*(?:Error:\s*)?(?:HTTP\s+)?429\b[^\r\n]*(?:rate|limit|too many)/imu, 'CLI_RATE_LIMITED', 'CodeBuddy CLI 请求受到频率限制（429）。', 429],
    [/^\s*(?:Error:\s*)?(?:EPERM|EACCES):\s*(?:operation not permitted|permission denied)/imu, 'CLI_LOCAL_PERMISSION_DENIED', 'CodeBuddy CLI 无法访问本机文件或目录。'],
    [/^\s*(?:(?:API\s+)?Error:\s*)?(?:ECONNRESET\b|Client network socket disconnected|502\b[^\r\n]*安全连接建立失败)/imu, 'CLI_NETWORK_ERROR', 'CodeBuddy CLI 网络连接失败。']
  ]
  const matched = patterns.find(([pattern]) => pattern.test(notices))
  return new CliError(matched?.[1] ?? fallbackCode, matched?.[2] ?? fallbackMessage, { status: matched?.[3] ?? 0, body: '' })
}

/** 读 stdout 的最终 JSON：native 模式只认 structured_output，不拿自由文本顶替工具请求。 */
export function readCliResult(stdout, stderr = '') {
  const text = String(stdout ?? '').trim()
  if (!text) throw classifyFailure('', stderr, 'CLI_OUTPUT_EMPTY', 'CodeBuddy CLI 的 stdout 为空，未返回 JSON 结果。')
  let document
  try { document = JSON.parse(text) } catch { throw classifyFailure(text, stderr, 'CLI_OUTPUT_INVALID', 'CodeBuddy CLI 返回了非 JSON 输出。') }
  if (Array.isArray(document)) {
    const finals = document.filter((entry) => entry && typeof entry === 'object' && entry.type === 'result')
    if (finals.length !== 1) throw new CliError('CLI_RESULT_AMBIGUOUS', `CodeBuddy CLI 返回了 ${finals.length} 条最终结果记录；未选择其中任意一条。`)
    document = finals[0]
  }
  if (!document || typeof document !== 'object') throw new CliError('CLI_OUTPUT_INVALID', 'CodeBuddy CLI 返回的 JSON 不是对象。')
  const subtype = typeof document.subtype === 'string' ? document.subtype : ''
  if (document.is_error === true || subtype === 'error' || subtype.startsWith('error_')) {
    const notice = [document.error?.message, document.message, document.result].filter((value) => typeof value === 'string' && value.trim()).join(' ')
    throw classifyFailure('', notice, 'CLI_REQUEST_FAILED', 'CodeBuddy CLI 请求失败；请检查登录状态、模型权限或额度。')
  }
  let structured = document.structured_output
  if (structured === undefined || structured === null) {
    if (typeof document.result === 'string' && document.result.trim().startsWith('{')) {
      try { structured = JSON.parse(document.result) } catch { structured = undefined }
    }
  }
  if (structured === undefined || structured === null) {
    throw new CliError('CLI_STRUCTURED_OUTPUT_MISSING', 'CodeBuddy CLI 未返回 structured_output；未使用普通文本替代工具交付。')
  }
  if (typeof structured === 'string') {
    try { structured = JSON.parse(structured) } catch { throw new CliError('CLI_STRUCTURED_OUTPUT_INVALID', 'structured_output 不是可解析的 JSON。') }
  }
  if (!structured || typeof structured !== 'object' || Array.isArray(structured)) {
    throw new CliError('CLI_STRUCTURED_OUTPUT_INVALID', 'structured_output 不是 {text, toolCalls} 对象。')
  }
  return {
    structured,
    usage: document.usage && typeof document.usage === 'object' ? document.usage : {},
    modelUsage: document.modelUsage && typeof document.modelUsage === 'object' ? document.modelUsage : null,
    model: typeof document.model === 'string' ? document.model : '',
    durationMs: typeof document.duration_ms === 'number' ? document.duration_ms : null
  }
}
