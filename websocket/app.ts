import { Status, STATUS_TEXT } from "http/http_status.ts";

type RouteHandler = (event: Deno.RequestEvent) => void | Promise<void>;

export class App {
  #httpConn: Deno.HttpConn;
  #routes = new Map<string, RouteHandler>();

  constructor(httpConn: Deno.HttpConn) {
    this.#httpConn = httpConn;
  }

  route(pattern: string, handler: RouteHandler) {
    this.#routes.set(pattern, handler);
  }

  async run() {
    for await (const event of this.#httpConn) {
      const { pathname } = new URL(event.request.url);
      for (const [source, handler] of this.#routes.entries()) {
        const pattern = new RegExp(source);
        if (pattern.test(pathname)) {
          try {
            handler(event);
            return;
          } catch {
            await event.respondWith(
              new Response(STATUS_TEXT.get(Status.InternalServerError), {
                status: Status.InternalServerError,
              }),
            );
            return;
          }
        }
      }
      await event.respondWith(
        new Response(STATUS_TEXT.get(Status.NotFound), {
          status: Status.NotFound,
        }),
      );
    }
  }
}
