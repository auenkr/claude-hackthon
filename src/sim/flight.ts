import * as THREE from 'three'

/**
 * Shared flight mechanics.
 *
 * Both aeroplanes in the collection are flown the same way: forces are built
 * in the wind axes from angle of attack and dynamic pressure, and attitude is
 * integrated as body rates so there is no gimbal to fall into. The difference
 * between a 1903 Flyer and a 1944 Mustang is entirely in the coefficients.
 */

export const RHO = 1.225 // kg/m³, sea level
export const G = 9.80665

const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)
const spin = new THREE.Quaternion()

/** Body axes in world space: forward, up, starboard. */
export function bodyAxes(
  q: THREE.Quaternion,
  forward: THREE.Vector3,
  up: THREE.Vector3,
  right: THREE.Vector3,
) {
  forward.copy(Z).applyQuaternion(q)
  up.copy(Y).applyQuaternion(q)
  right.copy(X).applyQuaternion(q)
}

/**
 * Turn the airframe at the given rates, in the pilot's sense: pitch up, nose
 * right, right wing down — all positive. The model's own axes put forward at
 * +Z, which is why two of the three come out negative.
 */
export function rotateBody(
  q: THREE.Quaternion,
  pitchRate: number,
  yawRate: number,
  rollRate: number,
  dt: number,
) {
  q.multiply(spin.setFromAxisAngle(X, -pitchRate * dt))
  q.multiply(spin.setFromAxisAngle(Y, yawRate * dt))
  q.multiply(spin.setFromAxisAngle(Z, -rollRate * dt))
  q.normalize()
}

export interface Attitude {
  /** Nose above the horizon, radians. */
  pitch: number
  /** Right wing down, radians. */
  bank: number
  /** Radians clockwise from +Z. */
  heading: number
}

const f = new THREE.Vector3()
const u = new THREE.Vector3()
const r = new THREE.Vector3()

export function attitude(q: THREE.Quaternion, out: Attitude) {
  bodyAxes(q, f, u, r)
  out.pitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1))
  out.heading = Math.atan2(f.x, f.z)
  out.bank = Math.atan2(-r.y, u.y)
  return out
}

const euler = new THREE.Euler(0, 0, 0, 'YXZ')

/** Set the quaternion from a pilot-sense attitude. */
export function setAttitude(
  q: THREE.Quaternion,
  pitch: number,
  yaw: number,
  bank: number,
) {
  euler.set(-pitch, yaw, -bank, 'YXZ')
  return q.setFromEuler(euler)
}

export interface Airflow {
  /** True airspeed, m/s. */
  V: number
  /** Dynamic pressure, Pa. */
  qbar: number
  /** Angle of attack, radians: nose above the flight path. */
  alpha: number
  /** Sideslip, radians: air coming from starboard is positive. */
  beta: number
}

const rel = new THREE.Vector3()

/**
 * Resolve the airflow, and fill in the unit vectors that lift and drag act
 * along. `wind` is the air's own velocity in world space.
 */
export function airflow(
  velocity: THREE.Vector3,
  wind: THREE.Vector3,
  q: THREE.Quaternion,
  out: Airflow,
  liftDir: THREE.Vector3,
  dragDir: THREE.Vector3,
) {
  bodyAxes(q, f, u, r)
  rel.copy(velocity).sub(wind)
  const V = rel.length()
  out.V = V
  out.qbar = 0.5 * RHO * V * V

  if (V < 0.05) {
    out.alpha = 0
    out.beta = 0
    liftDir.copy(u)
    dragDir.copy(f).negate()
    return out
  }

  out.alpha = Math.atan2(-rel.dot(u), rel.dot(f))
  out.beta = Math.asin(THREE.MathUtils.clamp(rel.dot(r) / V, -1, 1))

  // Drag opposes the relative wind; lift is square to it, edge-on to the wing.
  dragDir.copy(rel).multiplyScalar(-1 / V)
  liftDir.crossVectors(rel, r)
  const m = liftDir.length()
  if (m > 1e-6) liftDir.multiplyScalar(1 / m)
  else liftDir.copy(u)
  return out
}

/**
 * Lift coefficient with a rounded stall: past the break the wing keeps some
 * lift but loses it as the nose comes further up, which is what makes a
 * stalled aeroplane sink rather than stop.
 */
export function liftCoefficient(
  alpha: number,
  slope: number,
  alphaZero: number,
  clMax: number,
) {
  const linear = slope * (alpha - alphaZero)
  if (Math.abs(linear) <= clMax) return linear
  const over = Math.abs(linear) - clMax
  const sign = linear < 0 ? -1 : 1
  return sign * Math.max(clMax * 0.45, clMax - over * 0.55)
}

/** Stall margin, 0 = flying, 1 = fully stalled. */
export function stallFraction(alpha: number, slope: number, alphaZero: number, clMax: number) {
  const linear = slope * (alpha - alphaZero)
  return THREE.MathUtils.clamp((Math.abs(linear) - clMax) / (clMax * 0.35) + 0.0, 0, 1)
}
