// 探针：走 ACP 握手问 CodeBuddy CLI 要模型目录与当前模型，不发起任何生成。
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const cli = process.env.CODEBUDDY_CLI || path.join(process.env.LOCALAPPDATA || '', 'codebuddy', 'bin', 'codebuddy.exe')
const child = spawn(cli, ['--acp', '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--no-session-persistence'], {
  cwd: os.tmpdir(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
})
let pending = ''
let done = false
const finish = (code) => { if (done) return; done = true; try { child.kill() } catch {}; process.exit(code) }
const send = (id, method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
child.stdin.on('error', () => {})
child.stderr.setEncoding('utf8')
child.stderr.on('data', (chunk) => { const t = String(chunk).trim(); if (t) console.log('stderr:', t.slice(0, 300)) })
child.stdout.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  pending += chunk
  let i
  while ((i = pending.indexOf('\n')) >= 0) {
    const line = pending.slice(0, i)
    pending = pending.slice(i + 1)
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.id !== 1 && msg.id !== 2) continue
    if (msg.error) { console.log('rpcError:', JSON.stringify(msg.error).slice(0, 400)); finish(2); return }
    if (msg.id === 1) { send(2, 'session/new', { cwd: os.tmpdir(), mcpServers: [] }); continue }
    const models = msg.result?.models ?? {}
    console.log('currentModelId  =', models.currentModelId ?? '(absent)')
    const list = Array.isArray(models.availableModels) ? models.availableModels : []
    console.log('availableModels =', list.length)
    for (const m of list) {
      const meta = m._meta ?? {}
      console.log(' -', m.modelId, '|', m.name ?? '', '| credits:', meta.credits ?? '', '| maxInputTokens:', meta.maxInputTokens ?? '', '| reasoning:', meta.supportsReasoning === true)
    }
    finish(0)
  }
})
child.once('error', (e) => { console.log('spawnError:', e?.code); finish(3) })
const timer = setTimeout(() => { console.log('timeout'); finish(4) }, 90000)
timer.unref?.()
send(1, 'initialize', { protocolVersion: 1, clientInfo: { name: 'probe-catalog', version: '0.1.0' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } })
