const kinds = ['audio', 'video'];
const constraints = {
  audio: { audio: { echoCancellation: true, noiseSuppression: true }, video: false },
  video: { audio: false, video: { facingMode: 'user', width: { ideal: 320, max: 640 },
    height: { ideal: 180, max: 480 }, frameRate: { ideal: 15, max: 20 } } },
};
const emptyMedia = () => ({ audio: false, video: false });

export class RoomCall {
  constructor({ send, update, capture = options => navigator.mediaDevices.getUserMedia(options),
    createPeer = iceServers => new RTCPeerConnection({ iceServers }) }) {
    this.send = send;
    this.update = update;
    this.capture = capture;
    this.createPeer = createPeer;
    this.local = {};
    this.remote = {};
    this.remoteMedia = emptyMedia();
    this.pending = new Set();
    this.captureEpoch = 0;
    this.session = null;
    this.status = 'idle';
    this.error = '';
    this.incoming = Promise.resolve();
  }

  render() {
    this.update(this);
  }

  setSession(session, player, iceServers = [], keepDevices = false) {
    if (session === this.session) return;
    this.closePeer();
    this.session = session;
    this.player = player;
    this.iceServers = iceServers;
    this.error = '';
    if (!session || !keepDevices) {
      this.captureEpoch++;
      this.pending.clear();
      for (const track of Object.values(this.local)) track.stop();
      this.local = {};
    }
    if (session && kinds.some(kind => this.local[kind])) {
      this.publishMedia();
    }
    this.render();
  }

  closePeer() {
    clearTimeout(this.connectTimer);
    const peer = this.peer;
    this.peer = null;
    peer?.close();
    this.senders = {};
    this.remote = {};
    this.remoteMedia = emptyMedia();
    this.candidates = [];
    this.incoming = Promise.resolve();
    this.status = 'idle';
  }

  signal(fields) {
    if (this.session) this.send({ type: 'rtc', session: this.session, ...fields });
  }

  publishMedia() {
    this.signal({ kind: 'media', audio: !!this.local.audio, video: !!this.local.video });
    this.offerIfNeeded();
    if (this.player === 2 && !this.peer && this.status === 'idle' && kinds.some(kind => this.local[kind])) {
      const session = this.session;
      this.status = 'connecting';
      this.connectTimer = setTimeout(() => {
        if (this.session !== session || this.peer) return;
        this.status = 'failed';
        this.render();
      }, 20_000);
    }
  }

  async toggle(kind) {
    if (!this.session || !kinds.includes(kind) || this.pending.has(kind)) return;
    this.error = '';
    if (this.local[kind]) {
      this.stopTrack(kind, this.local[kind]);
      return;
    }
    const epoch = this.captureEpoch;
    this.pending.add(kind);
    this.render();
    try {
      const stream = await this.capture(constraints[kind]);
      const track = stream.getTracks().find(item => item.kind === kind && item.readyState === 'live');
      for (const item of stream.getTracks()) {
        if (item !== track || epoch !== this.captureEpoch || !this.session) item.stop();
      }
      if (epoch !== this.captureEpoch || !this.session) return;
      if (!track) throw new DOMException('No active media track', 'NotFoundError');
      this.local[kind] = track;
      track.addEventListener('ended', () => this.stopTrack(kind, track), { once: true });
      const peer = this.peer;
      this.senders?.[kind]?.replaceTrack(track).catch(() => this.fail(peer));
      this.publishMedia();
    } catch (err) {
      if (epoch === this.captureEpoch) {
        const device = kind === 'audio' ? '麦克风' : '摄像头';
        this.error = err.name === 'NotAllowedError' ? `请允许浏览器使用${device}` :
          err.name === 'NotFoundError' ? `未找到可用的${device}` : `无法开启${device}`;
      }
    } finally {
      if (epoch === this.captureEpoch) {
        this.pending.delete(kind);
        this.render();
      }
    }
  }

  stopTrack(kind, track) {
    if (this.local[kind] !== track) return;
    delete this.local[kind];
    track.stop();
    const peer = this.peer;
    this.senders?.[kind]?.replaceTrack(null).catch(() => this.fail(peer));
    this.publishMedia();
    this.render();
  }

  fail(peer) {
    if (!peer || peer !== this.peer) return;
    clearTimeout(this.connectTimer);
    this.status = 'failed';
    this.render();
  }

  retry() {
    if (this.session) this.signal({ kind: 'retry' });
  }

  newPeer() {
    const peer = this.createPeer(this.iceServers);
    this.peer = peer;
    this.senders = {};
    this.status = 'connecting';
    clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => this.fail(peer), 20_000);
    peer.onicecandidate = event => {
      if (this.peer === peer && event.candidate) this.signal({ kind: 'candidate', candidate: event.candidate.toJSON() });
    };
    peer.ontrack = ({ track }) => {
      if (this.peer !== peer) return;
      this.remote[track.kind] = track;
      for (const event of ['mute', 'unmute', 'ended']) track.addEventListener(event, () => {
        if (this.peer === peer) this.render();
      });
      this.render();
    };
    peer.onconnectionstatechange = () => {
      if (this.peer !== peer) return;
      if (peer.connectionState === 'failed') { this.fail(peer); return; }
      if (peer.connectionState === 'connected') {
        clearTimeout(this.connectTimer);
        this.status = 'connected';
      } else if (peer.connectionState === 'disconnected' || peer.connectionState === 'connecting') {
        this.status = peer.connectionState;
      }
      this.render();
    };
    this.render();
    return peer;
  }

  syncTracks() {
    return Promise.all(kinds.map(kind => this.senders[kind]?.replaceTrack(this.local[kind] ?? null)));
  }

  async offerIfNeeded() {
    if (!this.session || this.player !== 1 || this.peer ||
        !kinds.some(kind => this.local[kind] || this.remoteMedia[kind])) return;
    let peer;
    try {
      peer = this.newPeer();
      for (const kind of kinds) this.senders[kind] = peer.addTransceiver(kind, { direction: 'sendrecv' }).sender;
      await this.syncTracks();
      if (this.peer !== peer) return;
      await peer.setLocalDescription(await peer.createOffer());
      if (this.peer === peer) this.signal({ kind: 'description', description: peer.localDescription });
    } catch {
      if (peer) this.fail(peer);
      else { this.status = 'failed'; this.render(); }
    }
  }

  receive(m) {
    if (!this.session || m.session !== this.session) return;
    this.incoming = this.incoming.then(async () => {
      if (m.session !== this.session) return;
      if (m.kind === 'media') {
        this.remoteMedia = { audio: m.audio, video: m.video };
        this.offerIfNeeded();
        this.render();
        return;
      }
      if (m.kind === 'candidate') {
        if (this.peer?.remoteDescription) await this.peer.addIceCandidate(m.candidate);
        else if (this.candidates.length < 64) this.candidates.push(m.candidate);
        return;
      }
      if (m.kind !== 'description') return;
      const answering = this.player === 2 && m.description.type === 'offer';
      if (!answering && !(this.player === 1 && this.peer?.signalingState === 'have-local-offer' && m.description.type === 'answer')) return;
      if (answering && this.peer) return;
      const peer = this.peer ?? this.newPeer();
      await peer.setRemoteDescription(m.description);
      if (peer !== this.peer) return;
      for (const candidate of this.candidates.splice(0)) {
        await peer.addIceCandidate(candidate);
        if (peer !== this.peer) return;
      }
      if (answering) {
        for (const item of peer.getTransceivers()) {
          const kind = item.receiver.track.kind;
          if (!kinds.includes(kind) || this.senders[kind]) continue;
          item.direction = 'sendrecv';
          this.senders[kind] = item.sender;
        }
        await this.syncTracks();
        if (peer !== this.peer) return;
        await peer.setLocalDescription(await peer.createAnswer());
        if (peer === this.peer) this.signal({ kind: 'description', description: peer.localDescription });
      }
    }).catch(() => {
      if (m.session === this.session) {
        if (this.peer) this.fail(this.peer);
        else { this.status = 'failed'; this.render(); }
      }
    });
    return this.incoming;
  }
}
