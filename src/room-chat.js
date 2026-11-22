export const CHAT_MAX_LENGTH = 80;
export const CHAT_HISTORY_LIMIT = 30;

export const QUICK_PHRASES = Object.freeze([
  '好球！',
  '一杆清台了！',
  '看来我得把脚放下来，用手打了。',
  '这杆走位漂亮！',
  '这防守真严实。',
  '看我的翻袋！',
  '这一杆差一点！',
  '白球听话一点啊。',
  '稍等，瞄一会儿。',
  '打得过瘾，再来一局？',
]);

export function chatText(value) {
  if (typeof value !== 'string') return '';
  const text = value.trim().replace(/[\t\r\n]+/g, ' ');
  if (!text || [...text].length > CHAT_MAX_LENGTH || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(text)) return '';
  return text;
}
