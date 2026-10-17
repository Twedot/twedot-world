export interface LiveRoom {
  roomId: string
  hostId: string
  hostName: string
  hostPhoto: string
  title: string
  category: string
  price: number
  viewers: number
  startedAt: number
}

export interface ChatMessage {
  userId: string
  user: string
  color: string
  text: string
}

export interface PaymentGate {
  roomId: string
  price: number
  hostName: string
  title: string
}

export interface JoinedInfo {
  streamId: string
  token: string
  livekitUrl: string
  hostId: string
  hostName: string
  hostPhoto: string
  title: string
  viewers: number
}

export interface FollowUpdate {
  userId: string
  userName: string
  targetUserId: string
  followerCount: number
  isFollowing: boolean
}

export interface StreamPurchaseRequest {
  requestId: string
  userId: string
  userName: string
  userPhoto: string
  itemId: string
  itemName: string
  itemPrice: number // kobo
}

export interface BuildingUser {
  userId: string
  userName: string
  userPhoto: string
}

export interface BuildingChatMessage {
  userId: string
  userName: string
  userPhoto: string
  text: string
  timestamp: number
}

type EventHandler = {
  onLiveStarted?: (streamId: string, token: string, livekitUrl: string) => void
  onResumed?: (streamId: string, token: string, livekitUrl: string) => void
  onViewerJoined?: (userId: string, userName: string) => void
  onViewerLeft?: (userId: string) => void
  onJoined?: (info: JoinedInfo) => void
  onChat?: (msg: ChatMessage) => void
  onStreamEnded?: () => void
  onPaymentRequired?: (gate: PaymentGate) => void
  onViewerCount?: (count: number) => void
  onFollowUpdate?: (update: FollowUpdate) => void
  onBuildingJoined?: (users: BuildingUser[]) => void
  onBuildingUsers?: (users: BuildingUser[]) => void
  onBuildingChat?: (msg: BuildingChatMessage) => void
  onPurchaseRequest?: (req: StreamPurchaseRequest) => void
  onRequestUpdate?: (requestId: string, status: 'accepted' | 'declined') => void
  onError?: (msg: string) => void
}

let lkModule: typeof import('livekit-client') | null = null
async function getLK() {
  if (!lkModule) lkModule = await import('livekit-client')
  return lkModule
}

export class LiveStreamService {
  private ws: WebSocket | null = null
  private handlers: EventHandler = {}
  private _room: InstanceType<typeof import('livekit-client').Room> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private _screenEl: HTMLVideoElement | null = null
  private _cameraEl: HTMLVideoElement | null = null
  private _audioEl: HTMLAudioElement | null = null
  private _canvasTrack: MediaStreamTrack | null = null
  private _myUserId: string | null = null
  private _myName: string | null = null
  private _myPhoto: string | null = null
  private _sessionId: string
  private _authUserId: string | null = null
  private _isHosting = false
  private _activeStreamId: string | null = null
  private _expectingGoLive = false
  private _pendingMessages: string[] = []

  get myUserId() { return this._myUserId }
  get myName() { return this._myName }
  get myPhoto() { return this._myPhoto }
  get isHosting() { return this._isHosting }
  get activeStreamId() { return this._activeStreamId }
  get isAuthenticated() { return this._authUserId !== null }

  constructor(private wsUrl: string) {
    // localStorage so the guest ID survives cross-origin redirects (Paystack) and browser restarts.
    // sessionStorage is cleared by iOS Safari when returning from an external site, which would
    // generate a new guest ID and break paid-stream access for demo users.
    let sid: string | null = null
    try { sid = localStorage.getItem('tw_stream_session') } catch {}
    if (!sid) {
      sid = (crypto.randomUUID?.() ?? Array.from({length:16},()=>Math.floor(Math.random()*16).toString(16)).join('')).replace(/-/g,'').slice(0,16)
      try { localStorage.setItem('tw_stream_session', sid) } catch {}
    }
    this._sessionId = sid
  }

  on(handlers: EventHandler) {
    this.handlers = { ...this.handlers, ...handlers }
  }

  setMediaElements(screen: HTMLVideoElement | null, camera: HTMLVideoElement | null, audio: HTMLAudioElement | null) {
    this._screenEl = screen
    this._cameraEl = camera
    this._audioEl = audio
    console.log('[stream] setMediaElements screen=', !!screen, 'camera=', !!camera, 'audio=', !!audio)
  }

  setAuthUser(userId: string) {
    if (this._authUserId === userId) return
    this._authUserId = userId
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.connect()
  }

  connect() {
    if (this.ws && this.ws.readyState <= 1) return
    const sep = this.wsUrl.includes('?') ? '&' : '?'
    const params = this._authUserId
      ? 'userId=' + encodeURIComponent(this._authUserId)
      : 'sessionId=' + this._sessionId
    this.ws = new WebSocket(this.wsUrl + sep + params)

    this.ws.onopen = () => {
      const pending = this._pendingMessages.splice(0)
      pending.forEach(m => { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(m) })
    }

    this.ws.onmessage = (ev) => {
      let msg: Record<string, unknown>
      try { msg = JSON.parse(ev.data) } catch { return }
      this.handleMessage(msg)
    }

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(), 3000)
    }
  }

  private handleMessage(msg: Record<string, unknown>) {
    switch (msg.type) {
      case 'welcome':
        this._myUserId = msg.userId as string
        this._myName = (msg.userName as string) || null
        this._myPhoto = (msg.userPhoto as string) || null
        console.log('[stream] welcome, myUserId=', this._myUserId, 'name=', this._myName)
        this.resumeHost()
        break

      case 'live_started': {
        this._isHosting = true
        this._activeStreamId = msg.streamId as string
        if (this._expectingGoLive) {
          this._expectingGoLive = false
          this.handlers.onLiveStarted?.(
            msg.streamId as string,
            msg.token as string,
            msg.livekitUrl as string,
          )
        } else {
          this.handlers.onResumed?.(
            msg.streamId as string,
            msg.token as string,
            msg.livekitUrl as string,
          )
        }
        break
      }

      case 'no_active_stream':
        this._isHosting = false
        this._activeStreamId = null
        break

      case 'joined':
        this.handlers.onJoined?.({
          streamId: msg.streamId as string,
          token: msg.token as string,
          livekitUrl: msg.livekitUrl as string,
          hostId: msg.hostId as string,
          hostName: msg.hostName as string,
          hostPhoto: msg.hostPhoto as string,
          title: msg.title as string,
          viewers: Number(msg.viewers) || 0,
        })
        break

      case 'payment_required':
        this.handlers.onPaymentRequired?.({
          roomId: msg.roomId as string,
          price: msg.price as number,
          hostName: msg.hostName as string,
          title: msg.title as string,
        })
        break

      case 'viewer_joined':
        this.handlers.onViewerJoined?.(msg.userId as string, msg.userName as string)
        if (typeof msg.viewers === 'number') this.handlers.onViewerCount?.(msg.viewers)
        break

      case 'viewer_left':
        this.handlers.onViewerLeft?.(msg.userId as string)
        if (typeof msg.viewers === 'number') this.handlers.onViewerCount?.(msg.viewers)
        break

      case 'chat':
        this.handlers.onChat?.({
          userId: msg.userId as string,
          user: msg.userName as string,
          color: '#' + ((msg.userId as string) ?? '').slice(-6).replace(/[^0-9a-f]/gi, 'A'),
          text: msg.text as string,
        })
        break

      case 'stream_ended':
        this.disconnectRoom()
        this.handlers.onStreamEnded?.()
        break

      case 'follow_update':
        this.handlers.onFollowUpdate?.({
          userId: msg.userId as string,
          userName: msg.userName as string,
          targetUserId: msg.targetUserId as string,
          followerCount: msg.followerCount as number,
          isFollowing: msg.isFollowing as boolean,
        })
        break

      case 'building_joined':
        this.handlers.onBuildingJoined?.((msg.users as BuildingUser[]) || [])
        break

      case 'building_users':
        this.handlers.onBuildingUsers?.((msg.users as BuildingUser[]) || [])
        break

      case 'building_chat':
        this.handlers.onBuildingChat?.({
          userId: msg.userId as string,
          userName: msg.userName as string,
          userPhoto: (msg.userPhoto as string) || '',
          text: msg.text as string,
          timestamp: (msg.timestamp as number) || Date.now(),
        })
        break

      case 'purchase_request':
        this.handlers.onPurchaseRequest?.({
          requestId: (msg.requestId as string) || '',
          userId: (msg.userId as string) || '',
          userName: (msg.userName as string) || '',
          userPhoto: (msg.userPhoto as string) || '',
          itemId: (msg.itemId as string) || '',
          itemName: (msg.itemName as string) || '',
          itemPrice: (msg.itemPrice as number) || 0,
        })
        break

      case 'request_update':
        this.handlers.onRequestUpdate?.(
          (msg.requestId as string) || '',
          (msg.status as 'accepted' | 'declined') || 'declined',
        )
        break

      case 'error':
        this.handlers.onError?.(msg.error as string)
        break
    }
  }

  // ── LiveKit Room (lazy-loaded) ──────────────────────────

  async connectRoom(token: string, livekitUrl: string) {
    if (this._room) {
      await this._room.disconnect()
    }

    const lk = await getLK()

    const room = new lk.Room({
      adaptiveStream: false,
      dynacast: false,
    })

    room.on(lk.RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      console.log('[stream] TrackSubscribed kind=', track.kind, 'source=', track.source, 'from=', participant.identity)
      if (track.kind === lk.Track.Kind.Video) {
        if (track.source === lk.Track.Source.ScreenShare && this._screenEl) {
          track.attach(this._screenEl)
          console.log('[stream] attached screen-share track')
        } else if (track.source === lk.Track.Source.Camera && this._cameraEl) {
          track.attach(this._cameraEl)
          console.log('[stream] attached camera track')
        } else if (this._screenEl) {
          track.attach(this._screenEl)
          console.log('[stream] attached video track (fallback to screen)')
        }
      } else if (track.kind === lk.Track.Kind.Audio && this._audioEl) {
        track.attach(this._audioEl)
        console.log('[stream] attached audio track')
      }
    })

    room.on(lk.RoomEvent.TrackUnsubscribed, (track) => {
      console.log('[stream] TrackUnsubscribed kind=', track.kind)
      track.detach()
    })

    room.on(lk.RoomEvent.TrackPublished, (pub, participant) => {
      console.log('[stream] TrackPublished source=', pub.source, 'kind=', pub.kind, 'from=', participant.identity)
    })

    room.on(lk.RoomEvent.Disconnected, () => {
      console.log('[stream] room disconnected')
      this.handlers.onStreamEnded?.()
    })

    room.on(lk.RoomEvent.Connected, () => {
      console.log('[stream] room connected, participants=', room.remoteParticipants.size)
      room.remoteParticipants.forEach((p) => {
        console.log('[stream] existing participant=', p.identity, 'tracks=', p.trackPublications.size)
        p.trackPublications.forEach((pub) => {
          console.log('[stream]   track source=', pub.source, 'kind=', pub.kind, 'subscribed=', pub.isSubscribed)
        })
      })
    })

    console.log('[stream] connecting to LiveKit', livekitUrl)
    await room.connect(livekitUrl, token)
    console.log('[stream] connected, room=', room.name)
    this._room = room
  }

  async disconnectRoom() {
    if (this._canvasTrack) {
      this._canvasTrack.stop()
      this._canvasTrack = null
    }
    if (this._room) {
      await this._room.disconnect()
      this._room = null
    }
  }

  // ── Canvas capture (host broadcasts their 3D world) ─────

  async publishCanvas(canvas: HTMLCanvasElement, fps = 5) {
    console.log('[stream] publishCanvas called, room=', !!this._room, 'canvas=', canvas.width, 'x', canvas.height)
    if (!this._room) { console.warn('[stream] no room, skipping publishCanvas'); return }
    const lk = await getLK()

    const stream = canvas.captureStream(fps)
    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) { console.warn('[stream] no video track from canvas'); return }

    this._canvasTrack = videoTrack
    try {
      const pub = await this._room.localParticipant.publishTrack(videoTrack, {
        source: lk.Track.Source.ScreenShare,
        name: 'world-view',
        simulcast: false,
        videoEncoding: { maxBitrate: 200_000, maxFramerate: fps },
      })
      console.log('[stream] canvas track published, sid=', pub.trackSid)
    } catch (err) {
      console.error('[stream] publishTrack failed:', err)
    }
  }

  // ── Publish existing tracks (host) ──────────────────────
  // Publishes an existing getUserMedia track directly.
  // No second getUserMedia call — avoids mobile device conflicts.

  async publishCameraTrack(track: MediaStreamTrack) {
    if (!this._room) return
    const lk = await getLK()
    await this._room.localParticipant.publishTrack(track, {
      source: lk.Track.Source.Camera,
      simulcast: false,
      videoEncoding: { maxBitrate: 300_000, maxFramerate: 15 },
    })
    console.log('[stream] camera track published')
  }

  async unpublishCamera() {
    if (!this._room || !lkModule) return
    const pub = this._room.localParticipant.getTrackPublication(lkModule.Track.Source.Camera)
    if (pub?.track) {
      await this._room.localParticipant.unpublishTrack(pub.track.mediaStreamTrack)
      console.log('[stream] camera track unpublished')
    }
  }

  async publishMicTrack(track: MediaStreamTrack) {
    if (!this._room) return
    const lk = await getLK()
    await this._room.localParticipant.publishTrack(track, {
      source: lk.Track.Source.Microphone,
    })
    console.log('[stream] mic track published')
  }

  async setMicEnabled(on: boolean) {
    if (!this._room || !lkModule) return
    const pub = this._room.localParticipant.getTrackPublication(lkModule.Track.Source.Microphone)
    if (pub?.track) {
      if (on) await pub.unmute()
      else await pub.mute()
    }
  }

  // ── Broadcaster API ─────────────────────────────────────

  goLive(title: string, category: string, price: number) {
    this._expectingGoLive = true
    this.send({ type: 'go_live', title, category, price })
  }

  endStream() {
    this._isHosting = false
    this._activeStreamId = null
    this.send({ type: 'end_stream' })
    this.disconnectRoom()
  }

  resumeHost() {
    this.send({ type: 'resume_host' })
  }

  // ── Viewer API ──────────────────────────────────────────

  joinStream(roomId: string) {
    this.send({ type: 'join_stream', roomId })
  }

  leaveStream() {
    this.send({ type: 'leave_stream' })
    this.disconnectRoom()
  }

  // ── Chat ────────────────────────────────────────────────

  sendChat(text: string) {
    this.send({ type: 'chat', text })
  }

  sendFollowUpdate(targetUserId: string, followerCount: number, isFollowing: boolean) {
    this.send({ type: 'follow_update', targetUserId, followerCount, isFollowing })
  }

  // ── Building rooms ──────────────────────────────────────
  joinBuilding(buildingId: string) {
    this.send({ type: 'join_building', buildingId })
  }

  leaveBuilding() {
    this.send({ type: 'leave_building' })
  }

  sendBuildingChat(text: string) {
    this.send({ type: 'building_chat', text })
  }

  // ── Purchase requests (streams) ─────────────────────────

  sendPurchaseRequest(requestId: string, itemId: string, itemName: string, itemPrice: number) {
    this.send({ type: 'purchase_request', requestId, itemId, itemName, itemPrice })
  }

  sendRequestUpdate(requestId: string, viewerId: string, status: 'accepted' | 'declined') {
    this.send({ type: 'request_update', requestId, viewerId, status })
  }

  // ── Internals ───────────────────────────────────────────

  private send(data: Record<string, unknown>) {
    const msg = JSON.stringify(data)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg)
    } else {
      this._pendingMessages.push(msg)
    }
  }

  dispose() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.disconnectRoom()
    this.ws?.close()
    this.ws = null
  }
}
