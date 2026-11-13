// 端到端链路验证：信封 → spawn（插件自己的区域 env）→ structured_output → 严格校验。
// 用法：node tools/probe-intl-e2e.mjs            自动区域
//       PROBE_REGION=intl node tools/probe-intl-e2e.mjs
import { buildEnvelope } from '../src/envelope.js'
import { readCliResult, resolveCli, resolveCliEnv, runCli } from '../src/cli.js'
import { parseStructuredOutput } from '../src/result.js'

const request = {
  instructions: 'You are acting as a model endpoint inside Cortico.',
  input: '打个招呼，并调用一次 pet_say。',
  tools: [{
    name: 'pet_say',
    description: '让桌宠说一句话',
    parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
  }]
}

const region = process.env.PROBE_REGION || 'auto'
const resolved = resolveCliEnv({ region })
const env = { ...process.env, ...resolved }

console.log('region   =', region)
console.log('env      =', JSON.stringify(resolved))

const envelope = buildEnvelope(request, {})
const invocation = await resolveCli('')
console.log('cli      =', invocation.cli || invocation.command)
console.log('prompt   =', envelope.bytes, 'bytes')

const args = [
  '--print',
  '--output-format', 'json',
  '--json-schema', JSON.stringify(envelope.schema),
  '--tools', 'StructuredOutput',
  '--strict-mcp-config',
  '--mcp-config', JSON.stringify({ mcpServers: {} }),
  '--no-session-persistence',
  '--max-turns', '2',
  '--system-prompt', 'You are acting as a model endpoint. Submit {text,toolCalls} via StructuredOutput only.'
]

const started = Date.now()
const result = await runCli(invocation, args, { input: envelope.prompt, timeoutMs: 180000, env })
const parsedCli = readCliResult(result.stdout, result.stderr)
const parsed = parseStructuredOutput(parsedCli.structured, request.tools)

console.log('elapsed  =', Date.now() - started, 'ms')
console.log('model    =', parsedCli.model)
console.log('text     =', JSON.stringify(parsed.text))
console.log('calls    =', JSON.stringify(parsed.calls))
console.log('usage    =', JSON.stringify(parsedCli.usage))
console.log('RESULT   = OK')
