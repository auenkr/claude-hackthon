import * as THREE from 'three'
import { fbm, hash, ramp, type Field } from '../terrain'

/**
 * Kill Devil Hills.
 *
 * Sand flats north of the big dune, which is where they actually laid the
 * rail: the hill is behind you, the flat runs north, and the sea is east.
 *
 * The flat is not flat. A steady onshore wind combs loose sand into ripples
 * a few centimetres deep, running square across it — which is why the rail
 * had to be shimmed level board by board, and why the machine rides over a
 * faint washboard on the way out.
 */

const SAND = new THREE.Color('#d9cbab')
const SCRUB = new THREE.Color('#9aa075')
const WET = new THREE.Color('#b0ab93')
const DAMP = new THREE.Color('#8f8a78')

/** Wavelength and depth of the wind ripples, in metres. */
export const RIPPLE_WAVE = 2.9
export const RIPPLE_DEPTH = 0.035

export const killDevil: Field = {
  height(x, z) {
    // The flat itself: barely anything, but not a billiard table.
    const flat = fbm(x * 0.012, z * 0.012, 3) * 0.55
    const drift = fbm(x * 0.09, z * 0.09, 2) * 0.07
    // Wind ripples, square to a northerly. The phase wanders with the drift
    // so they are not a drawn grating.
    const ripple =
      RIPPLE_DEPTH *
      Math.sin((z / RIPPLE_WAVE) * Math.PI * 2 + fbm(x * 0.04, z * 0.01, 2) * 3)
    // Big Kill Devil Hill, rising behind the launch point.
    const hill = 31 * ramp(-z, 90, 420) * (1 - 0.45 * ramp(Math.abs(x), 150, 620))
    // The beach falls away to the east, and the sea is in sight of the rail.
    const beach = -3.4 * ramp(x, 235, 470)
    return flat + drift + ripple + hill + beach
  },
  colour(x, z, h) {
    const c = SAND.clone()
    if (h > 3) c.lerp(SCRUB, ramp(h, 3, 16) * 0.55)
    // Damp sand below the high-water mark, and the tide line itself.
    if (x > 300) c.lerp(WET, ramp(x, 300, 400))
    if (x > 380) c.lerp(DAMP, ramp(x, 380, 430))
    return c.multiplyScalar(0.94 + 0.12 * hash(Math.floor(x), Math.floor(z)))
  },
  drag: () => 0.09,
  sky: '#cfd9e4',
  haze: '#dfe4e6',
  fog: [220, 1500],
}

/** Mean sea level, so the surf and the beach agree about where the water is. */
export const SEA_LEVEL = -1.6
