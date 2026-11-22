const FRAME_MS = 1000 / 30;
const BURST_MS = 330;

function ribbon(graphics, start, end, width, color, alpha, height) {
  graphics.moveTo(start, height(start));
  for (let i = 1; i <= 24; i++) {
    const x = start + (end - start) * i / 24;
    graphics.lineTo(x, height(x));
  }
  graphics.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

function diamond(graphics, x, y, size, color, alpha) {
  graphics.poly([x - size, y, x, y - size * .68, x + size, y, x, y + size * .68])
    .fill({ color, alpha });
}

function aurora(back, front, phase, strength) {
  const x = -167 + Math.sin(phase * 1.28) * 62;
  const y = Math.cos(phase * 2.14) * (6 + strength * 11);
  const gleam = .48 + .18 * Math.sin(phase * 4.7);
  const rays = [0x9ce5e8, 0x899fd7, 0xb2a1e5, 0xdeacd5];
  for (let i = 0; i < rays.length; i++) {
    const spread = (i - 1.5) * (5 + strength * 5);
    const end = x + 43 + i * 15;
    back.poly([x - 5, y, end, spread - 3, end - 17, spread + 4])
      .fill({ color: rays[i], alpha: strength * .21 });
    back.moveTo(x - 31 - i * 17, Math.sin(phase * 2.8 + i) * 10).lineTo(x - 4, y)
      .lineTo(end - 8, spread - 1)
      .stroke({ color: rays[i], width: .82, alpha: strength * .58 });
    front.circle(end - 8, spread - 1, .6).fill({ color: rays[i], alpha: strength });
  }
  front.save().rotateTransform(Math.sin(phase * 2.0) * .28).translateTransform(x, y);
  front.poly([-13, 2, -5, -9, 10, -5, 13, 5, 2, 9])
    .fill({ color: 0x353663, alpha: .78 }).stroke({ width: .8, color: 0xc9e8ff, alpha: .67 });
  front.poly([-13, 2, -5, -9, 1, 1]).fill({ color: 0xc5f2fa, alpha: gleam + .19 });
  front.poly([-5, -9, 10, -5, 1, 1]).fill({ color: 0x98c6e8, alpha: gleam * .72 });
  front.poly([1, 1, 10, -5, 13, 5, 2, 9]).fill({ color: 0xc1a7ed, alpha: .9 - gleam });
  front.restore();
}

function sand(back, front, phase, strength) {
  // Dune crests split into thin lee-side streaks as the wind moves over the shaft.
  for (let i = 0; i < 5; i++) {
    const start = -325 + i * 15;
    const span = 260 - i * 11;
    const shift = phase * (1.8 + i * .17) + i * .64;
    const taper = x => Math.sin((x - start) / span * Math.PI);
    const crest = x => (Math.sin(x * .031 + shift) * (8 + strength * 6) + (i - 2) * 4) * taper(x);
    const layer = i < 2 ? back : front;
    ribbon(layer, start, start + span, 3.5 - i * .38, 0xaa6d49, .13 + strength * .12, crest);
    ribbon(layer, start + 8, start + span - 7, .75, i % 2 ? 0xf3c089 : 0xd39264, .22 + strength * .2, crest);
  }
  for (let i = 0; i < 44; i++) {
    const progress = (phase * (.16 + (i % 4) * .055) + i * .618) % 1;
    const x = -8 - 331 * progress;
    const y = Math.sin(i * 2.17 + phase * 1.98 + progress * 5) * (7 + (i % 6) * 3) * Math.sin(progress * Math.PI);
    const opacity = (.35 + strength * .46) * Math.sin(progress * Math.PI) * (.52 + (i % 4) * .13);
    const grain = i % 7 ? .45 + (i % 4) * .2 : 1.5;
    const layer = i % 3 ? front : back;
    layer.ellipse(x, y, grain * 1.6, grain * .75)
      .fill({ color: i % 4 ? 0xeccc99 : 0xf8deaf, alpha: opacity });
    if (i % 7 === 0) {
      layer.moveTo(x + 2, y + .25).lineTo(x + 8 + strength * 5, y - 1.4)
        .stroke({ color: 0xd6a475, width: .55, alpha: opacity * .71, cap: 'round' });
    }
  }
}

function jade(back, front, phase, strength) {
  const vine = x => Math.sin(x * .055 - phase * 2.45) * (6 + strength * 9);
  ribbon(back, -329, -23, 5, 0x0f4934, .92, x => -vine(x));
  ribbon(front, -325, -21, 2, 0x517e57, .79, vine);
  for (let i = 0; i < 8; i++) {
    const x = -301 + i * 35, y = vine(x);
    const pulse = .5 + .5 * Math.sin(phase * 3.3 - i * .83);
    const side = i % 2 ? 1 : -1;
    const leafX = x + 9 + pulse * 6;
    const leafY = y + side * (6 + pulse * 7 + strength * 4);
    front.moveTo(x, y).quadraticCurveTo(x + 5, leafY, leafX, leafY)
      .stroke({ width: 1.05, color: 0x84b681, alpha: .74, cap: 'round' });
    front.save().rotateTransform(side * (.4 + pulse * .75)).translateTransform(leafX, leafY);
    front.moveTo(-4, 0).quadraticCurveTo(3, -6 - pulse * 2, 15, 0)
      .quadraticCurveTo(4, 7 + pulse, -4, 0).closePath()
      .fill({ color: i % 3 ? 0x408271 : 0x80a879, alpha: .67 + pulse * .17 });
    front.moveTo(-3, 0).quadraticCurveTo(6, -2.2, 13, 0)
      .moveTo(2, -.9).lineTo(6, -3.6).moveTo(6, -1.2).lineTo(10, 2)
      .stroke({ width: .67, color: 0xc2e9ae, alpha: .46 + pulse * .34 });
    front.restore();
  }
}

function moon(back, front, phase, strength, radiusAt) {
  const spin = (x, offset = 0) => x * .066 - phase * 3.7 + offset;
  const orbit = x => radiusAt(x) + 6 + strength * 9;
  for (let i = 0; i < 60; i++) {
    const x = -324 + i * 5.25, end = x + 5.25;
    const angle = spin(x), next = spin(end);
    const towardViewer = Math.cos((angle + next) / 2) >= 0;
    const layer = towardViewer ? front : back;
    layer.moveTo(x, Math.sin(angle) * orbit(x)).lineTo(end, Math.sin(next) * orbit(end));
  }
  back.stroke({ width: 1.25, color: 0xa0aeff, alpha: strength * .5 });
  front.stroke({ width: 1.25, color: 0xe2f6ff, alpha: strength * .69 });
  for (let i = 0; i < 8; i++) {
    const x = -20 - ((phase * .62 + i / 9) % 1) * 296;
    const angle = spin(x, Math.PI);
    const y = Math.sin(angle) * (orbit(x) + 4);
    const layer = Math.cos(angle) > 0 ? front : back;
    diamond(layer, x, y, .9 + (i % 3) * .49, i % 3 ? 0xf2fbff : 0xc2a8ff, strength);
  }
  const x = -116 + Math.sin(phase * 1.03) * 63;
  const y = Math.cos(phase * 2.05) * (orbit(x) + 4);
  const glow = .28 + strength * .43;
  back.circle(x, y, 14).fill({ color: 0xaea9ff, alpha: glow * .18 });
  front.save().rotateTransform(Math.sin(phase * 1.6) * .42).scaleTransform(.77).translateTransform(x, y);
  front.moveTo(6, -13).bezierCurveTo(-12, -15, -19, -1, -11, 10)
    .bezierCurveTo(-5, 19, 10, 15, 14, 6).bezierCurveTo(2, 12, -8, 2, -4, -6)
    .quadraticCurveTo(0, -12, 6, -13).closePath()
    .fill({ color: 0xd5e6f8, alpha: .87 }).stroke({ width: .8, color: 0xa99ff1, alpha: .87 });
  diamond(front, 8, -6, 2.7, 0xfaf8ff, glow + .17);
  front.restore();

  const sunX = -242 + Math.sin(phase * 1.03 + Math.PI) * 63;
  const sunY = -Math.cos(phase * 2.05) * (orbit(sunX) + 3);
  const radius = 7.4 + strength * 1.2;
  for (let i = 0; i < 4; i++) {
    back.circle(sunX, sunY, radius + 12 - i * 2.8)
      .fill({ color: 0xd7985b, alpha: (.036 + strength * .064) * (1 + i * .23) });
  }
  front.circle(sunX, sunY, radius).fill({ color: 0x59413b, alpha: .58 })
    .stroke({ width: 1.08, color: 0xffd4a2, alpha: .46 + strength * .48 });
  for (let i = 0; i < 17; i++) {
    const a = i * 2.4 + phase * .19;
    const inner = radius - .4;
    const outer = radius + 2 + (1 + Math.cos(a * 3 - phase * 2)) * (1 + strength * 2);
    front.moveTo(sunX + Math.cos(a) * inner, sunY + Math.sin(a) * inner)
      .lineTo(sunX + Math.cos(a + .08) * outer, sunY + Math.sin(a + .08) * outer)
      .stroke({ color: 0xffdab1, width: .54, alpha: .2 + strength * .31, cap: 'round' });
  }
}

const dragon = {
  width: 5.9, twist: .063, speed: 2.35, headSize: 82,
  shadow: 0x9f0b2d, haze: 0xca163f, rim: 0xff4e57, glint: 0xffc994,
};
const snake = {
  width: 4.4, twist: .074, speed: 2.15, headSize: 87,
  shadow: 0x332595, haze: 0x6554ca, rim: 0x8899ff, glint: 0xc0cfff,
};

const lavaFissure = [
  .17, -.43, .27, -.28, .41, -.09, -.46, .37, -.18, .34, -.49, .18,
  -.21, .5, -.32, .2, -.51, .26, -.27, .45, -.18, .12, -.31, 0,
];

function drawMoltenSurface(g, phase, strength, radiusAt) {
  const step = 344 / (lavaFissure.length - 1);
  for (let i = 1; i < lavaFissure.length; i++) {
    const x = -348 + (i - 1) * step, end = x + step;
    const mid = x + step * .62;
    const a = radiusAt(x) * lavaFissure[i - 1], b = radiusAt(end) * lavaFissure[i];
    const crest = (a + b) * .34 + Math.sin(i * 2.34) * radiusAt(mid) * .19;
    const side = i % 2 ? 1 : -1;
    const edge = side * radiusAt(mid) * .89;
    const pulse = .5 + .5 * Math.cos(x * .046 - phase * 4.6);
    const thickness = .7 + radiusAt(mid) * .13;

    // Darker crust covers some of the scarlet material, leaving two hot channels around it.
    g.poly([x, a, x + step * .35, edge * .85, mid, edge, end, b, mid, crest])
      .fill({ color: i % 3 ? 0x9d092a : 0xf00b31, alpha: .44 + .21 * (1 - pulse) });
    g.moveTo(x, a).lineTo(mid, crest).lineTo(end, b)
      .stroke({ color: 0xff452b, width: thickness + 1, alpha: .8, cap: 'round', join: 'round' });
    g.moveTo(x, a).lineTo(mid, crest).lineTo(end, b)
      .stroke({ color: pulse > .66 ? 0xffd399 : 0xff844e,
        width: thickness * (.63 + .23 * strength), alpha: .59 + .37 * pulse, cap: 'round', join: 'round' });
    if (i % 2 === 0) {
      g.moveTo(mid, crest).lineTo(mid + step * .12, edge * .61).lineTo(mid + step * .23, edge * .86)
        .stroke({ color: 0xff8964, width: thickness * .49, alpha: .4 + .43 * pulse, cap: 'round' });
    }
  }
}

function drawCoil(back, front, phase, strength, radiusAt, animal, headArt) {
  const end = -48;
  const count = 54;
  const points = Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    const x = -343 + (343 + end) * t;
    const turn = (x - end) * animal.twist - phase * animal.speed;
    const breadth = radiusAt(x) + (6.5 + strength * 11) * Math.min(1, .5 + t * 3);
    const fog = .5 + .5 * Math.cos(x * .052 - phase * 3.1);
    const width = animal.width * Math.min(1, .05 + t * 5.5, 1.86 - t);
    return { x, y: Math.sin(turn) * breadth, width, fog, near: Math.cos(turn) >= 0 };
  });

  for (let i = 0; i < 3; i++) {
    const first = -330 + i * 15, last = -23 - i * 19;
    const stream = x => Math.sin((x - first) / (last - first) * Math.PI)
      * (Math.sin(x * .043 - phase * 2.7 + i) * (9 + strength * 10) + (i - 1) * 8);
    ribbon(back, first, last, 5 - i * 1.1, animal.haze, .12 + strength * .16, stream);
    ribbon(front, first + 17, last - 11, .6, animal.rim, .1 + strength * .28, stream);
  }

  // A shared centerline keeps lit scales aligned as each coil goes behind the cue.
  let start = 0;
  for (let i = 1; i <= count; i++) {
    if (i < count && i - start < 4 && points[i].near === points[start].near) continue;
    const section = points.slice(start, i + 1);
    const near = points[start].near;
    const g = near ? front : back;
    const visible = (.13 + section[Math.floor(section.length / 2)].fog * .53 + strength * .3) * (near ? 1 : .7);
    const upper = section.flatMap(({ x, y, width }) => [x, y - width]);
    const lower = section.slice().reverse().flatMap(({ x, y, width }) => [x, y + width]);
    g.poly(upper.concat(lower)).fill({ color: animal.shadow, alpha: visible * .86 });
    g.moveTo(section[0].x, section[0].y);
    for (const point of section.slice(1)) g.lineTo(point.x, point.y);
    g.stroke({ color: animal.haze, width: 9 + 3 * strength, alpha: visible * .18, cap: 'round', join: 'round' });
    const first = section[0];
    g.moveTo(first.x, first.y - first.width * .72);
    for (const { x, y, width } of section.slice(1)) g.lineTo(x, y - width * .72);
    g.stroke({ color: animal.rim, width: 1.05 + strength * .6, alpha: visible * .97, cap: 'round', join: 'round' });
    start = i;
  }

  for (let i = 3; i < count - 1; i += 2) {
    const { x, y, width, fog, near } = points[i];
    const g = near ? front : back;
    const alpha = (.12 + fog * .64) * strength * (near ? 1 : .49);
    g.moveTo(x - 2.3, y - width * .64).quadraticCurveTo(x + 2.5, y - width * .83, x + 3, y)
      .quadraticCurveTo(x + 2.9, y + width * .45, x - 1.5, y + width * .52)
      .stroke({ color: animal.rim, width: .68, alpha, cap: 'round' });
    if (i % 6 === 3) {
      const lift = 4 + 10 * fog;
      g.moveTo(x - 7, y - width - lift).quadraticCurveTo(x - 3, y - width - lift * .68,
        x + 4, y - width - lift * .57)
        .stroke({ color: animal.glint, width: .82, alpha: alpha * .93, cap: 'round' });
    }
  }

  const head = points.at(-1);
  const before = points.at(-3);
  const tilt = Math.atan2(head.y - before.y, head.x - before.x) * .29;
  if (headArt) {
    const x = head.x + 6, y = head.y - 1.5;
    const light = .5 + .5 * Math.cos(phase * 2.12);
    const { group, highlight, width } = headArt;
    group.scale.set(animal.headSize * (.9 + .15 * strength) / width);
    group.position.set(x, y);
    group.rotation = tilt;
    group.alpha = Math.min(1, .37 + .28 * light + .29 * strength);
    highlight.alpha = Math.min(1, .12 + .4 * light + .48 * strength);
    for (let i = 0; i < 3; i++) {
      back.ellipse(x + 2, y - 3.5, 32 - i * 6, 13 - i * 3)
        .fill({ color: animal.haze, alpha: (.05 + strength * .09) * (.58 + light * .42) });
    }
  }
}

const effects = {
  aurora: { draw: aurora, colors: [0x90fff4, 0xc3a9ff], reach: 35 },
  maple: { draw: sand, colors: [0xffe5b0, 0xdba96b], reach: 23 },
  ember: { draw(back, front, phase, strength, radiusAt, head) {
    drawMoltenSurface(front, phase, strength, radiusAt);
    drawCoil(back, front, phase, strength, radiusAt, dragon, head);
  }, colors: [0xffc58c, 0xff473c], reach: 53 },
  jade: { draw: jade, colors: [0xe8ffa8, 0x65f5a3], reach: 32 },
  ocean: { draw: (back, front, phase, strength, radiusAt, head) => drawCoil(back, front, phase, strength, radiusAt, snake, head),
    colors: [0xc2caff, 0x7b75fa], reach: 42 },
  pearl: { draw: moon, colors: [0xf1fcff, 0xc9acff], reach: 34 },
};

function drawBurst(graphics, effect, progress, power) {
  const { colors, reach } = effect;
  const flight = 1 - (1 - progress) ** 2;
  const alpha = (1 - progress) ** 2 * (.52 + .48 * power);
  const count = 8 + Math.round(power * 7);
  for (let i = 0; i < count; i++) {
    const angle = i * 2.4;
    const distance = 4 + flight * reach * (.45 + (i * .618) % .55);
    const x = Math.cos(angle) * distance, y = Math.sin(angle) * distance;
    const color = colors[i % colors.length];
    graphics.moveTo(x * .71, y * .71).lineTo(x, y)
      .stroke({ width: .68 + (i % 3) * .31, alpha, color, cap: 'round' });
    graphics.circle(x, y, .66 + (i % 3) * .24).fill({ color, alpha });
  }
  if (effect === effects.ocean) {
    graphics.ellipse(1, 0, 6 + flight * 23, 4 + flight * 13)
      .stroke({ width: 1.8, color: colors[0], alpha });
  }
}

export function createCueEffects(styleId, radiusAt, back, front, burst, head) {
  const effect = effects[styleId] ?? effects.aurora;
  let lastFrame = -1, lastStrength = -1, lastBurst = -1, lastImpact = -1;
  burst.visible = false;
  return (now, power, stroke, gap = 0, reducedMotion = false) => {
    const impactAge = stroke ? now - stroke.impactAt : Infinity;
    const accent = stroke ? Math.max(0, 1 - Math.abs(impactAge) / 310) : 0;
    const strength = Math.round(Math.min(1, .53 + .29 * power + .32 * accent) * 24) / 24;
    const frame = reducedMotion ? 0 : Math.floor(now / FRAME_MS);
    if (frame !== lastFrame || strength !== lastStrength) {
      effect.draw(back.clear(), front.clear(), frame * FRAME_MS / 1000, strength, radiusAt, head);
      lastFrame = frame;
      lastStrength = strength;
    }
    burst.visible = !reducedMotion && !!stroke?.hit && impactAge >= 0 && impactAge < BURST_MS;
    if (!burst.visible) return;
    // Counter the pullback so the burst remains where the tip contacted the ball.
    burst.position.x = gap;
    const burstFrame = Math.floor(impactAge / FRAME_MS);
    if (lastImpact === stroke.impactAt && lastBurst === burstFrame) return;
    drawBurst(burst.clear(), effect, burstFrame * FRAME_MS / BURST_MS, power);
    lastImpact = stroke.impactAt;
    lastBurst = burstFrame;
  };
}
