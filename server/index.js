import { WebSocketServer } from 'ws'
import crypto from 'crypto'

const PORT = parseInt(process.env.PORT || '2028', 10)

// ── Room state ────────────────────────────────────────────
// rooms[roomId] = { broadcaster, userId, name, avatar, title, price,
//                   viewers: Map<viewerId, ws>, paidKeys: Set<sessionKey>,
//                   startedAt }
const rooms = new Map()
let nextViewerId = 1

// ── Session keys ──────────────────────────────────────────
// sessionKeys[key] = { name, color, createdAt }
// Allows anonymous users to leave and rejoin with the same identity
const sessionKeys = new Map()

function genSessionKey() {
  return crypto.randomBytes(16).toString('hex')
}

function getOrCreateSession(key, name) {
  if (key && sessionKeys.has(key)) {
    return { key, session: sessionKeys.get(key) }
  }
  const newKey = genSessionKey()
  const colors = [
    '#FF6B6B', '#9B59B6', '#3498DB', '#2ECC71', '#F39C12',
    '#E74C3C', '#1ABC9C', '#E91E63', '#00BCD4', '#FF9800',
  ]
  const session = {
    name: name || 'Guest_' + newKey.slice(0, 6),
    color: colors[Math.floor(Math.random() * colors.length)],
    createdAt: Date.now(),
  }
  sessionKeys.set(newKey, session)
  return { key: newKey, session }
}

function buildLiveList() {
  const list = []
  for (const [roomId, room] of rooms) {
    list.push({
      roomId,
      userId: room.userId,
      name: room.name,
      avatar: room.avatar,
      title: room.title,
      price: room.price,
      viewers: room.viewers.size,
      startedAt: room.startedAt,
    })
  }
  return list
}

function broadcastLiveList() {
  const msg = JSON.stringify({ type: 'live-list', data: buildLiveList() })
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg)
  }
}

const wss = new WebSocketServer({ port: PORT })
console.log(`[live-server] listening on ws://localhost:${PORT}`)

wss.on('connection', (ws) => {
  ws._roomId = null
  ws._role = null
  ws._viewerId = null
  ws._sessionKey = null

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    switch (msg.type) {

      // ── Broadcaster starts a stream ────────────────────
      case 'go-live': {
        const { roomId, userId, name, avatar, title, price } = msg
        if (!roomId) return
        if (rooms.has(roomId)) {
          const old = rooms.get(roomId)
          for (const [, vws] of old.viewers) {
            vws.send(JSON.stringify({ type: 'stream-ended' }))
          }
        }
        rooms.set(roomId, {
          broadcaster: ws,
          userId: userId || roomId,
          name: name || 'User',
          avatar: avatar || null,
          title: title || 'Live Stream',
          price: price || null,
          viewers: new Map(),
          paidKeys: new Set(),
          startedAt: Date.now(),
        })
        ws._roomId = roomId
        ws._role = 'broadcaster'
        ws.send(JSON.stringify({ type: 'live-started', roomId }))
        broadcastLiveList()
        break
      }

      // ── Viewer joins a stream ──────────────────────────
      case 'join-stream': {
        const { roomId, sessionKey, name } = msg
        const room = rooms.get(roomId)
        if (!room) {
          ws.send(JSON.stringify({ type: 'error', message: 'Stream not found' }))
          return
        }

        // Assign or restore session
        const { key, session } = getOrCreateSession(sessionKey, name)
        ws._sessionKey = key

        // Check paid gate
        if (room.price && !room.paidKeys.has(key)) {
          ws.send(JSON.stringify({
            type: 'payment-required',
            roomId,
            sessionKey: key,
            price: room.price,
            streamerName: room.name,
            title: room.title,
          }))
          return
        }

        const viewerId = 'v' + (nextViewerId++)
        room.viewers.set(viewerId, ws)
        ws._roomId = roomId
        ws._role = 'viewer'
        ws._viewerId = viewerId

        ws.send(JSON.stringify({
          type: 'joined',
          roomId,
          viewerId,
          sessionKey: key,
          sessionName: session.name,
          sessionColor: session.color,
          title: room.title,
          name: room.name,
          avatar: room.avatar,
        }))

        room.broadcaster.send(JSON.stringify({
          type: 'viewer-joined',
          viewerId,
          viewerName: session.name,
        }))

        broadcastLiveList()
        break
      }

      // ── Payment confirmation (mock — real would check backend) ─
      case 'payment-confirmed': {
        const { roomId, sessionKey } = msg
        const room = rooms.get(roomId)
        if (!room || !sessionKey) return
        room.paidKeys.add(sessionKey)
        ws.send(JSON.stringify({ type: 'payment-accepted', roomId }))
        break
      }

      // ── WebRTC signaling: offer (broadcaster → viewer) ─
      case 'offer': {
        const { viewerId, sdp } = msg
        const room = rooms.get(ws._roomId)
        if (!room || ws._role !== 'broadcaster') return
        const viewer = room.viewers.get(viewerId)
        if (viewer) {
          viewer.send(JSON.stringify({ type: 'offer', sdp }))
        }
        break
      }

      // ── WebRTC signaling: answer (viewer → broadcaster) ─
      case 'answer': {
        const { sdp } = msg
        const room = rooms.get(ws._roomId)
        if (!room || ws._role !== 'viewer') return
        room.broadcaster.send(JSON.stringify({
          type: 'answer',
          viewerId: ws._viewerId,
          sdp,
        }))
        break
      }

      // ── WebRTC signaling: ICE candidate ─────────────────
      case 'ice-candidate': {
        const { candidate, viewerId: targetViewerId } = msg
        const room = rooms.get(ws._roomId)
        if (!room) return

        if (ws._role === 'broadcaster' && targetViewerId) {
          const viewer = room.viewers.get(targetViewerId)
          if (viewer) {
            viewer.send(JSON.stringify({ type: 'ice-candidate', candidate }))
          }
        } else if (ws._role === 'viewer') {
          room.broadcaster.send(JSON.stringify({
            type: 'ice-candidate',
            viewerId: ws._viewerId,
            candidate,
          }))
        }
        break
      }

      // ── Chat message ────────────────────────────────────
      case 'chat': {
        const { text, user, color } = msg
        const room = rooms.get(ws._roomId)
        if (!room) return
        const chatMsg = JSON.stringify({
          type: 'chat',
          user: user || 'Anonymous',
          color: color || '#999',
          text: text || '',
        })
        if (ws._role !== 'broadcaster') {
          room.broadcaster.send(chatMsg)
        }
        for (const [, vws] of room.viewers) {
          vws.send(chatMsg)
        }
        break
      }

      // ── End stream ──────────────────────────────────────
      case 'end-stream': {
        const room = rooms.get(ws._roomId)
        if (!room || ws._role !== 'broadcaster') return
        for (const [, vws] of room.viewers) {
          vws.send(JSON.stringify({ type: 'stream-ended' }))
        }
        rooms.delete(ws._roomId)
        broadcastLiveList()
        break
      }

      // ── Get live list ───────────────────────────────────
      case 'get-live-list': {
        ws.send(JSON.stringify({ type: 'live-list', data: buildLiveList() }))
        break
      }
    }
  })

  ws.on('close', () => {
    if (ws._role === 'broadcaster' && ws._roomId) {
      const room = rooms.get(ws._roomId)
      if (room) {
        for (const [, vws] of room.viewers) {
          vws.send(JSON.stringify({ type: 'stream-ended' }))
        }
        rooms.delete(ws._roomId)
        broadcastLiveList()
      }
    } else if (ws._role === 'viewer' && ws._roomId) {
      const room = rooms.get(ws._roomId)
      if (room && ws._viewerId) {
        room.viewers.delete(ws._viewerId)
        room.broadcaster.send(JSON.stringify({
          type: 'viewer-left',
          viewerId: ws._viewerId,
        }))
        broadcastLiveList()
      }
    }
  })
})
