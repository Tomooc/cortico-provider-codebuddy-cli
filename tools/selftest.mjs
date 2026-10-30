// 离线自测：信封、schema 硬锁、结构化结果校验、事件流状态机、子进程与 stdout 解析。
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEnvelope, outputSchema, requestTools } from '../src/envelope.js'
import { classifyFailure, readCliResult, runCli } from '../src/cli.js'
import { parseStructuredOutput } from '../src/result.js'
import { baseResponse, metersFromUsage, streamResponse, usageOf } from '../src/response.js'

let passed = 0
const ok = (label) => {
  passed += 1
  console.log('ok   ' + label)
}

const request = {
  model: 'default',
  instructions: 'You are Coo.',
  tools: [
    { name: 'pet_say', description: 'Say something.', parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
    { name: 'console_send', description: 'Send to console.', parameters: { type: 'object', properties: { text: { type: 'string' } } } }
  ],
  input: [
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
    { type: 'function_call', call_id: 'c1', name: 'pet_say', arguments: '{}' },
    { type: 'function_call_output', call_id: 'c1', output: 'done' }
  ]
}

const tools = requestTools(request)
assert.deepEqual(tools.map((tool) => tool.name), ['pet_say', 'console_send'])
const schema = outputSchema(tools)
assert.deepEqual(schema.properties.toolCalls.items.properties.name.enum, ['pet_say', 'console_send'])
assert.equal(schema.required.join(','), 'text,toolCalls')
assert.equal(schema.additionalProperties, false)
const envelope = buildEnvelope(request, {})
assert.ok(envelope.prompt.includes('cortico-codebuddy-cli/v1'))
assert.ok(envelope.prompt.includes('StructuredOutput'))
assert.equal(envelope.diagnostics.toolCount, 2)
assert.equal(envelope.diagnostics.messageCount, 4)
ok('信封：工具表、schema 硬锁、消息折叠')

const parsed = parseStructuredOutput({ text: 'hello', toolCalls: [{ name: 'pet_say', arguments: { text: 'yo' } }] }, tools)
assert.equal(parsed.text, 'hello')
assert.equal(parsed.calls[0].name, 'pet_say')
assert.equal(JSON.parse(parsed.calls[0].arguments).text, 'yo')
assert.ok(parsed.calls[0].callId.startsWith('call_'))
assert.throws(() => parseStructuredOutput({ text: 'x', toolCalls: [{ name: 'rm_rf', arguments: {} }] }, tools), (error) => error.code === 'CLI_TOOL_CALL_INVALID')
assert.throws(() => parseStructuredOutput({ text: 'x', toolCalls: [{ name: 'pet_say', arguments: 'not-json' }] }, tools), (error) => error.code === 'CLI_TOOL_CALL_INVALID')
assert.throws(() => parseStructuredOutput({ text: '   ', toolCalls: [] }, tools), (error) => error.code === 'CLI_STRUCTURED_OUTPUT_EMPTY')
ok('结构化结果：文本、工具、未声明工具、坏参数、空回复')

const events = []
const response = baseResponse(request, 'default')
const meters = metersFromUsage({ input_tokens: 10, output_tokens: 5, total_tokens: 15, cache_read_input_tokens: 0, reasoning_tokens: 0 })
const final = streamResponse({ emit: (event) => events.push(event), response, text: 'hello world', calls: parsed.calls, usage: usageOf(meters) })
assert.equal(events[0].type, 'response.created')
assert.equal(events[events.length - 1].type, 'response.completed')
for (let index = 0; index < events.length; index += 1) assert.equal(events[index].sequence_number, index)
assert.equal(final.status, 'completed')
assert.equal(final.output.length, 2)
assert.equal(final.output[0].type, 'message')
assert.equal(final.output[1].type, 'function_call')
assert.equal(final.output[1].status, 'completed')
assert.equal(events[events.length - 1].response.output.length, 2)
const added = events.filter((event) => event.type === 'response.output_item.added')
const done = events.filter((event) => event.type === 'response.output_item.done')
assert.equal(added.length, 2)
assert.equal(done.length, 2)
assert.deepEqual(done[0].item.content, final.output[0].content)
assert.deepEqual(done[1].item.arguments, final.output[1].arguments)
assert.equal(final.usage.input_tokens, 10)
ok('事件流：序号递增、created 首、completed 尾、item 闭合一致、usage 落地')

const here = path.dirname(fileURLToPath(import.meta.url))
const result = await runCli({ command: process.execPath, args: [path.join(here, 'fake-cli.mjs')] }, ['--print'], { input: 'ping', timeoutMs: 20000 })
const read = readCliResult(result.stdout, result.stderr)
assert.equal(read.structured.text, 'pong from fake CLI')
assert.equal(read.usage.output_tokens, 3)
assert.equal(read.structured.toolCalls.length, 0)
ok('子进程：stdin 投递、stdout JSON 解析')

assert.throws(() => readCliResult(JSON.stringify({ type: 'result', result: 'plain text' }), ''), (error) => error.code === 'CLI_STRUCTURED_OUTPUT_MISSING')
assert.throws(() => readCliResult('[{"type":"result","structured_output":{"text":"a","toolCalls":[]}},{"type":"result","structured_output":{"text":"b","toolCalls":[]}}]', ''), (error) => error.code === 'CLI_RESULT_AMBIGUOUS')
const classified = classifyFailure('', 'Error: HTTP 401 unauthorized', 'X', 'fallback')
assert.equal(classified.code, 'CLI_AUTH_REQUIRED')
assert.equal(classified.status, 401)
assert.equal(classifyFailure('', 'Error: HTTP 429 rate limit', 'X', 'fallback').code, 'CLI_RATE_LIMITED')
ok('CLI 结果读取与错误分类')

console.log('')
console.log('total passed = ' + passed)
