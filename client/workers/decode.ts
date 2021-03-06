import { Connector } from '~/connector'

type FrameCount = number
type Header = Record<
  FrameCount,
  Pick<EncodedVideoChunkInit, 'type' | 'timestamp' | 'duration'>
>
type Buf = Record<FrameCount, Record<number, Uint8Array>>
type Length = Record<FrameCount, number>
type Sum = Record<FrameCount, number>

type DecodeProps = {
  type: 'connect'
  writable: WritableStream<VideoFrame>
  url: string
}

const BYTE_LENGTH_LIMIT = 1000
let waitingKeyframe = true
let lastDecodedFrame: number | undefined = undefined
let setTimeoutId: number | undefined = undefined

addEventListener('message', async ({ data }: MessageEvent<DecodeProps>) => {
  const connector = await Connector.init(data.url)
  const writer = data.writable.getWriter()

  const decoder = new VideoDecoder({
    async output(chunk) {
      await writer.write(chunk)
    },
    error: console.error,
  })

  decoder.configure({
    codec: 'vp8',
    optimizeForLatency: true,
  })

  const header: Header = {}
  const buffer: Buf = {}
  const length: Length = {}
  const sum: Sum = {}

  const writable = new WritableStream<Uint8Array | Blob>({
    async write(chunk) {
      const source =
        chunk instanceof Uint8Array ? chunk.buffer : await chunk.arrayBuffer()
      const dataView = new DataView(source)
      const frame = dataView.getUint32(0)
      const order = dataView.getUint32(4)

      if (!(frame in buffer)) {
        buffer[frame] = []
        length[frame] = Number.MAX_SAFE_INTEGER
        sum[frame] = 0
      }

      if (order === 0) {
        length[frame] = dataView.getUint32(25)
        header[frame] = {
          type: dataView.getUint8(8) === 1 ? 'key' : 'delta',
          timestamp: Number(dataView.getBigInt64(9)),
          duration: Number(dataView.getBigUint64(17)),
        }
        return
      }

      const data = new Uint8Array(source.slice(8))
      buffer[frame][order] = data
      sum[frame] += data.byteLength

      const keys = Object.keys(buffer)
        .map((key) => Number(key))
        .sort()

      const result = keys.map((key) => {
        if (
          typeof lastDecodedFrame === 'number' &&
          key - lastDecodedFrame > 30
        ) {
          if (header[key]) delete header[key]
          if (buffer[key]) delete buffer[key]
          if (sum[key]) delete sum[key]
          if (length[key]) delete length[key]
          return
        }

        if (
          sum[key] === length[key] &&
          (typeof lastDecodedFrame === 'number'
            ? lastDecodedFrame + 1 === key
            : true)
        ) {
          concatFrame({
            buffer,
            header,
            length,
            sum,
            frame: key,
            decoder,
          })
          if (setTimeoutId) {
            clearTimeout(setTimeoutId)
            setTimeoutId = undefined
          }
          return true
        } else {
          return false
        }
      })

      if (
        keys.length > 1 &&
        result.every((value) => value === false) &&
        setTimeoutId === undefined
      ) {
        postMessage({ type: 'disconnect' })
        setTimeoutId = self.setTimeout(() => {
          postMessage({ type: 'reconnect' })
        }, 2000)
      }
    },
  })

  connector.readable.pipeTo(writable)
})

const concatFrame = ({
  buffer,
  header,
  length,
  sum,
  frame,
  decoder,
}: {
  buffer: Buf
  header: Header
  length: Length
  sum: Sum
  frame: FrameCount
  decoder: VideoDecoder
}) => {
  const b = buffer[frame]
  const l = length[frame]
  const payload = new Uint8Array(l)
  let offset = 0

  for (let i = 1; offset < l; i++) {
    if (i in b) {
      payload.set(new Uint8Array(b[i]), offset)
      offset += b[i].byteLength
    } else {
      const dummy = new ArrayBuffer(
        offset + BYTE_LENGTH_LIMIT < l
          ? BYTE_LENGTH_LIMIT
          : l - BYTE_LENGTH_LIMIT
      )
      payload.set(new Uint8Array(dummy), offset)
      offset += dummy.byteLength
    }
  }

  const chunk = new EncodedVideoChunk({
    ...header[frame],
    data: new DataView(payload.buffer),
  })

  if (waitingKeyframe && chunk.type === 'key') {
    waitingKeyframe = false
  }

  if (!waitingKeyframe) {
    decoder.decode(chunk)
    lastDecodedFrame = frame
  }

  delete header[frame]
  delete buffer[frame]
  delete sum[frame]
  delete length[frame]
}
