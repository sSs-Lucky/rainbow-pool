import { CHAT_HISTORY_LIMIT, CHAT_MAX_LENGTH, QUICK_PHRASES, chatText } from './room-chat.js';
import { el } from './ui.js';

const feedback = {
  offline: '等待对手连接',
  invalid: `消息须在 ${CHAT_MAX_LENGTH} 个字符以内`,
  rate: '发得有点快，稍等一下',
  timeout: '发送结果未确认，请查看聊天记录',
};

export function setupChatControls(send, playerInfo, onOpen) {
  const toggle = el('chat-toggle'), panel = el('chat-panel'), log = el('chat-log');
  const phrases = el('chat-phrases'), form = el('chat-form'), input = el('chat-input');
  const presetButtons = [];
  let online = false, pending = null, nextRequest = 0, unread = 0;

  function updateControls() {
    const locked = !online || !!pending;
    el('chat-send').disabled = locked;
    for (const btn of presetButtons) btn.disabled = locked;
  }

  function status(text = '') {
    el('chat-status').textContent = text;
  }

  function updateBadge() {
    const badge = el('chat-badge');
    badge.hidden = unread === 0;
    badge.textContent = unread > 9 ? '9+' : String(unread);
    toggle.setAttribute('aria-label', unread ? `聊天，${unread} 条未读消息` : '聊天');
  }

  function openPanel(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      onOpen();
      unread = 0;
      updateBadge();
      log.scrollTop = log.scrollHeight;
    }
  }

  function finishRequest() {
    if (!pending) return;
    clearTimeout(pending.timer);
    pending = null;
    updateControls();
  }

  function append(entry) {
    if (![1, 2].includes(entry?.player) || typeof entry.text !== 'string') return;
    el('chat-empty')?.remove();
    const { seat, players } = playerInfo();
    const mine = seat === entry.player;
    const item = document.createElement('div');
    item.className = mine ? 'chat-entry mine' : 'chat-entry';
    const name = document.createElement('small');
    name.textContent = mine ? '你' : players[entry.player]?.nickname ?? '对手';
    const message = document.createElement('p');
    message.textContent = entry.text;
    item.append(name, message);
    log.appendChild(item);
    if (log.childElementCount > CHAT_HISTORY_LIMIT) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  function history(entries) {
    const empty = document.createElement('p');
    empty.id = 'chat-empty';
    empty.textContent = '还没有消息';
    log.replaceChildren(empty);
    for (const entry of entries.slice(-CHAT_HISTORY_LIMIT)) append(entry);
    unread = Math.min(unread, entries.length);
    updateBadge();
  }

  function submit(value, custom = false) {
    if (pending || !online) return;
    const text = chatText(value);
    if (!text) {
      if (value.trim()) status(feedback.invalid);
      return;
    }
    const requestId = ++nextRequest;
    if (!send({ type: 'chat', text, requestId })) { status(feedback.offline); return; }
    pending = { requestId, draft: custom ? value : null, timer: setTimeout(() => {
      finishRequest();
      status(feedback.timeout);
    }, 8000) };
    status();
    updateControls();
  }

  for (const phrase of QUICK_PHRASES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = phrase;
    button.onclick = () => submit(phrase);
    phrases.appendChild(button);
    presetButtons.push(button);
  }
  toggle.onclick = () => openPanel(panel.hidden);
  el('chat-close').onclick = () => { openPanel(false); toggle.focus(); };
  form.onsubmit = event => { event.preventDefault(); submit(input.value, true); };
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { openPanel(false); toggle.focus(); }
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) openPanel(false);
  });
  updateControls();
  return {
    setOnline(value) {
      if (value === online) return;
      online = value;
      if (!online) finishRequest();
      status(online ? '' : feedback.offline);
      updateControls();
    },
    receive(m) {
      if (m.type === 'chatHistory') {
        history(m.entries);
        return;
      }
      const wasPending = pending && m.requestId === pending.requestId;
      if (m.type === 'chatRejected') {
        if (wasPending) { finishRequest(); status(feedback[m.reason] ?? feedback.timeout); }
        return;
      }
      if (wasPending) {
        if (input.value === pending.draft) input.value = '';
        finishRequest();
        status();
      }
      append(m.entry);
      if (panel.hidden && m.entry?.player !== playerInfo().seat) {
        unread++;
        updateBadge();
      }
    },
    hidePanel: () => openPanel(false),
    close() {
      online = false;
      finishRequest();
      input.value = '';
      unread = 0;
      history([]);
      status();
      openPanel(false);
      updateControls();
    },
  };
}
