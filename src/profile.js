import { CUE_STYLES, colorHex, cueStyle } from './cue-styles.js';
import { el } from './ui.js';

const errors = {
  credentials: '请检查昵称和密码的格式。',
  nicknameTaken: '这个昵称已经有人使用。',
  login: '昵称或密码不正确。',
  retry: '尝试次数较多，请稍后再试。',
  expired: '登录已失效，请重新登录。',
  unavailable: '暂时无法连接账号服务，请稍后再试。',
};

async function request(action, method = 'GET', body) {
  const headers = method === 'GET' ? {} : { 'X-Rainbow-Request': '1' };
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api/${action}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.profile;
}

export function setupProfile(onChange, preview) {
  const auth = el('auth-dialog'), catalog = el('cue-catalog'), form = el('auth-form');
  const picker = el('cue-grid');
  const cards = new Map();
  let profile = null, action = 'login', busy = false, revision = 0;

  function update(next) {
    profile = next;
    el('profile-guest').hidden = !!profile;
    el('profile-member').hidden = !profile;
    el('profile-nickname').textContent = profile?.nickname ?? '';
    el('cue-open').textContent = `球杆 · ${cueStyle(profile?.cue).name}`;
    for (const [id, card] of cards) card.setAttribute('aria-pressed', String(profile?.cue === id));
    onChange(profile);
  }

  function showAuth(next) {
    action = next;
    form.reset();
    const title = next === 'register' ? '注册' : '登录';
    el('auth-title').textContent = title;
    el('auth-submit').textContent = title;
    el('auth-password').autocomplete = next === 'register' ? 'new-password' : 'current-password';
    el('auth-feedback').textContent = '';
    auth.showModal();
  }

  async function select(id) {
    if (!profile || busy || profile.cue === id) return;
    busy = true;
    el('cue-feedback').textContent = '正在保存…';
    for (const card of cards.values()) card.disabled = true;
    try {
      revision++;
      update(await request('profile', 'PATCH', { cue: id }));
      el('cue-feedback').textContent = `已装备 ${cueStyle(id).name}`;
    } catch (err) {
      if (err.message === 'expired') update(null);
      el('cue-feedback').textContent = errors[err.message] ?? errors.unavailable;
    } finally {
      for (const card of cards.values()) card.disabled = false;
      busy = false;
    }
  }

  el('profile-login').onclick = () => showAuth('login');
  el('profile-register').onclick = () => showAuth('register');
  el('auth-close').onclick = () => auth.close();
  auth.addEventListener('close', () => form.reset());
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    const submit = el('auth-submit');
    submit.disabled = true;
    el('auth-feedback').textContent = '';
    const { nickname, password } = Object.fromEntries(new FormData(form));
    try {
      revision++;
      update(await request(action, 'POST', { nickname, password }));
      if (auth.open) auth.close();
    } catch (err) {
      el('auth-feedback').textContent = errors[err.message] ?? errors.unavailable;
    } finally {
      submit.disabled = false;
      busy = false;
    }
  };

  el('profile-logout').onclick = async () => {
    if (busy) return;
    busy = true;
    try {
      revision++;
      update(await request('logout', 'POST'));
      el('profile-feedback').textContent = '已退出登录。';
    } catch { el('profile-feedback').textContent = errors.unavailable; }
    finally { busy = false; }
  };
  el('cue-close').onclick = () => catalog.close();
  el('cue-open').onclick = () => {
    if (!profile) return;
    if (cards.size === 0) {
      for (const [id, style] of Object.entries(CUE_STYLES)) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'cue-card';
        card.style.setProperty('--cue-accent', colorHex(style.inlay));
        const heading = document.createElement('div');
        heading.className = 'cue-card-heading';
        const title = document.createElement('strong');
        title.textContent = style.name;
        const effect = document.createElement('span');
        effect.className = 'cue-effect-name';
        effect.textContent = style.effectName;
        heading.append(title, effect);
        const detail = document.createElement('span');
        detail.textContent = style.description;
        const stats = document.createElement('dl');
        stats.className = 'cue-stats';
        const { maxSpeed, powerCurve, maxTipOffset } = style.shot;
        const values = [
          ['25% 力度', `${(maxSpeed * .25 ** powerCurve).toFixed(2)} m/s`],
          ['满力', `${maxSpeed.toFixed(2)} m/s`],
          ['击点上限', `${Math.round(maxTipOffset * 100)}%`],
        ];
        for (const [label, value] of values) {
          const stat = document.createElement('div');
          const term = document.createElement('dt');
          const valueNode = document.createElement('dd');
          term.textContent = label;
          valueNode.textContent = value;
          stat.append(term, valueNode);
          stats.appendChild(stat);
        }
        const art = preview(id);
        art.setAttribute('aria-hidden', 'true');
        card.append(art, heading, detail, stats);
        card.setAttribute('aria-pressed', String(profile.cue === id));
        card.onclick = () => select(id);
        picker.appendChild(card);
        cards.set(id, card);
      }
    }
    el('cue-feedback').textContent = '';
    catalog.showModal();
  };

  update(null);
  request('profile').then(next => { if (!revision) update(next); }).catch(() => {});
}
