// 假 CLI：只为自测读 stdin、回一份带 structured_output 的 JSON，不联网。
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  raw += chunk
})
process.stdin.on('end', () => {
  const document = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    structured_output: { text: 'pong from fake CLI', toolCalls: [] },
    usage: { input_tokens: raw.length, output_tokens: 3, total_tokens: raw.length + 3 }
  }
  process.stdout.write(JSON.stringify(document) + '\n')
})
