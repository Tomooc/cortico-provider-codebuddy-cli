// Cortico 的 Responses 产物：响应资源、用量换算、以及必须过 ResponseAccumulator 校验的事件流。
import { randomUUID } from 'node:crypto'

const CHUNK = 800

/** 与框架 createResponse() 同形的底稿。 */
export function baseResponse(request = {}, model = '') {
  const now = Math.floor(Date.now() / 1000)
  return {
    id: 'resp_' + randomUUID(),
    object: 'response',
    created_at: now,
    completed_at: null,
    status: 'in_progress',
    incomplete_details: null,
    model: typeof model === 'string' ? model : '',
    previous_response_id: null,
    instructions: typeof request.instructions === 'string' ? request.instructions : null,
    output: [],
    error: null,
    tools: Array.isArray(request.tools) ? request.tools : [],
    tool_choice: request.tool_choice === undefined ? 'auto' : request.tool_choice,
    truncation: request.truncation === undefined ? 'disabled' : request.truncation,
    parallel_tool_calls: request.parallel_tool_calls === undefined ? false : request.parallel_tool_calls,
    text: request.text === undefined ? { format: { type: 'text' } } : request.text,
    top_p: request.top_p === undefined ? 1 : request.top_p,
    presence_penalty: request.presence_penalty === undefined ? 0 : request.presence_penalty,
    frequency_penalty: request.frequency_penalty === undefined ? 0 : request.frequency_penalty,
    top_logprobs: request.top_logprobs === undefined ? 0 : request.top_logprobs,
    temperature: request.temperature === undefined ? 1 : request.temperature,
    reasoning: request.reasoning ? { effort: request.reasoning.effort === undefined ? null : request.reasoning.effort, summary: request.reasoning.summary === undefined ? null : request.reasoning.summary } : null,
    usage: null,
    max_output_tokens: request.max_output_tokens === undefined ? null : request.max_output_tokens,
    max_tool_calls: request.max_tool_calls === undefined ? null : request.max_tool_calls,
    store: request.store === undefined ? false : request.store,
    background: request.background === undefined ? false : request.background,
    service_tier: request.service_tier === undefined ? 'default' : request.service_tier,
    metadata: request.metadata === undefined ? null : request.metadata,
    safety_identifier: request.safety_identifier === undefined ? null : request.safety_identifier,
    prompt_cache_key: request.prompt_cache_key === undefined ? null : request.prompt_cache_key
  }
}

const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** CLI 的 usage 摊成 TokenMeters；缺项留 null（框架据此判定 usage 不可知）。 */
export function metersFromUsage(usage) {
  const source = usage && typeof usage === 'object' ? usage : {}
  const input = number(source.input_tokens) === null ? number(source.prompt_tokens) : number(source.input_tokens)
  const output = number(source.output_tokens) === null ? number(source.completion_tokens) : number(source.output_tokens)
  const total = number(source.total_tokens) === null ? (input === null || output === null ? null : input + output) : number(source.total_tokens)
  const cached = number(source.cache_read_input_tokens) === null
    ? (number(source.cache_hit_tokens) === null ? (input === null ? null : 0) : number(source.cache_hit_tokens))
    : number(source.cache_read_input_tokens)
  const reasoning = number(source.reasoning_tokens) === null ? (output === null ? null : 0) : number(source.reasoning_tokens)
  return { input, output, total, cachedInput: cached, uncachedInput: input, reasoning, native: usage && typeof usage === 'object' ? usage : null }
}

/** 全部计量齐全才给标准 Usage；否则 null。 */
export function usageOf(meters) {
  const { input, output, total, cachedInput, reasoning } = meters
  if (input === null || output === null || total === null || cachedInput === null || reasoning === null) return null
  return {
    input_tokens: input,
    output_tokens: output,
    total_tokens: total,
    input_tokens_details: { cached_tokens: cachedInput },
    output_tokens_details: { reasoning_tokens: reasoning }
  }
}

function chunks(text) {
  if (text.length <= CHUNK) return [text]
  const out = []
  for (let index = 0; index < text.length; index += CHUNK) out.push(text.slice(index, index + CHUNK))
  return out
}

/**
 * 一次性装配完整事件序列并返回终态响应。
 * 事件顺序与字段按 ResponseAccumulator 的要求：sequence_number 从 0 严格递增、
 * response.created 第一条、每个 item 先 added 再 done、终态 response.output 与已关闭 item 完全一致。
 */
export function streamResponse({ emit, response, text, calls, usage }) {
  const send = typeof emit === 'function' ? emit : () => {}
  const items = []
  let sequence = 0
  const push = (event) => send({ ...event, sequence_number: sequence++ })
  push({ type: 'response.created', response: { ...response, output: [] } })

  if (typeof text === 'string' && text.length > 0) {
    const index = items.length
    const id = 'msg_' + randomUUID()
    push({ type: 'response.output_item.added', output_index: index, item: { type: 'message', id, role: 'assistant', status: 'in_progress', content: [] } })
    push({ type: 'response.content_part.added', output_index: index, item_id: id, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
    for (const delta of chunks(text)) push({ type: 'response.output_text.delta', output_index: index, item_id: id, content_index: 0, delta })
    push({ type: 'response.output_text.done', output_index: index, item_id: id, content_index: 0, text })
    const part = { type: 'output_text', text, annotations: [] }
    push({ type: 'response.content_part.done', output_index: index, item_id: id, content_index: 0, part })
    const item = { type: 'message', id, role: 'assistant', status: 'completed', content: [part] }
    push({ type: 'response.output_item.done', output_index: index, item })
    items.push(item)
  }

  for (const call of calls) {
    const index = items.length
    const id = 'fc_' + randomUUID()
    push({ type: 'response.output_item.added', output_index: index, item: { type: 'function_call', id, call_id: call.callId, name: call.name, arguments: call.arguments, status: 'in_progress' } })
    const item = { type: 'function_call', id, call_id: call.callId, name: call.name, arguments: call.arguments, status: 'completed' }
    push({ type: 'response.output_item.done', output_index: index, item })
    items.push(item)
  }

  const final = { ...response, status: 'completed', completed_at: Math.floor(Date.now() / 1000), output: items, usage: usage === undefined ? null : usage }
  push({ type: 'response.completed', response: final })
  return final
}
