/**
 * Where the machines touch the ground.
 *
 * A tail-dragger's resting attitude is not a styling choice: it is whatever
 * pitch puts both main wheels and the tailwheel down at once. These contact
 * points are read off the undercarriage geometry in P51.tsx, and the
 * simulator needs them as well as the exhibit does.
 */

const DEG = Math.PI / 180

/** Tyre contact points in body coordinates, metres. */
export const P51_CONTACT = {
  main: { x: 1.805, y: -1.605, z: 0.51 },
  tail: { y: -0.779, z: -3.82 },
}

/** Three-point attitude, and the height of the datum when parked. */
export const P51_STANCE = { pitch: 12.8 * DEG, rise: 1.624 }

/**
 * How high the datum must ride for the lowest wheel to just touch, at an
 * arbitrary pitch. Used during the takeoff rotation, when the tail comes up
 * and the aeroplane pivots about the main wheels.
 */
export function p51GroundRise(pitch: number) {
  const c = Math.cos(pitch)
  const s = Math.sin(pitch)
  const main = P51_CONTACT.main.y * c + P51_CONTACT.main.z * s
  const tail = P51_CONTACT.tail.y * c + P51_CONTACT.tail.z * s
  return -Math.min(main, tail)
}

/**
 * The same thing for the main wheels alone. In the air this is the surface
 * that matters: an aeroplane rotating nose-up pivots about its main wheels
 * and the tail swings down behind, so including the tailwheel would have
 * every takeoff register a collision with the runway it had just left.
 */
export function p51MainRise(pitch: number) {
  return -(
    P51_CONTACT.main.y * Math.cos(pitch) +
    P51_CONTACT.main.z * Math.sin(pitch)
  )
}

/** Height of the Flyer's skid runners below its datum: its parked height. */
export const FLYER_SKID = 0.11
