import { el } from './ui.js';
import { RoomCall } from './room-call.js';

const statuses = {
  idle: '麦克风和摄像头由你控制',
  connecting: '正在建立通话…',
  connected: '通话已连接',
  disconnected: '通话连接中断',
  failed: '通话暂未连通',
};

export function setupCallControls(send, labels) {
  const supported = typeof RTCPeerConnection === 'function' && !!navigator.mediaDevices?.getUserMedia;
  const toggle = el('media-toggle'), panel = el('media-panel');
  const audio = el('media-remote-audio'), playAudio = el('media-play-audio');
  let audioBlocked = false;

  function changeTrack(element, track) {
    if (element.srcObject?.getTracks()[0] === track || !element.srcObject && !track) return false;
    element.srcObject = track ? new MediaStream([track]) : null;
    return true;
  }

  function play() {
    const stream = audio.srcObject;
    if (!stream || audio.muted) return;
    audio.play().then(() => {
      if (audio.srcObject !== stream || audio.muted) return;
      audioBlocked = false;
      playAudio.hidden = true;
    }).catch(() => {
      if (audio.srcObject !== stream || audio.muted) return;
      audioBlocked = true;
      playAudio.hidden = false;
    });
  }

  function render(call) {
    const available = !!call.session;
    const wasMuted = audio.muted;
    audio.muted = !call.remoteMedia.audio;
    const audioChanged = changeTrack(audio, call.remote.audio);
    if (!available || audio.muted) audioBlocked = false;
    playAudio.hidden = !audioBlocked;
    if (audioChanged || wasMuted && !audio.muted) play();

    const videos = [
      { id: 'self', track: call.local.video, visible: !!call.local.video },
      { id: 'remote', track: call.remote.video, visible: call.remoteMedia.video && !!call.remote.video },
    ];
    for (const item of videos) {
      const video = el(`media-${item.id}-video`);
      const changed = changeTrack(video, item.visible ? item.track : null);
      if (changed && item.visible) video.play().catch(() => {});
      el(`media-${item.id}`).hidden = !item.visible;
    }
    const hasVideo = videos.some(item => item.visible);
    el('media-videos').hidden = !hasVideo;
    document.body.classList.toggle('media-video', hasVideo);
    const names = labels();
    el('media-self-label').textContent = names.self ?? '你';
    el('media-remote-label').textContent = names.other ?? '对手';

    toggle.classList.toggle('active', !!call.local.audio || !!call.local.video || !!call.remoteMedia.audio || !!call.remoteMedia.video);
    for (const [kind, title] of [['audio', '麦克风'], ['video', '摄像头']]) {
      const button = el(`media-${kind}`), active = !!call.local[kind];
      const pending = call.pending.has(kind);
      button.disabled = !available || !supported || pending;
      button.setAttribute('aria-pressed', String(active));
      button.textContent = pending ? `正在开启${title}` : `${active ? '关闭' : '开启'}${title}`;
    }
    el('media-retry').hidden = !available || !['failed', 'disconnected'].includes(call.status);
    const status = !supported ? '通话需要 HTTPS 和支持通话的浏览器' :
      !available ? '等待对手连接' : call.error || statuses[call.status];
    if (el('media-status').textContent !== status) el('media-status').textContent = status;
    if (!available && !document.body.classList.contains('online-game')) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  }

  const call = new RoomCall({ send, update: render });
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) play();
  };
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); }
  });
  el('media-audio').onclick = () => { play(); call.toggle('audio'); };
  el('media-video').onclick = () => { play(); call.toggle('video'); };
  el('media-retry').onclick = () => call.retry();
  playAudio.onclick = play;
  window.addEventListener('pagehide', () => call.setSession(null));
  render(call);
  return {
    setSession(...params) {
      if (supported) call.setSession(...params);
    },
    receive(m) {
      if (supported) call.receive(m);
    },
    close() {
      call.setSession(null);
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    },
  };
}
