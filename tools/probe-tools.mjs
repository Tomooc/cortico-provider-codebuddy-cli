// 隔离探针：在真实信封形状下，看 CLI 会不会真的用 toolCalls 说话。
import { buildEnvelope, MODEL_SYSTEM_PROMPT } from '../src/envelope.js'
import { readCliResult, resolveCli, runCli } from '../src/cli.js'

const tools = [
  { name: 'pet_say', description: '在你的气泡里说一句话。想让人看到的话只能通过这个工具。', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'pet_ask', description: '在气泡里问一个问题并给出选项。', parameters: { type: 'object', properties: { question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }, required: ['question'] } },
  { name: 'console_send', description: 'Send text to everyone connected to the console.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }
]

const instructions = [
  '你叫 DeepSeek 大肥鱼，住在牢大屏幕的底边，说话用头顶的气泡，一次一两句。',
  '牢大看得见气泡，看不见你的内部文本；想让对方看到的话只能经 pet_say 冒出气泡。'
].join('\n')

const request = {
  model: 'default',
  instructions,
  tools,
  input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: '牢大说：hello' }] }]
}

const envelope = buildEnvelope(request, {})
console.log('promptBytes =', envelope.diagnostics.promptBytes)
console.log('toolCount   =', envelope.diagnostics.toolCount)

const invocation = await resolveCli('')
console.log('cli         =', invocation.cli || invocation.command)

const args = [
  '--print',
  '--output-format', 'json',
  '--json-schema', JSON.stringify(envelope.schema),
  '--tools', 'StructuredOutput',
  '--strict-mcp-config',
  '--mcp-config', '{"mcpServers":{}}',
  '--no-session-persistence',
  '--max-turns', '4',
  '--system-prompt', MODEL_SYSTEM_PROMPT
]

const started = Date.now()
const res = await runCli(invocation, args, { input: envelope.prompt, timeoutMs: 180000 })
console.log('elapsedMs   =', Date.now() - started)
const out = readCliResult(res.stdout, res.stderr)
console.log('text        =', JSON.stringify(out.structured.text || '').slice(0, 300))
console.log('toolCalls   =', JSON.stringify(out.structured.toolCalls || []).slice(0, 800))
console.log('usage       =', JSON.stringify(out.usage))
