import * as THREE from 'three'

/**
 * Ground for the simulations.
 *
 * The physics and the scenery must agree about where the ground is, so each
 * place is defined once as a height function and the mesh is generated from
 * it. Nothing here is sculpted by hand.
 *
 * This file holds only the machinery. The places themselves live one to a
 * file in `fields/`, beside the machine that runs on them.
 */

/**
 * Deterministic hash → 0–1. No seeding, so every visitor gets the same sand.
 * The offset matters: without it the lattice point at the origin hashes to
 * exactly zero, and since every machine starts near the origin, each one
 * would spawn in the bottom of the same artificial pit.
 */
export function hash(ix: number, iz: number) {
  const n = Math.sin(ix * 127.1 + iz * 311.7 + 41.3) * 43758.5453
  return n - Math.floor(n)
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Value noise on a unit lattice. */
export function noise(x: number, z: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = smooth(x - ix)
  const fz = smooth(z - iz)
  const a = hash(ix, iz)
  const b = hash(ix + 1, iz)
  const c = hash(ix, iz + 1)
  const d = hash(ix + 1, iz + 1)
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz
}

/** Summed octaves, returning roughly −1…1. */
export function fbm(x: number, z: number, octaves = 4) {
  let sum = 0
  let amp = 1
  let norm = 0
  let f = 1
  for (let i = 0; i < octaves; i++) {
    sum += (noise(x * f, z * f) * 2 - 1) * amp
    norm += amp
    amp *= 0.5
    f *= 2.07
  }
  return sum / norm
}

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
/** 0 below `a`, 1 above `b`, eased between. */
export const ramp = (t: number, a: number, b: number) =>
  smooth(clamp01((t - a) / (b - a)))

export interface Field {
  /** Ground height in metres. */
  height(x: number, z: number): number
  /** Surface colour, for the generated mesh. */
  colour(x: number, z: number, h: number): THREE.Color
  /** Rolling resistance coefficient, for anything with wheels or tracks. */
  drag(x: number, z: number): number
  /** Sky and haze. */
  sky: string
  haze: string
  fog: [number, number]
}

/**
 * Build the visible ground from a field. One big displaced grid: cheap, and
 * it means the mesh cannot disagree with the physics.
 */
export function terrainGeometry(field: Field, size: number, segments: number) {
  const geo = new THREE.PlaneGeometry(size, size, segments, segments)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const colours = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = field.height(x, z)
    pos.setY(i, h)
    const c = field.colour(x, z, h)
    colours[i * 3] = c.r
    colours[i * 3 + 1] = c.g
    colours[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3))
  geo.computeVertexNormals()
  return geo
}

/** Surface normal by finite difference — used to sit vehicles on the ground. */
export function slopeAt(field: Field, x: number, z: number, out: THREE.Vector3) {
  const d = 1.5
  const hx = field.height(x + d, z) - field.height(x - d, z)
  const hz = field.height(x, z + d) - field.height(x, z - d)
  return out.set(-hx, 2 * d, -hz).normalize()
}
