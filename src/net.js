function connection(action, code, handlers) {
  let ws, stopped = false, retry, attempt = 0, ready = false;
  let room = code || '', key = room ? sessionStorage.getItem('rainbow-seat-' + room) : null;
  function open() {
    if (stopped) return;
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    ws.onopen = () => {
      attempt = 0;
      ws.send(JSON.stringify(room ? { action: 'join', code: room, token: key } : { action }));
    };
    ws.onmessage = event => {
      let m; try { m = JSON.parse(event.data); } catch { return; }
      if (m.type === 'ready') {
        room = m.code; key = m.token; sessionStorage.setItem('rainbow-seat-' + room, key);
        handlers.ready?.(room, m.player); handlers.connected?.(); ready = true;
      } else if (m.type === 'error') { stopped = true; handlers.error?.(m.code); ws.close(); }
      else handlers.message?.(m);
    };
    ws.onclose = event => {
      if (stopped) return;
      if (event.code === 4001) { stopped = true; handlers.error?.('replaced'); return; }
      handlers.reconnecting?.(); retry = setTimeout(open, Math.min(6000, 1000 + attempt++ * 1000));
    };
    ws.onerror = () => {};
  }
  open();
  return {
    send(m) { if (ws?.readyState === WebSocket.OPEN && ready) ws.send(JSON.stringify(m)); },
    close() { stopped = true; clearTimeout(retry); ws?.close(); },
  };
}
export const host = handlers => connection('create', '', handlers);
export const join = (code, handlers) => connection('join', code, handlers);
