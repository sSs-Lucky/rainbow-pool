export const DEFAULT_CUE = 'aurora';

export const CUE_STYLES = Object.freeze({
  aurora: {
    name: '极光', effectName: '折光棱镜', description: '均衡手感，适合日常对局',
    shaft: 0x7291ca, body: 0x5e63b7, grip: 0x273449, inlay: 0x76e5f2, ring: 0x98bffc,
    buttRadius: 7.5, tipRadius: 2.35, bands: [[-348, 11], [-256, 5], [-246, 2], [-101, 6], [-16, 11]],
    shot: { maxSpeed: 7, powerCurve: 1.35, maxTipOffset: .48 },
  },
  // Keep the stored ID so existing accounts retain the equivalent cue.
  maple: {
    name: '砂岩', effectName: '流沙风纹', description: '轻推力度好掌握，适合贴库走位',
    shaft: 0xc9c1ae, body: 0x927e67, grip: 0x4a443d, inlay: 0xf0d4aa, ring: 0xc1b4a0, pattern: 'sand',
    buttRadius: 6.8, tipRadius: 2.15, bands: [[-348, 12], [-253, 3], [-245, 3], [-109, 4], [-16, 11]],
    shot: { maxSpeed: 6.65, powerCurve: 1.60, maxTipOffset: .45 },
  },
  ember: {
    name: '熔岩', effectName: '盘杆火龙', description: '满力速度最高，适合开球',
    shaft: 0xff321d, inlay: 0xff7550, pattern: 'lava',
    buttRadius: 11.2, tipRadius: 2.95,
    shot: { maxSpeed: 7.45, powerCurve: 1.52, maxTipOffset: .40 },
  },
  jade: {
    name: '翡翠', effectName: '翡翠灵藤', description: '加塞范围最大，适合旋转走位',
    shaft: 0x9fb8a5, body: 0x238259, grip: 0x26443b, inlay: 0xb1f18b, ring: 0xdbcf94, pattern: 'diamonds',
    buttRadius: 7.8, tipRadius: 2.35, bands: [[-348, 10], [-257, 5], [-244, 3], [-98, 5], [-16, 11]],
    shot: { maxSpeed: 6.8, powerCurve: 1.21, maxTipOffset: .50 },
  },
  ocean: {
    name: '深海蓝', effectName: '盘杆水蛇', description: '中高力度出球快，适合长台',
    shaft: 0x5873cb, body: 0x4137ad, grip: 0x242853, inlay: 0x9ea5ff, ring: 0x9cb9f4, pattern: 'waves',
    buttRadius: 8.7, tipRadius: 2.45, bands: [[-348, 10], [-256, 7], [-100, 8], [-16, 11]],
    shot: { maxSpeed: 7.25, powerCurve: 1.30, maxTipOffset: .43 },
  },
  pearl: {
    name: '月白', effectName: '日月同辉', description: '小幅拉杆就能出力，低段灵敏',
    shaft: 0xd2dbe7, body: 0xe8e6dc, grip: 0x858d9f, inlay: 0xb8a6f5, ring: 0xcbd8e1, pattern: 'windows',
    buttRadius: 5.55, tipRadius: 1.85, bands: [[-348, 8], [-253, 3], [-102, 3], [-14, 9]],
    shot: { maxSpeed: 6.45, powerCurve: 1.10, maxTipOffset: .47 },
  },
});

export function isCueStyle(id) {
  return typeof id === 'string' && Object.hasOwn(CUE_STYLES, id);
}

export function cueStyle(id) {
  return CUE_STYLES[isCueStyle(id) ? id : DEFAULT_CUE];
}

export const colorHex = color => '#' + color.toString(16).padStart(6, '0');
