addEventListener('message', async (event) => {
  let webTransport: WebTransport
  const LIMIT = 1000

  const connect = async ({
    data,
  }: MessageEvent<{
    width: number
    height: number
    roomId: string
    readable: ReadableStream<VideoFrame>
    writable: WritableStream<VideoFrame>
  }>) => {
    const url = `https://localhost:4433/streams/${data.roomId}`
    webTransport = new WebTransport(url)
    await webTransport.ready

    let frame = 0
    const writer = webTransport.datagrams.writable.getWriter()

    const encoder = new VideoEncoder({
      async output(chunk) {
        // header(33) = frame(4) + order (4) + type(1) + timestamp(8) + duration(8) + length(8)
        const header = new DataView(new ArrayBuffer(33))
        header.setUint32(0, frame)
        header.setUint32(4, 0)
        header.setUint8(8, chunk.type === 'key' ? 1 : 2)
        header.setBigInt64(9, BigInt(chunk.timestamp))
        header.setBigUint64(17, BigInt(chunk.duration ?? 0))
        header.setUint32(25, chunk.byteLength)
        await writer.write(header)
        // body(8) = frame(4) + order (4)
        const payload = new DataView(new ArrayBuffer(chunk.byteLength))
        chunk.copyTo(payload)
        let count = 0
        for (let i = 0; i < chunk.byteLength; ) {
          const length =
            chunk.byteLength > i + LIMIT ? LIMIT : chunk.byteLength - i
          const body = new Uint8Array(length + 8)
          const view = new DataView(body.buffer)
          view.setUint32(0, frame)
          view.setUint32(4, ++count)
          body.set(new Uint8Array(payload.buffer, i, length), 8)
          await writer.write(body)
          i += length
        }
      },
      error: console.error,
    })

    encoder.configure({
      codec: 'vp8',
      width: data.width,
      height: data.height,
      bitrate: 2_000_000,
      framerate: 30,
      latencyMode: 'realtime',
    })

    const transformer = new TransformStream<VideoFrame>({
      async transform(videoFrame, controller) {
        encoder.encode(videoFrame, { keyFrame: frame % 30 === 0 })
        controller.enqueue(videoFrame)
        frame++
      },
      flush(controller) {
        controller.terminate()
      },
    })
    data.readable.pipeThrough(transformer).pipeTo(data.writable)
  }

  const disconnect = () => {
    webTransport.close()
  }

  switch (event.data.type) {
    case 'connect':
      return connect(event)
    case 'disconnect':
      return disconnect()
    default:
      throw new Error('unreachable')
  }
})
