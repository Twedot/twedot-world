import { createRoot } from 'react-dom/client'
import { Component, type ReactNode } from 'react'
import { LiveProvider } from './live/LiveContext'
import './index.css'
import App from './App'
import EmbedViewer from './ui/EmbedViewer'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: '#fff', background: '#1a1a2e', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <h2 style={{ color: '#ff6b6b' }}>App crashed</h2>
          <p>{this.state.error.message}</p>
          <pre style={{ fontSize: 12, opacity: 0.7 }}>{this.state.error.stack}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Embed mode: world.twedot.com/?stream=ROOM_ID&embed=1
// Renders only the lightweight LiveKit viewer — no city, no house.
const _params = new URLSearchParams(window.location.search)
const _embedRoomId = _params.get('embed') === '1' ? (_params.get('stream') ?? '') : ''

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <LiveProvider>
      {_embedRoomId ? <EmbedViewer roomId={_embedRoomId} /> : <App />}
    </LiveProvider>
  </ErrorBoundary>
)
