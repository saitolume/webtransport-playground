import 'typed-query-selector'

declare global {
  interface WebTransportOptions {
    allowPooling?: boolean
    serverCertificateHashes?: unknown
  }

  interface WebTransport {
    ready: Promise<void>
    close: () => void
    createUnidirectionalStream: () => Promise<
      WritableStream<ArrayBufferLike | DataView>
    >
    incomingUnidirectionalStreams: ReadableStream<ReadableStream<Uint8Array>>
    datagrams: {
      readable: ReadableStream<Uint8Array>
      writable: WritableStream
    }
  }

  const WebTransport: new (
    url: string,
    options?: WebTransportOptions
  ) => WebTransport
}
