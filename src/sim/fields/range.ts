import * as THREE from 'three'
import { clamp01, fbm, ramp, type Field } from '../terrain'

/**
 * The gunnery range at Kubinka: open steppe, a ridge at your back, a stream
 * bed across the middle distance and one hollow deep enough to hide a target
 * from a gun that will only depress five degrees.
 *
 * A range is chosen for its sight lines, so the ground has to be open enough
 * to see a hulk a kilometre away — with just enough in the way that choosing
 * a firing position is worth doing.
 */

const STEPPE = new THREE.Color('#8b8a5e')
const MUD = new THREE.Color('#6d5f47')
const SILT = new THREE.Color('#7d7358')
const SNOW = new THREE.Color('#d8d8d2')

/** The stream wanders; the bridge crosses it at x ≈ 4. */
const streamZ = (x: number) => 524 + Math.sin(x * 0.006) * 26

/** How far into the stream bed a point is, 0–1. */
function bed(x: number, z: number) {
  const d = (z - streamZ(x)) / 30
  return Math.exp(-d * d)
}

export const range: Field = {
  height(x, z) {
    const hills = fbm(x * 0.0022, z * 0.0022, 2) * 3.4 + fbm(x * 0.012, z * 0.012, 2) * 0.4
    const ridge = 7 * ramp(-z, 240, 460)
    // A low bank at 700 m that a commander would use to fight hull down.
    const bank = 2.6 * Math.exp(-(((z - 700) / 70) ** 2)) * (0.6 + 0.4 * fbm(x * 0.004, 0, 1))
    // The stream bed: shallow enough to drive through, deep enough that the
    // bridge is worth having.
    const gully = -3.2 * bed(x, z)
    // The hollow on the left flank, below the gun's five degrees of
    // depression unless you drive down to meet it.
    const dx = (x - 210) / 90
    const dz = (z - 900) / 90
    const hollow = -9 * Math.exp(-(dx * dx + dz * dz))
    return hills + ridge + bank + gully + hollow
  },
  colour(x, z, h) {
    const c = STEPPE.clone().lerp(MUD, clamp01(0.35 + fbm(x * 0.03, z * 0.03, 2)))
    // Wet silt along the stream, which is also where the going is soft.
    c.lerp(SILT, bed(x, z) * 0.75)
    if (h > 9) c.lerp(SNOW, ramp(h, 9, 18) * 0.5)
    return c
  },
  /** Firm steppe, soft in the stream bed: the driver can feel the difference. */
  drag: (x, z) => 0.05 + 0.075 * bed(x, z),
  sky: '#aebac6',
  haze: '#c8cdd0',
  fog: [300, 2200],
}
