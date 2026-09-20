import * as THREE from 'three'
import { fbm, ramp, type Field } from '../terrain'

/** The Champs-Élysées, running +Z from the Étoile toward the Rond-Point. */
export const AVENUE = { halfWidth: 9, length: 1200, drop: 25 }
const STEEP = { length: 350, drop: 14 }

const PAVE = new THREE.Color('#5e5b57')
const PAVE2 = new THREE.Color('#6d6964')
const KERB = new THREE.Color('#9a958c')
const GRAVEL = new THREE.Color('#a89c86')
const LAWN = new THREE.Color('#7d8a5a')

function onAvenue(x: number, z: number) {
  return ramp(AVENUE.halfWidth + 2 - Math.abs(x), 0, 2.5) * ramp(z + 60, 0, 30)
}

export const boulevard: Field = {
  height(x, z) {
    const upper = THREE.MathUtils.clamp(z, 0, STEEP.length)
    const lower = THREE.MathUtils.clamp(z - STEEP.length, 0, AVENUE.length - STEEP.length)
    const grade =
      (-STEEP.drop / STEEP.length) * upper -
      ((AVENUE.drop - STEEP.drop) / (AVENUE.length - STEEP.length)) * lower
    const cobbles = fbm(x * 1.7, z * 1.7, 2) * 0.014
    const kerb = 0.12 * (1 - onAvenue(x, z))
    const rolling = fbm(x * 0.01, z * 0.01, 2) * 0.6 * (1 - onAvenue(x, z))
    return grade + cobbles + kerb + rolling
  },
  colour(x, z) {
    const road = onAvenue(x, z)
    const edge = Math.abs(Math.abs(x) - AVENUE.halfWidth - 1)
    const c = GRAVEL.clone().lerp(LAWN, ramp(Math.abs(x), 30, 60))
    if (edge < 1.2) c.lerp(KERB, 0.8)
    return c.lerp(PAVE.clone().lerp(PAVE2, fbm(x * 0.9, z * 0.9, 1) * 0.5 + 0.5), road)
  },
  drag: (x, z) => 0.02 + 0.05 * (1 - onAvenue(x, z)),
  sky: '#c7ccd2',
  haze: '#d8dbdd',
  fog: [160, 1400],
}
