import { Connector } from '~/connector'

type EncodeProps =
  | {
      type: 'connect'
      width: number
      height: number
      readable: ReadableStream<VideoFrame>
      writable: WritableStream<VideoFrame>
      url: string
    }
  | {
      type: 'disconnect'
    }
  | {
      type: 'start'
    }
  | {
      type: 'stop'
    }

let encoding = false
let frame = 0

addEventListener('message', async (event: MessageEvent<EncodeProps>) => {
  const BYTE_LENGTH_LIMIT = 1000

  const connect = async ({ data }: MessageEvent<EncodeProps>) => {
    if (data.type !== 'connect') return
    const connector = await Connector.init(data.url)
    const writer = connector.writable.getWriter()

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
        await writer.write(header.buffer)
        // body(8) = frame(4) + order (4)
        const payload = new DataView(new ArrayBuffer(chunk.byteLength))
        chunk.copyTo(payload)
        let count = 0
        for (let i = 0; i < chunk.byteLength; ) {
          const length =
            chunk.byteLength > i + BYTE_LENGTH_LIMIT
              ? BYTE_LENGTH_LIMIT
              : chunk.byteLength - i
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
        if (encoding) {
          encoder.encode(videoFrame, { keyFrame: frame % 30 === 0 })
          frame++
        }
        controller.enqueue(videoFrame)
      },
      flush(controller) {
        controller.terminate()
      },
    })
    data.readable.pipeThrough(transformer).pipeTo(data.writable)
  }

  switch (event.data.type) {
    case 'connect':
      await connect(event)
      break
    case 'start':
      encoding = true
      break
    case 'stop':
      encoding = false
      break
  }
})
