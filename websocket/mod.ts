import { config } from "dotenv/mod.ts";
import { resolve } from "path/mod.ts";
import { App } from "./app.ts";
import { getRoomIdFromURL, UUID_FORMAT } from "./utils.ts";

type RoomId = string;
type ClientId = string;

const env = config({ path: resolve("..", ".env.local") });

const viewersByRoomId = new Map<RoomId, Map<ClientId, WebSocket>>();
const server = Deno.listen({ port: Number(env.PORT) });

for await (const conn of server) {
  const app = new App(Deno.serveHttp(conn));

  app.route(`/streams/${UUID_FORMAT.source}`, (event) => {
    const { socket, response } = Deno.upgradeWebSocket(event.request);
    const roomId = getRoomIdFromURL(event.request.url);

    socket.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
      if (roomId === null) return;
      const viewers = viewersByRoomId.get(roomId);
      const clients = viewers?.values();
      if (clients === undefined) return;
      for (const client of clients) {
        client.send(data);
      }
    };

    socket.onclose = () => {
      if (roomId === null) return;
      viewersByRoomId.delete(roomId);
    };

    event.respondWith(response);
  });

  app.route(`/${UUID_FORMAT.source}`, (event) => {
    const { socket, response } = Deno.upgradeWebSocket(event.request);
    const roomId = getRoomIdFromURL(event.request.url);
    const clientId = event.request.headers.get("sec-webSocket-key");

    socket.onopen = () => {
      if (roomId === null || clientId === null) return;
      const viewers: Map<ClientId, WebSocket> = viewersByRoomId.get(roomId) ??
        new Map();
      viewers.set(clientId, socket);
      viewersByRoomId.set(roomId, viewers);
    };

    socket.onclose = () => {
      if (roomId === null || clientId === null) return;
      const viewers = viewersByRoomId.get(roomId);
      viewers?.delete(clientId);
    };

    event.respondWith(response);
  });

  await app.run();
}
