/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEBSOCKET_BASE_URL: string
  readonly VITE_WEBTRANSPORT_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
