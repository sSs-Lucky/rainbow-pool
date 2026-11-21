export const DEFAULT_CUE = 'aurora';

export const CUE_STYLES = Object.freeze({
  aurora: { name: '极光', description: '蓝紫镶线 · 碳纤维握把', shaft: 0x59748f, body: 0x7561a2, grip: 0x111925, inlay: 0x60cde7 },
  maple: { name: '蜜色枫木', description: '天然木纹 · 铜色接环', shaft: 0xe4bd7d, body: 0x9a5430, grip: 0xb78044, inlay: 0xffdd9a, ring: 0xf1c16e, pattern: 'grain' },
  ember: { name: '赤焰', description: '酒红漆面 · 银色尖镶', shaft: 0x7c7e89, body: 0xcf3250, grip: 0x25151e, inlay: 0xff9b76, ring: 0xe4dee9, pattern: 'points' },
  jade: { name: '翡翠', description: '翠绿漆面 · 浅色菱镶', shaft: 0xccab79, body: 0x25a778, grip: 0x1a3430, inlay: 0xc6f49b, ring: 0xf0d99a, pattern: 'diamonds' },
  ocean: { name: '深海蓝', description: '蓝色珍珠光 · 银色环纹', shaft: 0x83b5d9, body: 0x2679d6, grip: 0x172954, inlay: 0xa6eeff, ring: 0xc8edff, pattern: 'waves' },
  pearl: { name: '月白', description: '珍珠白漆面 · 黑色握把', shaft: 0xd8e6ec, body: 0xebeadb, grip: 0x282b35, inlay: 0x777182, ring: 0xe4ccb2, pattern: 'windows' },
});

export function isCueStyle(id) {
  return typeof id === 'string' && Object.hasOwn(CUE_STYLES, id);
}

export function cueStyle(id) {
  return CUE_STYLES[isCueStyle(id) ? id : DEFAULT_CUE];
}

export const colorHex = color => '#' + color.toString(16).padStart(6, '0');
