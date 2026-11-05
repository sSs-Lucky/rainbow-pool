const STR = {
  play: '开始打球', settings: '玩法说明', quit: '返回', solo: '单人练球', multiplayer: '好友对战', back: '返回首页',
  create: '创建房间 · 邀请好友', join: '输入房间码', connect: '加入对战', restart: '再来一局', menu: '退出',
  hostHint: '房间已准备好，邀请一位朋友入座。', joinHint: '输入朋友分享的 6 位房间码',
  aimHint: '拖动球桌瞄准 · 左侧力度条向下拉，松手击球',
  shots: '击球', potted: '进球', you: '你', rival: '对手', solids: '全色球 1–7', stripes: '花色球 9–15',
  accept: '确定', reject: '取消', confirmRestart: '重新摆球并开始新的一局？双方当前进度将重置。',
  confirmExit: '离开当前球桌？你可以通过原链接重新入座。', rivalJoined: '朋友已入座，开球吧！',
  youLeft: '已离开球桌', rivalLeft: '对手暂时离线，等待重新连接', yourTurn: '轮到你击球', rivalTurn: '轮到对手击球',
  ballInHandYou: '获得自由球，可在全台面摆放白球', placeCueHint: '点击或拖动白球选择空位，确认摆球后再瞄准击球',
  mustStripes: '你打花色球 9–15，最后打黑 8', mustSolids: '你打全色球 1–7，最后打黑 8',
  won: '漂亮！你赢了', lost: '这局惜败，再来一局', connecting: '正在连接球桌…', waitingHost: '已连接，等待另一位玩家…',
  closed: '连接已断开，正在重连…', notFound: '找不到这个房间，请检查链接或房间码', code4: '请输入 6 位房间码',
};
export const getLang = () => 'zh-CN';
export const setLang = () => applyStatic();
export const t = key => STR[key] || key;
export function applyStatic() {
  document.documentElement.lang = 'zh-CN';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
}
