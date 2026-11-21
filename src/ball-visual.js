import { Container, GlProgram, Graphics, Mesh, MeshGeometry, Shader, Texture } from 'pixi.js';
import { BALL_COLORS, BALL_R } from './config.js';
import { REST_ORIENTATION } from './orientation.js';

const vertex = `
  attribute vec2 aPosition;
  uniform mat3 uProjectionMatrix;
  uniform mat3 uWorldTransformMatrix;
  uniform mat3 uTransformMatrix;
  varying vec2 vDisc;

  void main() {
    vDisc = vec2(aPosition.x, -aPosition.y) / ${BALL_R.toFixed(1)};
    vec3 position = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragment = `
  varying vec2 vDisc;
  uniform vec4 uOrientation;
  uniform vec3 uColorBase;
  uniform float uNumber;
  uniform sampler2D uNumbers;

  void main() {
    float radius = length(vDisc);
    if (radius > 1.015) discard;
    // Orthographic front hemisphere. Rotate the surface lookup, leaving the light fixed.
    vec3 normal = normalize(vec3(vDisc, sqrt(max(0.0, 1.0 - dot(vDisc, vDisc)))));
    vec4 inverse = normalize(uOrientation) * vec4(-1.0, -1.0, -1.0, 1.0);
    vec3 t = 2.0 * cross(inverse.xyz, normal);
    vec3 surface = normal + inverse.w * t + cross(inverse.xyz, t);
    vec3 ivory = vec3(1.0, 0.99, 0.96);
    vec3 color = uColorBase;

    if (uNumber < 0.5) {
      // Small red spots on all three axes make even the cue ball's spin visible.
      vec3 axes = abs(surface);
      float spot = smoothstep(0.982, 0.992, max(axes.x, max(axes.y, axes.z)));
      color = mix(ivory, vec3(0.70, 0.09, 0.13), spot);
    } else {
      if (uNumber > 8.5) {
        color = mix(color, ivory, smoothstep(0.51, 0.55, abs(surface.y)));
      }
      // The two number medallions sit on opposite faces, right-reading on both.
      vec2 face = vec2(surface.z < 0.0 ? -surface.x : surface.x, -surface.y);
      float badge = 1.0 - smoothstep(0.44, 0.48, length(face));
      if (badge > 0.0) {
        vec2 cell = vec2(mod(uNumber, 4.0), floor(uNumber / 4.0));
        vec2 uv = (cell + face / 0.98 + 0.5) / 4.0;
        vec3 badgeColor = mix(ivory, vec3(0.035, 0.049, 0.063), texture2D(uNumbers, uv).a);
        color = mix(color, badgeColor, badge);
      }
    }

    vec3 light = normalize(vec3(-0.40, 0.55, 0.77));
    vec3 halfVector = normalize(light + vec3(0.0, 0.0, 1.0));
    float diffuse = max(0.0, dot(normal, light));
    float gloss = max(0.0, dot(normal, halfVector));
    color *= 0.44 + 0.51 * diffuse + 0.12 * normal.z;
    color += vec3(0.13 * pow(gloss, 14.0) + 0.32 * pow(gloss, 75.0));
    float alpha = 1.0 - smoothstep(0.962, 1.015, radius);
    gl_FragColor = vec4(color * alpha, alpha);
  }
`;

function makeNumberAtlas() {
  const cell = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 4 * cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111922';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let n = 1; n <= 15; n++) {
    ctx.font = `900 ${n < 10 ? 52 : 44}px Arial`;
    ctx.fillText(String(n), (n % 4 + 0.5) * cell, (Math.floor(n / 4) + 0.53) * cell, cell * 0.89);
  }
  return Texture.from(canvas);
}

export function createSphereBalls() {
  const edge = BALL_R + 1;
  const geometry = new MeshGeometry({
    positions: new Float32Array([-edge, -edge, edge, -edge, edge, edge, -edge, edge]),
    indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
  });
  const glProgram = GlProgram.from({ name: 'pool-sphere', vertex, fragment });
  const numbers = makeNumberAtlas();
  return BALL_COLORS.map((color, number) => {
    const orientation = new Float32Array(REST_ORIENTATION);
    const shader = new Shader({
      glProgram,
      resources: {
        uNumbers: numbers.source,
        surface: {
          uOrientation: { type: 'vec4<f32>', value: orientation },
          uColorBase: { type: 'vec3<f32>', value: new Float32Array([
            (color >> 16) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255,
          ]) },
          uNumber: { type: 'f32', value: number },
        },
      },
    });
    const visual = new Container();
    const shadow = new Graphics().ellipse(2, 3, BALL_R * 1.04, BALL_R * 0.90)
      .fill({ color: 0x001b14, alpha: 0.35 });
    visual.addChild(shadow, new Mesh({ geometry, shader }));
    let last = REST_ORIENTATION;
    visual.setOrientation = (next = REST_ORIENTATION) => {
      if (next === last) return;
      orientation.set(next);
      shader.resources.surface.update();
      last = next;
    };
    return visual;
  });
}
