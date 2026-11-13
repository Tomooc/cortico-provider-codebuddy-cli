// 模型目录：问 CodeBuddy CLI 自己（ACP 握手），不写死型号。
// 与 dsh-dkn-codebuddy-cli 的 queryModelCatalog 同一套做法。
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveCli } from './cli.js'

/** ACP 返回的目录 → 本模块用的列表；形状不认识就抛错，不猜。 */
export function normalizeCatalog(result) {
  const source = result && result.models && result.models.availableModels
  if (!Array.isArray(source)) throw new Error('CLI 没有返回可识别的模型目录。')
  const models = []
  const seen = new Set()
  for (const item of source) {
    if (!item || typeof item.modelId !== 'string' || !item.modelId.trim() || seen.has(item.modelId)) continue
    const meta = item._meta || {}
    seen.add(item.modelId)
    models.push({
      id: item.modelId,
      displayName: typeof item.name === 'string' && item.name ? item.name.slice(0, 200) : item.modelId,
      credits: typeof meta.credits === 'string' ? meta.credits.slice(0, 64) : '',
      supportsReasoning: meta.supportsReasoning === true,
      contextWindow: Number.isSafeInteger(meta.maxInputTokens) && meta.maxInputTokens > 0 ? meta.maxInputTokens : undefined
    })
  }
  if (models.length === 0) throw new Error('CLI 没有返回任何可用模型，请先在官方 CLI 里完成登录。')
  return {
    models,
    currentModelId: result.models && typeof result.models.currentModelId === 'string' ? result.models.currentModelId : ''
  }
}

/** 一次 ACP 探测：只列模型，不发起生成。 */
export function queryCatalog({ cliPath = '', env = process.env, timeoutMs = 45000 } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let child
    const finish = (error, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { child && child.kill() } catch {}
      if (error) reject(error)
      else resolve(value)
    }
    resolveCli(cliPath).then((invocation) => {
      const args = [...(invocation.args || []), '--acp', '--tools', '', '--setting-sources', '',
        '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence']
      child = spawn(invocation.command, args, {
        cwd: os.tmpdir(), env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: invocation.shell === true
      })
      const send = (id, method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      let pending = ''
      child.stdin.on('error', () => {})
      child.stderr.resume?.()
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        if (settled) return
        pending += chunk
        let index
        while ((index = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, index)
          pending = pending.slice(index + 1)
          let message
          try { message = JSON.parse(line) } catch { continue }
          if (message.id !== 1 && message.id !== 2) continue
          if (message.error) {
            finish(new Error('CLI 模型探测失败：' + String(message.error.message || 'unknown')))
            return
          }
          if (message.id === 1) {
            send(2, 'session/new', { cwd: os.tmpdir(), mcpServers: [] })
            continue
          }
          try { finish(undefined, normalizeCatalog(message.result)) } catch (error) { finish(error) }
          return
        }
      })
      child.once('error', (error) => finish(new Error('无法启动 CodeBuddy CLI 做模型探测：' + String(error && error.code ? error.code : error))))
      child.once('close', () => finish(new Error('CLI 在返回模型目录前退出，请检查登录状态。')))
      send(1, 'initialize', {
        protocolVersion: 1,
        clientInfo: { name: 'cortico-provider-codebuddy-cli', version: '0.2.0' },
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }
      })
    }).catch((error) => finish(error))
    const timer = setTimeout(() => finish(new Error('CLI 模型探测超时（' + Math.round(timeoutMs / 1000) + ' 秒）。')), timeoutMs)
    timer.unref?.()
  })
}

/** 目录快照落盘位置；`CORTICO_CODEBUDDY_CATALOG_CACHE` 可覆盖（测试用）。 */
export function catalogCacheFile(env = process.env) {
  const override = typeof env.CORTICO_CODEBUDDY_CATALOG_CACHE === 'string' ? env.CORTICO_CODEBUDDY_CATALOG_CACHE.trim() : ''
  return override || path.join(os.homedir(), '.cortico-provider-codebuddy-cli', 'catalog.json')
}

/** 同步读回上一份成功快照：`config()` 是同步接口，不能等探测。 */
function readCatalogCache(file) {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    if (!raw || raw.version !== 1 || !raw.entries || typeof raw.entries !== 'object') return {}
    const out = {}
    for (const [key, value] of Object.entries(raw.entries)) {
      if (!value || !Array.isArray(value.models)) continue
      const models = value.models.filter((item) => item && typeof item.id === 'string' && item.id)
      if (!models.length) continue
      out[key] = {
        models,
        currentModelId: typeof value.currentModelId === 'string' ? value.currentModelId : '',
        savedAt: Number(value.savedAt) || 0
      }
    }
    return out
  } catch { return {} }
}

function writeCatalogCache(file, cache) {
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ version: 1, entries: cache }), 'utf8')
  } catch {}
}

/** 带 TTL 的目录缓存；失败按更短的间隔重试，不拖住每次生成。 */
export function createModelCatalog({ ttlMs = 15 * 60000, retryMs = 60000, now = Date.now, cacheFile = catalogCacheFile() } = {}) {
  const entries = new Map()
  const cache = readCatalogCache(cacheFile)
  const entryOf = (key) => {
    if (!entries.has(key)) {
      // 有落盘快照就先拿它顶上：`config()` 同步返回时也能列出模型与倍率，不必等这次探测。
      const saved = cache[key]
      entries.set(key, {
        state: saved ? 'ready' : 'idle',
        models: saved ? saved.models : [],
        currentModelId: saved ? saved.currentModelId : '',
        error: '',
        attemptedAt: 0,
        promise: null
      })
    }
    return entries.get(key)
  }
  const snapshot = (cliPath = '') => {
    const entry = entryOf(cliPath || 'auto')
    return { state: entry.state, models: entry.models, currentModelId: entry.currentModelId, error: entry.error }
  }
  return {
    snapshot,
    async get({ cliPath = '', env = process.env, force = false } = {}) {
      const key = cliPath || 'auto'
      const entry = entryOf(key)
      if (entry.promise) { await entry.promise; return snapshot(cliPath) }
      const age = now() - entry.attemptedAt
      if (!force && entry.attemptedAt > 0 && age < (entry.error ? retryMs : ttlMs)) return snapshot(cliPath)
      entry.state = 'checking'
      entry.attemptedAt = now()
      entry.promise = queryCatalog({ cliPath, env })
        .then((result) => {
          entry.models = result.models
          entry.currentModelId = result.currentModelId
          entry.error = ''
          entry.state = 'ready'
          cache[key] = { models: result.models, currentModelId: result.currentModelId, savedAt: now() }
          writeCatalogCache(cacheFile, cache)
        })
        .catch((error) => {
          entry.state = entry.models.length ? 'stale' : 'error'
          entry.error = error instanceof Error ? error.message : String(error)
        })
        .finally(() => { entry.promise = null })
      await entry.promise
      return snapshot(cliPath)
    }
  }
}
