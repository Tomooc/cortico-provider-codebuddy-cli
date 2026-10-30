// 隔离探针：只看 codebuddy 子进程的 spawn / 首字节 / exit / close 四个时刻。
// 用法：node probe-cli.mjs [--big] [--setting-sources-empty] [--cli <path>]
import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import os from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
const big = argv.includes('--big')
const withSettingSources = argv.includes('--setting-sources-empty')
const cliFlag = argv.indexOf('--cli')
const cli = cliFlag >= 0 && argv[cliFlag + 1]
  ? argv[cliFlag + 1]
  : path.join(process.env.LOCALAPPDATA || '', 'codebuddy', 'bin', 'codebuddy.exe')

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string' },
    toolCalls: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' }, arguments: { type: 'object' } },
        required: ['name', 'arguments']
      }
    }
  },
  required: ['text', 'toolCalls']
}

const filler = big ? 'pad '.repeat(4000) : ''
const prompt = `请处理下面的请求。使用 StructuredOutput 工具恰好提交一次对象 {"text":"回复内容","toolCalls":[]}。\n\n${JSON.stringify({ protocol: 'probe/v1', messages: [{ role: 'user', content: 'reply with text=pong and empty toolCalls' }], pad: filler })}`

const args = [
  '--print',
  '--output-format', 'json',
  '--json-schema', JSON.stringify(schema),
  '--tools', 'StructuredOutput',
  '--strict-mcp-config',
  '--mcp-config', '{"mcpServers":{}}',
  '--no-session-persistence',
  '--max-turns', '4',
  '--system-prompt', 'You are acting as a model endpoint; submit {text,toolCalls} once via StructuredOutput.'
]
if (withSettingSources) args.push('--setting-sources', '')

console.log('cli            =', cli)
console.log('promptBytes    =', Buffer.byteLength(prompt))
console.log('big            =', big, '| settingSourcesEmpty =', withSettingSources)

const t0 = performance.now()
const mark = (label) => console.log(`${label.padEnd(14)} +${Math.round(performance.now() - t0)}ms`)

const child = spawn(cli, args, { cwd: os.tmpdir(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false })
let stdout = ''
let stderr = ''
let firstByte = false
let exited = false
let closed = false
let settled = false

const done = (code) => {
  if (settled) return
  settled = true
  console.log('---')
  console.log('exited         =', exited, '| closed =', closed)
  console.log('stdoutBytes    =', Buffer.byteLength(stdout))
  console.log('stdoutHead     =', JSON.stringify(stdout.slice(0, 300)))
  console.log('stderrHead     =', JSON.stringify(stderr.slice(0, 300)))
  process.exit(code)
}

mark('spawned')
let graceTimer = null

child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', (chunk) => {
  if (!firstByte) { firstByte = true; mark('first-stdout') }
  stdout += chunk
})
child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4096) })
child.stdin.on('error', () => {})
child.once('error', (error) => {
  mark('spawn-error')
  console.log('errorCode      =', error?.code)
  done(2)
})
child.once('exit', (code, signal) => {
  exited = true
  mark('exit')
  console.log('exitCode       =', code, '| signal =', signal)
  graceTimer = setTimeout(() => {
    mark('close-timeout')
    console.log('VERDICT        = close never fired after exit (inherited pipe likely held open by a grandchild)')
    done(7)
  }, 8000)
})
child.once('close', (code) => {
  closed = true
  mark('close')
  console.log('closeCode      =', code)
  if (graceTimer) clearTimeout(graceTimer)
  done(code === 0 && stdout.trim() ? 0 : 5)
})

const hard = setTimeout(() => {
  mark('hard-timeout')
  console.log('VERDICT        = no exit within 120s')
  try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }) } catch {}
  done(9)
}, 120000)
hard.unref?.()

child.stdin.end(prompt)
