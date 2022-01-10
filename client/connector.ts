export class Connector {
  #instance: WebTransport | WebSocket

  constructor(instance: WebTransport | WebSocket) {
    this.#instance = instance
  }

  static async init(url: string) {
    const protocol = url.startsWith('ws') ? 'websocket' : 'webtransport'

    switch (protocol) {
      case 'websocket': {
        const instance = new WebSocket(url)
        return new Connector(instance)
      }
      case 'webtransport': {
        const instance = new WebTransport(url)
        await instance.ready
        return new Connector(instance)
      }
    }
  }

  get writable(): WritableStream<ArrayBufferLike> {
    if (this.#instance instanceof WebTransport) {
      return this.#instance.datagrams.writable
    }

    return new WritableStream({
      write: (chunk) => {
        if (this.#instance instanceof WebSocket) {
          this.#instance.send(chunk)
        }
      },
    })
  }

  get readable(): ReadableStream<Uint8Array> {
    if (this.#instance instanceof WebTransport) {
      return this.#instance.datagrams.readable
    }

    return new ReadableStream({
      start: (controller) => {
        if (this.#instance instanceof WebSocket) {
          this.#instance.onmessage = ({ data }) => controller.enqueue(data)
        }
      },
    })
  }
}
