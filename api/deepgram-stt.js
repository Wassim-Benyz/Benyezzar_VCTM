import { createHash } from 'node:crypto'

const WS_ACCEPT_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

export function handleDeepgramSttUpgrade(request, socket, head, env = process.env) {
  if (!env.DEEPGRAM_API_KEY || typeof WebSocket === 'undefined') {
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n')
    socket.destroy()
    return
  }

  const websocketKey = request.headers['sec-websocket-key']

  if (!websocketKey) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    socket.destroy()
    return
  }

  acceptWebSocket(socket, websocketKey)

  const deepgramSocket = createDeepgramSocket(env)
  const queuedChunks = []
  let clientBuffer = Buffer.alloc(0)

  deepgramSocket.binaryType = 'arraybuffer'
  deepgramSocket.addEventListener('open', () => {
    while (queuedChunks.length > 0) {
      deepgramSocket.send(queuedChunks.shift())
    }
  })
  deepgramSocket.addEventListener('message', (event) => {
    try {
      sendWebSocketFrame(socket, JSON.stringify({
        type: 'deepgram',
        data: JSON.parse(event.data),
      }))
    } catch {
      sendWebSocketFrame(socket, JSON.stringify({
        type: 'error',
        message: 'Deepgram returned an unreadable transcription event.',
      }))
    }
  })
  deepgramSocket.addEventListener('error', () => {
    sendWebSocketFrame(socket, JSON.stringify({
      type: 'error',
      message: 'Deepgram transcription failed.',
    }))
  })
  deepgramSocket.addEventListener('close', () => {
    sendCloseFrame(socket)
  })

  socket.on('data', (buffer) => {
    const parsedFrames = readWebSocketFrames(Buffer.concat([clientBuffer, buffer]))
    clientBuffer = parsedFrames.remaining

    parsedFrames.frames.forEach((frame) => {
      if (frame.opcode === 8) {
        deepgramSocket.close()
        socket.destroy()
        return
      }

      if (frame.opcode !== 2 || frame.payload.length === 0) {
        return
      }

      if (deepgramSocket.readyState === WebSocket.OPEN) {
        deepgramSocket.send(frame.payload)
        return
      }

      queuedChunks.push(frame.payload)
    })
  })
  socket.on('close', () => {
    deepgramSocket.close()
  })
  socket.on('error', () => {
    deepgramSocket.close()
  })

  if (head?.length) {
    socket.emit('data', head)
  }
}

function createDeepgramSocket(env) {
  const params = new URLSearchParams({
    model: env.DEEPGRAM_MODEL || 'nova-3',
    interim_results: 'true',
    punctuate: 'true',
    smart_format: 'true',
    vad_events: 'true',
  })

  return new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, [
    'token',
    env.DEEPGRAM_API_KEY,
  ])
}

function acceptWebSocket(socket, websocketKey) {
  const acceptKey = createHash('sha1')
    .update(`${websocketKey}${WS_ACCEPT_GUID}`)
    .digest('base64')

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '',
    '',
  ].join('\r\n'))
}

function readWebSocketFrames(buffer) {
  const frames = []
  let offset = 0

  while (offset + 2 <= buffer.length) {
    const frameStart = offset
    const firstByte = buffer[offset]
    const secondByte = buffer[offset + 1]
    const opcode = firstByte & 0x0f
    const isMasked = Boolean(secondByte & 0x80)
    let payloadLength = secondByte & 0x7f
    offset += 2

    if (payloadLength === 126) {
      if (offset + 2 > buffer.length) {
        offset = frameStart
        break
      }

      payloadLength = buffer.readUInt16BE(offset)
      offset += 2
    } else if (payloadLength === 127) {
      if (offset + 8 > buffer.length) {
        offset = frameStart
        break
      }

      payloadLength = Number(buffer.readBigUInt64BE(offset))
      offset += 8
    }

    const maskOffset = offset
    const payloadOffset = isMasked ? offset + 4 : offset
    const nextOffset = payloadOffset + payloadLength

    if (nextOffset > buffer.length) {
      offset = frameStart
      break
    }

    const payload = Buffer.from(buffer.subarray(payloadOffset, nextOffset))

    if (isMasked) {
      const mask = buffer.subarray(maskOffset, maskOffset + 4)

      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4]
      }
    }

    frames.push({ opcode, payload })
    offset = nextOffset
  }

  return {
    frames,
    remaining: buffer.subarray(offset),
  }
}

function sendWebSocketFrame(socket, data) {
  if (socket.destroyed) {
    return
  }

  const payload = Buffer.from(data)
  const header = createFrameHeader(payload.length, 1)
  socket.write(Buffer.concat([header, payload]))
}

function sendCloseFrame(socket) {
  if (socket.destroyed) {
    return
  }

  socket.write(Buffer.from([0x88, 0x00]))
  socket.end()
}

function createFrameHeader(payloadLength, opcode) {
  if (payloadLength < 126) {
    return Buffer.from([0x80 | opcode, payloadLength])
  }

  if (payloadLength < 65536) {
    const header = Buffer.alloc(4)
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(payloadLength, 2)
    return header
  }

  const header = Buffer.alloc(10)
  header[0] = 0x80 | opcode
  header[1] = 127
  header.writeBigUInt64BE(BigInt(payloadLength), 2)
  return header
}
