import * as THREE from 'three';

/**
 * ParticleField: GPU-animated instanced billboards (smoke, embers, dust motes, falling leaves, fountain spray).
 * All motion is computed in the vertex shader from a time uniform, so thousands of particles cost one draw call and
 * ~zero CPU. Billboards are expanded in view space (resolution independent, works under the low-res PSX pass).
 * OWNER: world module.
 */

export interface ParticleOpts {
  map: THREE.Texture;
  blending?: 'additive' | 'normal';
  /** World gravity/acceleration applied over a particle's age (units/s^2). */
  gravity?: [number, number, number];
  /** Size multiplier reached at end of life. */
  sizeEnd?: number;
  /** Global alpha. */
  alpha?: number;
  /** Rotation speed of the quad (rad/s), 0 = none. */
  spin?: number;
  /** Wrap particles inside a box that follows `center` (motes/leaves around the camera). */
  wrap?: [number, number, number];
  /** Colour multiplier (>1 for bloom). */
  intensity?: number;
  /** Distance fade start/end (usually from scene fog). */
  fog?: [number, number];
  /** Near fade (m from the camera): alpha ramps from 0 at [0] to full at [1], so big puffs never sit in front of the lens. */
  near?: [number, number];
}

export interface Particle {
  /** Spawn position (emitter origin for time-looped particles). */
  pos: [number, number, number];
  /** Initial velocity. */
  vel?: [number, number, number];
  /** Normalised lifetime speed: particles loop every 1/speed seconds. */
  speed: number;
  phase?: number;
  size: number;
  /** Horizontal sway amplitude. */
  sway?: number;
  color: THREE.ColorRepresentation;
}

const VERT = /* glsl */ `
attribute vec3 origin;
attribute vec4 pa;     // speed, phase, size, sway
attribute vec3 vel;
attribute vec3 gcolor;
uniform float uTime;
uniform vec3 uGravity;
uniform vec3 uWrap;
uniform vec3 uCenter;
uniform float uSizeEnd;
uniform float uAlpha;
uniform float uSpin;
uniform float uFogNear;
uniform float uFogFar;
uniform float uNearA;
uniform float uNearB;
varying vec2 vUv;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vUv = uv;
  float L = 1.0 / max(pa.x, 0.0001);
  float t = fract(uTime * pa.x + pa.y);
  float age = t * L;
  vec3 p = origin + vel * age + 0.5 * uGravity * age * age;
  p.x += sin(uTime * 0.7 + pa.y * 40.0) * pa.w;
  p.z += cos(uTime * 0.6 + pa.y * 31.0) * pa.w;
  float edge = 1.0;
  if (uWrap.x > 0.0) {
    vec3 rel = p - uCenter + 0.5 * uWrap;
    rel = mod(rel, uWrap);
    vec3 loc = rel - 0.5 * uWrap;
    p = uCenter + loc;
    vec3 n = abs(loc) / (0.5 * uWrap);
    edge = 1.0 - smoothstep(0.7, 1.0, max(max(n.x, n.y), n.z));
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = pa.z * mix(1.0, uSizeEnd, t);
  float a = uSpin * (uTime + pa.y * 10.0);
  float ca = cos(a), sa = sin(a);
  vec2 q = vec2(ca * position.x - sa * position.y, sa * position.x + ca * position.y);
  mv.xy += q * size;
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  float life = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.55, 1.0, t));
  vAlpha = uAlpha * life * edge * (1.0 - smoothstep(uFogNear, uFogFar, dist)) * smoothstep(0.4, 2.5, dist) * smoothstep(uNearA, uNearB + 1e-3, dist);
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
  gl_FragColor = vec4(vColor * uIntensity * t.rgb, a);
}
`;

export class ParticleField {
  readonly mesh: THREE.Mesh;
  private list: Particle[] = [];
  private geo = new THREE.InstancedBufferGeometry();
  private mat: THREE.ShaderMaterial;
  private wrap: boolean;

  constructor(private o: ParticleOpts) {
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.attributes.position);
    this.geo.setAttribute('uv', base.attributes.uv);
    this.wrap = !!o.wrap;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: o.map },
        uGravity: { value: new THREE.Vector3(...(o.gravity ?? [0, 0, 0])) },
        uWrap: { value: new THREE.Vector3(...(o.wrap ?? [0, 0, 0])) },
        uCenter: { value: new THREE.Vector3() },
        uSizeEnd: { value: o.sizeEnd ?? 1 },
        uAlpha: { value: o.alpha ?? 1 },
        uSpin: { value: o.spin ?? 0 },
        uIntensity: { value: o.intensity ?? 1 },
        uFogNear: { value: o.fog?.[0] ?? 60 },
        uFogFar: { value: o.fog?.[1] ?? 220 },
        // no near fade unless asked: [0, 0] is a pass-through (smoothstep(0, 0, d) = 1 for d > 0)
        uNearA: { value: o.near?.[0] ?? 0 },
        uNearB: { value: o.near?.[1] ?? 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: o.blending === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.matrixAutoUpdate = false;
  }

  add(p: Particle): void {
    this.list.push(p);
  }

  get count(): number {
    return this.list.length;
  }

  build(): void {
    const n = this.list.length;
    const origin = new Float32Array(n * 3), pa = new Float32Array(n * 4), vel = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const c = new THREE.Color();
    this.list.forEach((p, i) => {
      origin.set(p.pos, i * 3);
      pa.set([p.speed, p.phase ?? Math.random(), p.size, p.sway ?? 0], i * 4);
      vel.set(p.vel ?? [0, 0, 0], i * 3);
      c.set(p.color);
      col.set([c.r, c.g, c.b], i * 3);
    });
    this.geo.setAttribute('origin', new THREE.InstancedBufferAttribute(origin, 3));
    this.geo.setAttribute('pa', new THREE.InstancedBufferAttribute(pa, 4));
    this.geo.setAttribute('vel', new THREE.InstancedBufferAttribute(vel, 3));
    this.geo.setAttribute('gcolor', new THREE.InstancedBufferAttribute(col, 3));
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
  }

  setFog(near: number, far: number): void {
    this.mat.uniforms.uFogNear.value = near;
    this.mat.uniforms.uFogFar.value = far;
  }

  update(time: number, center?: THREE.Vector3): void {
    this.mat.uniforms.uTime.value = time;
    if (this.wrap && center) this.mat.uniforms.uCenter.value.copy(center);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
