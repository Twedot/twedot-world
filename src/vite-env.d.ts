/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORLD_API_URL?: string
  readonly VITE_WORLD_WS_URL?: string
  readonly VITE_LIVE_WS_URL?: string
  readonly VITE_TWEDOT_API_URL?: string
  readonly VITE_TWEDOT_FEED_URL?: string
  readonly VITE_STREAM_WS_URL?: string
  readonly VITE_STREAM_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
