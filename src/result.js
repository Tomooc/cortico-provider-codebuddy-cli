// 结构化结果校验：只接受 {text, toolCalls}，工具名必须在本次请求的工具表里。
import { randomUUID } from 'node:crypto'
import { CliError } from './cli.js'

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** 严格解析 structured_output；不猜、不修、不补字段。 */
export function parseStructuredOutput(value, tools = []) {
  const allowed = new Set(tools.map((tool) => tool.name))
  const fail = (code, message) => {
    throw new CliError(code, message)
  }
  let payload = value
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      fail('CLI_STRUCTURED_OUTPUT_INVALID', 'structured_output 不是可解析的 JSON 字符串。')
    }
  }
  if (!isRecord(payload)) {
    fail('CLI_STRUCTURED_OUTPUT_INVALID', 'structured_output 必须是包含 text 与 toolCalls 的对象。')
  }
  let text = payload.text
  let calls = payload.toolCalls
  if ((typeof text !== 'string' || text === null) && Array.isArray(calls) && calls.length > 0) text = ''
  if (typeof text !== 'string') fail('CLI_STRUCTURED_OUTPUT_INVALID', '结构化结果的 text 字段缺失或类型错误。')
  if (!Array.isArray(calls)) fail('CLI_STRUCTURED_OUTPUT_INVALID', '结构化结果的 toolCalls 字段必须是数组。')
  if (!text.trim() && calls.length === 0) fail('CLI_STRUCTURED_OUTPUT_EMPTY', '模型返回了空回复且没有工具调用。')
  const converted = calls.map((call) => {
    if (!isRecord(call)) fail('CLI_TOOL_CALL_INVALID', '工具请求必须是对象。')
    if (typeof call.name !== 'string' || !allowed.has(call.name)) {
      fail('CLI_TOOL_CALL_INVALID', '模型返回了未声明的工具：' + String(call.name) + '。')
    }
    let args = call.arguments
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args)
      } catch {
        fail('CLI_TOOL_CALL_INVALID', '工具参数不是完整 JSON。')
      }
    }
    if (!isRecord(args)) fail('CLI_TOOL_CALL_INVALID', '工具参数必须是 JSON 对象。')
    return { callId: 'call_' + randomUUID(), name: call.name, arguments: JSON.stringify(args) }
  })
  return { text, calls: converted }
}
