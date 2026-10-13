import * as THREE from 'three';

/**
 * GlowField: thousands of additive camera-facing glow quads in ONE draw call (instanced billboards expanded in
 * view space, so the size is resolution independent and works under the low-res PSX pass).
 * Used for torch halos, flame cores, candle glows, crystal/lava shimmer, fireflies... OWNER: world module.
 */

export interface GlowOpts {
  /** World-space size of the quad (metres). */
  size: number;
  /** Flicker amount 0..1 (size + brightness). */
  flicker?: number;
  /** Colour multiplier > 1 pushes the glow over the bloom threshold. */
  intensity?: number;
  phase?: number;
  /** 0 = centred glow, 1 = anchored at the bottom (flames). */
  anchor?: 0 | 1;
}

const VERT = /* glsl */ `
attribute vec3 offset;
attribute vec3 gcolor;
attribute vec4 params; // size, phase, flicker, anchor
uniform float uTime;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vUv = uv;
  float size = params.x;
  float t = uTime;
  float ph = params.y * 6.2831;
  float f = 1.0 + params.z * (0.5 * sin(t * 11.0 + ph) + 0.3 * sin(t * 23.7 + ph * 2.7) + 0.2 * sin(t * 5.3 + ph * 1.3));
  vec4 mv = modelViewMatrix * vec4(offset, 1.0);
  vec2 q = position.xy;
  q.y += params.w * 0.5;
  mv.xy += q * size * f;
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  vAlpha = (1.0 - smoothstep(uFogNear, uFogFar, dist)) * smoothstep(0.6, 3.5, dist) * clamp(f * 0.9 + 0.1, 0.0, 1.6);
  vColor = gcolor;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uIntensity;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * uIntensity, a);
}
`;

export class GlowField {
  readonly mesh: THREE.Mesh;
  private offsets: number[] = [];
  private colors: number[] = [];
  private params: number[] = [];
  private geo = new THREE.InstancedBufferGeometry();
  private mat: THREE.ShaderMaterial;
  private built = false;
  /**
   * When true, GlowOpts.intensity multiplies the glow colour (the documented contract). Off by default: most callers
   * (town lamps, menus) were written against the old behaviour where the value was ignored. Dungeon builders turn it on.
   */
  scaleByIntensity = false;

  constructor(map: THREE.Texture, intensity = 1.2) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.attributes.position);
    this.geo.setAttribute('uv', base.attributes.uv);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: map },
        uIntensity: { value: intensity },
        uFogNear: { value: 20 },
        uFogFar: { value: 80 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.matrixAutoUpdate = false;
  }

  get count(): number {
    return this.offsets.length / 3;
  }

  add(pos: THREE.Vector3 | [number, number, number], color: THREE.ColorRepresentation, o: GlowOpts): number {
    const x = Array.isArray(pos) ? pos[0] : pos.x, y = Array.isArray(pos) ? pos[1] : pos.y, z = Array.isArray(pos) ? pos[2] : pos.z;
    const c = new THREE.Color(color);
    const k = this.scaleByIntensity ? (o.intensity ?? 1) : 1;
    this.offsets.push(x, y, z);
    this.colors.push(c.r * k, c.g * k, c.b * k);
    this.params.push(o.size, o.phase ?? Math.random(), o.flicker ?? 0.15, o.anchor ?? 0);
    this.built = false;
    return this.offsets.length / 3 - 1;
  }

  /** Create/refresh GPU attributes after adding glows. */
  build(): void {
    const n = this.count;
    this.geo.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(this.offsets), 3));
    this.geo.setAttribute('gcolor', new THREE.InstancedBufferAttribute(new Float32Array(this.colors), 3));
    this.geo.setAttribute('params', new THREE.InstancedBufferAttribute(new Float32Array(this.params), 4));
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    this.built = true;
  }

  setFog(near: number, far: number): void {
    this.mat.uniforms.uFogNear.value = near;
    this.mat.uniforms.uFogFar.value = far;
  }

  update(time: number): void {
    this.mat.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
