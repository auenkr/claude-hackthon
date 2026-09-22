import * as THREE from 'three'
import type { Controls, Dimension, Source } from '../types'
import type { Keyboard } from './keyboard'
import type { Readout, Sim, SimDef, ViewName } from './types'
import { G, RHO } from './flight'
import { Effects } from './fx'
import { Obstacles } from './obstacles'
import {
  circuit as field,
  nearestOnTrack,
  START_INDEX,
  TRACK,
  TRACK_LENGTH,
  TRACK_LINE,
  type Nearest,
} from './fields/circuit'
import { furnish, KINDS } from './lotus49/furniture'
import {
  CG_H,
  DEG,
  EXHAUST_TIPS,
  EYE,
  FRONT_X,
  FRONT_Z,
  LOCK,
  REAR_SHARE,
  REAR_X,
  REAR_Z,
  RPM_IDLE,
  RPM_LIMIT,
  RPM_PEAK,
  WHEELBASE,
} from '../three/lotus49/dims'

/**
 * Three laps, Zandvoort 1967.
 *
 * Two facts about the 49 do most of the work. The DFV makes almost nothing
 * below six thousand and everything above eight, so the gear you are in
 * matters more than how hard you press. And the car weighs five hundred kilos
 * on tyres narrower than a modern road car's: there is very little grip, and
 * what there is has to be shared — between turning and accelerating, and
 * between a front axle that is lightly loaded and a rear that carries the
 * engine. Brake into a corner and the front bites; stand on the throttle
 * out of it and the rear steps sideways. That is the whole character of the
 * car, and it is what the two-axle tyre model below is for.
 */

const REGS: Source = {
  kind: 'text',
  citation: 'FIA Appendix J, 1967: 3-litre formula, 500 kg minimum',
}
const COSWORTH: Source = {
  kind: 'text',
  citation: 'Cosworth Engineering, DFV technical description, 1967',
}
const NYE: Source = {
  kind: 'text',
  citation: 'Nye, D., Twice Lucky: Chapman, Clark, Hill and the Lotus 49 (2012)',
}
const INFER: Source = {
  kind: 'inference',
  citation: 'Derived for this simulation from the cited mass, power and geometry',
}

// --- Car ------------------------------------------------------------------
const MASS = 590 // kg: the 506 kg car with driver and fuel for three laps
const P_MAX = 304_000 // W — 408 hp
/** Frontal drag area without a wing: open wheels and a driver in the wind. */
const CDA = 0.92 // m²
/** The 49B's strutted rear wing. Effective, and unsprung. */
const WING_CLA = 1.15 // m²
const WING_CDA = 0.28 // m²
const BRAKE_G = 1.15
/** Front brake bias, as the 49 was set up: the weight is forward when it matters. */
const BRAKE_BIAS = 0.64
const MU_TARMAC = 1.3
const MU_KERB = 1.05
const MU_GRASS = 0.55
/** Road speed at the 9,000 rpm peak in each of the ZF's five gears. */
const GEAR_TOP = [85, 125, 170, 220, 292].map((k) => k / 3.6)
const SHIFT_TIME = 0.22 // s of no drive while the dog rings engage
const LAPS = 3
const MAX_OFFS = 8
/** Body slip past which the car is going round rather than through. */
const SPIN_ANGLE = 38 * DEG
/** An impact above this, into something solid, ends the run. */
const WRECK_SPEED = 15 // m/s, about 55 km/h

/** The DFV's power curve: almost nothing low down, everything at the top. */
function powerCurve(rpm: number) {
  const r = rpm / RPM_PEAK
  if (r <= 1) return 0.18 + 0.82 * r ** 2.2
  return Math.max(0, 1 - (r - 1) * 4)
}

function spring(value: number, input: number, dt: number, rate: number, centre: number) {
  if (input === 0) {
    const back = centre * dt
    return Math.abs(value) <= back ? 0 : value - Math.sign(value) * back
  }
  return THREE.MathUtils.clamp(value + input * rate * dt, -1, 1)
}

function lapTime(t: number) {
  if (!Number.isFinite(t)) return '—'
  const m = Math.floor(t / 60)
  const s = t - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

const euler = new THREE.Euler(0, 0, 0, 'YXZ')
const scratch = new THREE.Vector3()
const push = new THREE.Vector3()
const probe = new THREE.Vector3()
const puffVel = new THREE.Vector3()

export class Lotus49Sim implements Sim {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()
  readonly fx = new Effects(700)
  readonly obstacles = new Obstacles()
  showModel = true

  /** Where the nose points. Always `course + beta`. */
  private heading = 0
  /** Where the car is going: the direction of its velocity. */
  private course = 0
  private pitch = 0
  private bank = 0
  /** Body slip: the angle between where the nose points and where the car goes. */
  private beta = 0
  private speed = 0
  private accel = 0
  private throttle = 0
  private brakes = 0
  private steer = 0
  private delta = 0
  private gear = 1
  private rpm = RPM_IDLE
  private shift = 0
  private wing = 0

  private lateral = 0
  private frontUse = 0
  private rearUse = 0
  private rearLateral = 0
  private understeer = false
  private oversteer = false
  private spinning = false
  private lockedFront = false
  private spun = false
  private off = false
  private offs = 0
  private damage = 0
  private pops = 0
  private smokeDue = 0
  private dustDue = 0
  private bumpCool = 0

  private clock = 0
  private distance = 0
  private lastS = 0
  private laps = 0
  private lapStart = 0
  private lastLap = Infinity
  private bestLap = Infinity

  private forward = new THREE.Vector3()
  private travel = new THREE.Vector3()
  private near: Nearest = { dist: 0, s: 0, index: 0 }
  private log: string[] = []
  private verdict: Readout['verdict']
  private ctl: Controls = {}

  finished = false

  constructor() {
    furnish(this.obstacles)
    for (const o of this.obstacles.list) o.data.hp0 = o.hp
    this.fx.ground = (x, z) => field.height(x, z)
    this.reset()
  }

  reset() {
    const start = TRACK_LINE[START_INDEX]
    this.heading = Math.atan2(start.tx, start.tz)
    this.course = this.heading
    this.pitch = 0
    this.bank = 0
    this.beta = 0
    this.speed = 0
    this.accel = 0
    this.throttle = 0
    this.brakes = 0
    this.steer = 0
    this.delta = 0
    this.gear = 1
    this.rpm = RPM_IDLE
    this.shift = 0
    this.wing = 0
    this.lateral = 0
    this.frontUse = 0
    this.rearUse = 0
    this.rearLateral = 0
    this.understeer = false
    this.oversteer = false
    this.spinning = false
    this.lockedFront = false
    this.spun = false
    this.off = false
    this.offs = 0
    this.damage = 0
    this.pops = 0
    this.smokeDue = 0
    this.dustDue = 0
    this.bumpCool = 0
    this.clock = 0
    this.distance = 0
    this.lastS = start.s
    this.laps = 0
    this.lapStart = 0
    this.lastLap = Infinity
    this.bestLap = Infinity
    this.showModel = true
    this.position.set(start.x, field.height(start.x, start.z), start.z)
    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.travel.copy(this.forward)
    this.quaternion.setFromEuler(euler.set(0, this.heading, 0, 'YXZ'))
    this.fx.reset()
    // The furniture is built once and revived, so the scene's meshes keep
    // their places across a restart.
    for (const o of this.obstacles.list) {
      o.dead = false
      o.deadFor = 0
      o.hp = o.data.hp0
    }
    this.verdict = undefined
    this.finished = false
    this.log = [
      'Three laps. First gear, engine idling, no wing fitted.',
      'The DFV does nothing below six thousand — keep it in the band.',
    ]
  }

  private say(line: string) {
    this.log.push(line)
    if (this.log.length > 6) this.log.shift()
  }

  // --- Frame ----------------------------------------------------------------

  step(dt: number, keys: Keyboard) {
    this.clock += dt
    this.bumpCool = Math.max(0, this.bumpCool - dt)

    if (!this.finished || this.speed > 0.1) {
      this.drive(dt, keys)
      this.tyres(dt)
      this.conform(dt)
      this.collide()
      this.smoke(dt)
      this.timing()
    }

    this.obstacles.step(dt)
    this.fx.step(dt)
  }

  /** Pedals, wheel, lever. */
  private drive(dt: number, keys: Keyboard) {
    const gas = !this.finished && keys.down('KeyW') ? 1 : 0
    const pedal = this.finished || keys.down('KeyS') ? 1 : 0
    this.throttle = THREE.MathUtils.clamp(this.throttle + (gas ? dt * 3.5 : -dt * 5), 0, 1)
    this.brakes = THREE.MathUtils.clamp(this.brakes + (pedal ? dt * 4 : -dt * 6), 0, 1)
    this.steer = spring(this.steer, keys.axis(['ArrowRight'], ['ArrowLeft']), dt, 2.6, 4.5)

    if (this.shift <= 0 && !this.finished) {
      if (keys.tapped('ArrowUp') && this.gear < 5) {
        this.gear++
        this.shift = SHIFT_TIME
        if (this.rpm > 6500) this.pop()
      } else if (keys.tapped('ArrowDown') && this.gear > 1) {
        this.gear--
        this.shift = SHIFT_TIME
        this.pop()
      }
    }
    this.shift = Math.max(0, this.shift - dt)

    if (keys.tapped('KeyG') && !this.finished) {
      this.wing = this.wing ? 0 : 1
      this.say(
        this.wing
          ? 'Wing fitted. More grip at speed, and a little less of it.'
          : 'Wing off. Zandvoort 1967 specification.',
      )
    }
  }

  /**
   * The tyre model. Two axles, each with a friction circle, each loaded by
   * what the car is doing: braking throws weight forward and the rear goes
   * light; power throws it back and the front goes light. Whichever axle
   * runs out first decides whether the car understeers or oversteers.
   */
  private tyres(dt: number) {
    nearestOnTrack(this.position.x, this.position.z, this.near)
    const onTarmac = this.near.dist <= TRACK.halfWidth
    const onKerb = !onTarmac && this.near.dist <= TRACK.halfWidth + TRACK.kerb
    const mu = onTarmac ? MU_TARMAC : onKerb ? MU_KERB : MU_GRASS
    if (!onTarmac && !onKerb) {
      if (!this.off) {
        this.off = true
        this.offs++
        if (!this.finished) this.say(`Off the circuit — ${this.offs} of ${MAX_OFFS} allowed.`)
      }
    } else if (onTarmac) {
      this.off = false
    }

    const v = this.speed
    const q = 0.5 * RHO * v * v
    const downforce = this.wing * q * WING_CLA

    // --- Axle loads, with last frame's acceleration moving the weight ------
    const transfer = (MASS * this.accel * CG_H) / WHEELBASE
    const Ff = Math.max(0.15 * MASS * G, MASS * G * (1 - REAR_SHARE) - transfer + downforce * 0.25)
    const Fr = Math.max(0.15 * MASS * G, MASS * G * REAR_SHARE + transfer + downforce * 0.75)
    const capF = mu * Ff
    const capR = mu * Fr

    // --- Engine ------------------------------------------------------------
    this.rpm = Math.max(RPM_IDLE, (v / GEAR_TOP[this.gear - 1]) * RPM_PEAK)
    const limiter = this.rpm >= RPM_LIMIT
    const power = this.shift > 0 || limiter ? 0 : P_MAX * powerCurve(this.rpm) * this.throttle
    let drive = power / Math.max(v, 3)

    // --- What the driver is asking of the front --------------------------
    // The rack gives 25° of lock. The driver's hands give only what the tyres
    // can use: nobody can feel the slip peak through a keyboard, so the wheel
    // is modelled as saturating a little past it rather than winding on to
    // the stop — which at 150 km/h would spin the car on the spot.
    const ayMax = (capF + capR) / MASS
    const usable = v > 1 ? Math.atan((1.35 * ayMax * WHEELBASE) / (v * v)) : LOCK
    this.delta = this.steer * Math.min(LOCK, usable)
    const ayWant = (v * v * Math.tan(this.delta)) / WHEELBASE
    const FyWant = MASS * Math.abs(ayWant)

    // Lateral force is shared by the axles in proportion to the weight they
    // carry, which is how a single-track car balances its moments.
    const needF = FyWant * (1 - REAR_SHARE)
    const needR = FyWant * REAR_SHARE

    // --- Brakes, split front and rear, each capped by its own axle --------
    // The pedal has the same driver behind it as the wheel: a foot can feel
    // a front about to lock and eases off, so with the car turning hard the
    // pedal is modelled as saturating a little past what the fronts can
    // spare rather than stamping straight through them.
    const demand = this.brakes * BRAKE_G * MASS * G
    const turning = Math.min(1, needF / Math.max(capF, 1))
    const footF = capF * Math.sqrt(Math.max(0.08, 1 - turning * turning)) * 1.12
    const wantF = Math.min(demand * BRAKE_BIAS, footF)
    // The rear goes light under braking; the same foot keeps it from locking.
    const turningR = Math.min(1, needR / Math.max(capR, 1))
    const footR = capR * Math.sqrt(Math.max(0.08, 1 - turningR * turningR)) * 0.95
    const wantR = Math.min(demand * (1 - BRAKE_BIAS), footR)
    this.lockedFront = wantF > capF
    const brakeF = this.lockedFront ? capF * 0.85 : wantF
    const brakeR = Math.min(wantR, capR * 0.95)

    // Front: whatever braking has not used is left for turning. A locked
    // wheel steers hardly at all.
    let spareF = Math.sqrt(Math.max(0, capF * capF - brakeF * brakeF))
    if (this.lockedFront) spareF *= 0.4
    // Rear: drive and braking both take from the same circle, and last
    // frame's cornering has already taken its share. Past the limit the
    // tyre spins up: it passes a little less forward and, the further past
    // the peak it is, progressively less to the side — power oversteer.
    const capDrive = Math.sqrt(Math.max(0, capR * capR - this.rearLateral * this.rearLateral))
    const excess = drive / Math.max(capDrive, 1)
    this.spinning = excess > 1 && this.throttle > 0.1 && v < 70
    let sideFactor = 1
    if (this.spinning) {
      drive = capDrive * 0.9
      sideFactor = THREE.MathUtils.clamp(1 / excess ** 0.7, 0.55, 1)
    }
    const longR = Math.max(drive, brakeR)
    const spareR = Math.sqrt(Math.max(0, capR * capR - longR * longR)) * sideFactor

    const ratioF = needF / Math.max(spareF, 1)
    const ratioR = needR / Math.max(spareR, 1)
    // Tyres saturate gently: past the peak, more slip buys nothing but smoke.
    const FyF = spareF * Math.tanh(ratioF)
    const FyR = spareR * Math.tanh(ratioR)
    this.frontUse = Math.min(1.5, ratioF)
    this.rearUse = Math.min(1.5, ratioR)
    this.rearLateral = FyR

    const sign = Math.sign(ayWant) || 1
    const ay = (sign * (FyF + FyR)) / MASS
    this.lateral = ay

    // --- Yaw: the lateral force bends the path; the tail comes round only
    // when the rear delivers less than its share of the moment balance ------
    // The tyres' side force rotates the velocity — the course the car is
    // actually on. Front force acts ahead of the centre of mass, rear force
    // behind it, and in a balanced corner the two moments cancel. Take grip
    // from the rear — with power, or by braking with the weight forward —
    // and the front wins: the nose turns in past the course, and the body
    // slips sideways. The nose always points `beta` ahead of the course.
    if (v > 0.3) this.course += (ay / v) * dt
    const a = WHEELBASE * REAR_SHARE
    const b = WHEELBASE * (1 - REAR_SHARE)
    const imbalance = FyF * a - FyR * b
    const betaTarget =
      imbalance > 0 && v > 3
        ? sign * THREE.MathUtils.clamp((imbalance / (MASS * G * WHEELBASE)) * 3, 0, 1.2)
        : 0
    this.beta += (betaTarget - this.beta) * Math.min(1, 3 * dt)
    this.understeer = ratioF > 1.15 && Math.abs(betaTarget) < 6 * DEG && v > 3
    this.oversteer = Math.abs(betaTarget) >= 6 * DEG
    if (Math.abs(this.beta) > SPIN_ANGLE && !this.spun && v > 6) {
      this.spun = true
      this.say('Spun. The DFV does not forgive a heavy right foot.')
    }
    if (Math.abs(this.beta) < 5 * DEG) this.spun = false
    this.beta = THREE.MathUtils.clamp(this.beta, -Math.PI / 2, Math.PI / 2)
    this.heading = this.course + this.beta

    // --- Longitudinal ------------------------------------------------------
    const aero = q * (CDA + this.wing * WING_CDA)
    const rolling = MASS * G * field.drag(this.position.x, this.position.z)
    const engineBrake = this.throttle < 0.05 ? 0.012 * MASS * G * (this.rpm / RPM_PEAK) : 0
    // Scrub: a sliding tyre and a sideways car both throw speed away.
    const slide = Math.max(0, ratioF - 1) + Math.max(0, ratioR - 1)
    const scrub = (0.12 * Math.min(2, slide) + 0.9 * Math.abs(Math.sin(this.beta))) * MASS * G

    let force = drive
    if (v > 0.05) force -= aero + rolling + brakeF + brakeR + engineBrake + scrub
    this.accel = force / MASS
    this.speed = Math.max(0, v + this.accel * dt)
    if (this.throttle < 0.05 && this.speed < 0.15) {
      this.speed = 0
      this.accel = 0
    }

    // --- Position: the car travels where it is going, not where it points --
    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.travel.set(Math.sin(this.course), 0, Math.cos(this.course))
    this.position.addScaledVector(this.travel, this.speed * dt)
  }

  /** Sit the car on the ground at all four wheels. Racing springs, so stiff. */
  private conform(dt: number) {
    const s = Math.sin(this.heading)
    const c = Math.cos(this.heading)
    const sample = (dz: number, dx: number) =>
      field.height(this.position.x + dz * s + dx * c, this.position.z + dz * c - dx * s)
    const fl = sample(FRONT_Z, -FRONT_X)
    const fr = sample(FRONT_Z, FRONT_X)
    const rl = sample(REAR_Z, -REAR_X)
    const rr = sample(REAR_Z, REAR_X)

    const height = (fl + fr + rl + rr) / 4
    const pitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, WHEELBASE)
    const bank = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, FRONT_X + REAR_X)

    const k = 1 - Math.exp(-10 * dt)
    this.position.y += (height - this.position.y) * k
    this.pitch += (pitch - this.pitch) * k
    // A little roll into the corner, the way a car on soft 1967 springs did.
    const roll = (this.lateral / G) * 2.2 * DEG
    this.bank += (bank + roll - this.bank) * k

    euler.set(-this.pitch, this.heading, -this.bank, 'YXZ')
    this.quaternion.setFromEuler(euler)
  }

  /**
   * Five hundred kilos against the scenery. A marker board is flattened; a
   * tyre wall takes half the speed and gives half back; Armco takes nearly
   * all of it, and enough of it at once is the end of the run.
   */
  private collide() {
    for (const dz of [2.1, 0.6, -1.0, -1.75]) {
      probe.copy(this.position).addScaledVector(this.forward, dz)
      probe.y = field.height(probe.x, probe.z) + 0.35
      const h = this.obstacles.hit(probe, 0.72)
      if (!h) continue
      const o = h.obstacle
      const k = KINDS[o.kind]

      if (k.solidity < 0.2) {
        if (!o.dead) {
          this.obstacles.damage(o, 99)
          o.data.fall = Math.atan2(this.travel.x, this.travel.z)
          this.fx.impact(h.point, 0.4, '#d9d6cc')
          if (this.bumpCool <= 0) {
            this.bumpCool = 1.5
            this.say(`Took out a ${k.label}.`)
          }
        }
        this.speed *= 0.995
        continue
      }

      // Push clear along the shortest way out, in the horizontal plane.
      push.subVectors(probe, h.point)
      push.y = 0
      const out = push.length()
      if (out > 1e-4) this.position.addScaledVector(push, h.distance / out)

      scratch.subVectors(h.point, this.position).setY(0)
      if (scratch.lengthSq() < 1e-6) continue
      scratch.normalize()
      const closing = this.travel.dot(scratch)
      if (closing <= 0.05) continue

      const impact = this.speed * closing
      // The car keeps what the barrier does not take, deflected along it.
      this.speed *= 1 - k.solidity * Math.min(1, closing + 0.3)
      this.course += (Math.random() - 0.5) * 0.35 * Math.min(1, impact / 10)
      this.beta *= 0.3
      this.heading = this.course + this.beta
      if (impact < 1.5) continue

      this.damage = Math.min(1, this.damage + (impact * k.solidity) / 40)
      this.fx.impact(h.point, 0.5 + impact * 0.06, '#b8b4aa')
      for (let i = 0; i < 6; i++) {
        puffVel.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6)
        this.fx.emit('spark', h.point, { vel: puffVel, life: 0.3, size: 0.12, colour: '#ffe2a0', gravity: -9, drag: 1.5 })
      }
      if (k.solidity > 0.6) {
        for (let i = 0; i < 3; i++) {
          puffVel.set((Math.random() - 0.5) * 5, 3 + Math.random() * 3, (Math.random() - 0.5) * 5)
          this.fx.emit('debris', h.point, { vel: puffVel, life: 2, size: 0.12, colour: '#1c472c', gravity: -9.8, spin: 8, bounce: true })
        }
      }

      if ((impact > WRECK_SPEED && k.solidity > 0.6) || this.damage >= 1) {
        this.wreck(h.point, impact, k.label)
        return
      }
      if (this.bumpCool <= 0) {
        this.bumpCool = 1.8
        this.say(`Into the ${k.label} at ${(impact * 3.6).toFixed(0)} km/h. ${this.damage > 0.5 ? 'The tub is bent.' : 'Bodywork.'}`)
      }
    }
  }

  private wreck(at: THREE.Vector3, impact: number, what: string) {
    this.speed = 0
    this.accel = 0
    this.showModel = false
    this.fx.explosion(this.position, 1.6, { debris: 14, fire: 1 })
    this.fx.ignite(this.position, 1.1, 45)
    this.fx.impact(at, 1.2, '#b8b4aa')
    this.end(false, `Into the ${what}`, [
      `${(impact * 3.6).toFixed(0)} km/h into the ${what} on lap ${Math.min(LAPS, this.laps + 1)}.`,
      'No seat belts, no fuel cells to speak of, and the tank is beside your hip. R puts a fresh car on the grid.',
    ])
  }

  /** Smoke from the tyres, dust from the grass, flame from the megaphones. */
  private smoke(dt: number) {
    const v = this.speed
    if (!this.showModel) return

    // --- Tyre smoke where the rubber is sliding ---------------------------
    const slideF = Math.max(0, this.frontUse - 1)
    const slideR = Math.max(0, this.rearUse - 1) + (this.spinning ? 0.6 : 0) + Math.abs(Math.sin(this.beta)) * 1.5
    const onTarmac = this.near.dist <= TRACK.halfWidth + TRACK.kerb
    if (onTarmac && v > 3 && slideF + slideR > 0.05) {
      this.smokeDue += dt * (12 + 40 * Math.min(1.5, slideF + slideR))
      while (this.smokeDue >= 1) {
        this.smokeDue -= 1
        const rear = Math.random() < slideR / Math.max(0.01, slideF + slideR)
        const side = Math.random() < 0.5 ? 1 : -1
        this.wheelPoint(rear, side, scratch)
        puffVel.copy(this.travel).multiplyScalar(-v * 0.15)
        puffVel.y = 0.6 + Math.random() * 0.8
        puffVel.x += (Math.random() - 0.5) * 1.2
        puffVel.z += (Math.random() - 0.5) * 1.2
        this.fx.puff(scratch, puffVel, 0.25 + Math.random() * 0.25, '#cfcbc3', 1.1 + Math.random() * 0.7)
      }
    }

    // --- Dust and turf off the grass --------------------------------------
    if (!onTarmac && v > 3) {
      this.dustDue += dt * (6 + v * 0.5)
      while (this.dustDue >= 1) {
        this.dustDue -= 1
        const side = Math.random() < 0.5 ? 1 : -1
        this.wheelPoint(Math.random() < 0.7, side, scratch)
        puffVel.copy(this.travel).multiplyScalar(-v * 0.25)
        puffVel.y = 1.2 + Math.random() * 1.5
        puffVel.x += (Math.random() - 0.5) * 2
        puffVel.z += (Math.random() - 0.5) * 2
        const c = field.colour(scratch.x, scratch.z, scratch.y)
        this.fx.emit('dust', scratch, {
          vel: puffVel,
          life: 0.8 + Math.random(),
          size: 0.3 + Math.random() * 0.3,
          grow: 2.4,
          colour: c,
          fade: field.haze,
          drag: 1.6,
          gravity: -1.5,
        })
      }
    }

    // --- The overrun: lift off high in the revs and the megaphones spit ----
    if (this.throttle < 0.1 && this.rpm > 6800 && Math.random() < dt * 9) this.pop()
  }

  /** A frame of flame at both megaphones, for the scene and the model alike. */
  private pop() {
    this.pops++
    for (const tip of EXHAUST_TIPS) {
      scratch.set(tip[0], tip[1], tip[2] - 0.1).applyQuaternion(this.quaternion).add(this.position)
      puffVel.copy(this.forward).multiplyScalar(-4 + this.speed * 0.5)
      puffVel.y += 0.4
      this.fx.emit('fire', scratch, {
        vel: puffVel,
        life: 0.07 + Math.random() * 0.05,
        size: 0.14,
        grow: 1.8,
        colour: '#ffd27a',
        fade: '#ff5a12',
        drag: 2,
      })
    }
  }

  /** World position of a tyre's contact patch. */
  private wheelPoint(rear: boolean, side: number, out: THREE.Vector3) {
    out.set(side * (rear ? REAR_X : FRONT_X), 0.03, rear ? REAR_Z : FRONT_Z)
    return out.applyQuaternion(this.quaternion).add(this.position)
  }

  private timing() {
    let ds = this.near.s - this.lastS
    if (ds > TRACK_LENGTH / 2) ds -= TRACK_LENGTH
    if (ds < -TRACK_LENGTH / 2) ds += TRACK_LENGTH
    this.distance += ds
    this.lastS = this.near.s

    if (this.finished) return
    const done = Math.floor(this.distance / TRACK_LENGTH)
    if (done > this.laps) {
      const t = this.clock - this.lapStart
      this.lastLap = t
      this.bestLap = Math.min(this.bestLap, t)
      this.lapStart = this.clock
      this.laps = done
      this.say(`Lap ${done} — ${lapTime(t)}.`)
      if (this.laps >= LAPS) {
        this.end(true, 'Three laps', [
          `Best lap ${lapTime(this.bestLap)}, ${this.offs} excursion${this.offs === 1 ? '' : 's'}${this.damage > 0.2 ? ', and the bodywork shows it' : ''}.`,
          this.offs === 0 && this.damage < 0.1
            ? 'Clean. Clark won here first time out, and so would you have.'
            : this.offs <= 3
              ? 'Tidy enough. The DFV forgives a missed apex; the grass does not.'
              : 'Finished, but the marshals have your number.',
        ])
      }
    }
    if (this.offs > MAX_OFFS) {
      this.end(false, 'Into the dunes', [
        `${this.laps} of three laps, ${this.offs} times off the circuit.`,
        'Five hundred kilos and no downforce: brake earlier than you think.',
      ])
    }
  }

  private end(good: boolean, title: string, lines: string[]) {
    this.verdict = { good, title, lines }
    this.finished = true
  }

  // --- What the rest of the museum reads ------------------------------------

  controls() {
    this.ctl.throttle = this.throttle * 100
    this.ctl.brakes = this.brakes * 100
    this.ctl.steering = this.delta / DEG
    this.ctl.wing = this.wing * 100
    this.ctl.noseCone = 0
    // Not panel controls: the reconstruction reads these to move as the
    // physics moves — wheels at road speed, the tub on its springs.
    this.ctl.speed = this.speed * 3.6
    this.ctl.rpm = this.rpm
    this.ctl.dive = THREE.MathUtils.clamp(-this.accel / 11, 0, 1) * 100
    this.ctl.squat = THREE.MathUtils.clamp(this.accel / 9, 0, 1) * 100
    this.ctl.roll = (this.lateral / G) * 6
    this.ctl.pops = this.pops
    return this.ctl
  }

  camera(view: ViewName, eye: THREE.Vector3, aim: THREE.Vector3) {
    if (view === 'inside') {
      eye.set(0, EYE.y, EYE.z).applyQuaternion(this.quaternion).add(this.position)
      aim.copy(eye).addScaledVector(this.travel, 80)
      aim.y -= 0.6
      return 64
    }
    if (view === 'tower') {
      eye.set(-30, field.height(-30, -40) + 11, -40)
      aim.copy(this.position)
      return 22
    }
    // The chase camera follows the direction of travel, so a car going
    // sideways is seen going sideways.
    eye.copy(this.position).addScaledVector(this.travel, -8.5)
    eye.y += 2.4
    aim.copy(this.position).addScaledVector(this.forward, 5)
    aim.y += 0.6
    return 52
  }

  readout(): Readout {
    const kmh = this.speed * 3.6
    const lapNow = Math.min(LAPS, this.laps + 1)
    const grip = this.spun
      ? 'Spun'
      : this.spinning
        ? 'Wheelspin'
        : this.oversteer
          ? 'Rear sliding'
          : this.understeer
            ? 'Front sliding'
            : this.lockedFront
              ? 'Fronts locked'
              : 'Gripping'
    return {
      gauges: [
        { label: 'Speed', value: kmh.toFixed(0), unit: 'km/h', bar: kmh / 300 },
        {
          label: 'Engine',
          value: this.rpm.toFixed(0),
          unit: 'rpm',
          bar: this.rpm / RPM_LIMIT,
          warn: this.rpm >= RPM_LIMIT - 100,
        },
        { label: 'Gear', value: `${this.gear}`, warn: this.shift > 0 },
        { label: 'Lateral', value: (Math.abs(this.lateral) / G).toFixed(2), unit: 'g', bar: Math.abs(this.lateral) / (1.4 * G) },
        { label: 'Tyres', value: grip, warn: grip !== 'Gripping' },
        { label: 'Lap', value: `${lapNow} / ${LAPS}` },
        { label: 'Last lap', value: lapTime(this.lastLap) },
        { label: 'Best lap', value: lapTime(this.bestLap) },
        { label: 'Wing', value: this.wing ? '49B, fitted' : 'None' },
        { label: 'Off circuit', value: `${this.offs}`, warn: this.offs > MAX_OFFS - 3 },
        { label: 'Damage', value: `${Math.round(this.damage * 100)}`, unit: '%', bar: this.damage, warn: this.damage > 0.5 },
      ],
      status: this.finished
        ? 'Exercise over.'
        : this.spun
          ? 'Facing the wrong way. Wait for it to stop, then find first.'
          : this.off
            ? 'On the grass — half the grip, six times the drag.'
            : this.spinning
              ? 'Rear wheels spinning. Feather it.'
              : this.oversteer
                ? 'The tail is coming round. Lift, or open the wheel.'
                : this.lockedFront
                  ? 'Fronts locked — the car will not turn until you ease the brake.'
                  : this.understeer
                    ? 'Front sliding wide. Less speed, less lock.'
                    : this.rpm >= RPM_LIMIT - 100
                      ? 'On the limiter — take the next gear.'
                      : this.rpm < 5500 && this.throttle > 0.5 && this.speed > 5
                        ? 'Below the power band. The DFV wants a lower gear.'
                        : 'In the band.',
      task: `Three laps of the circuit — lap ${lapNow}, ${this.offs} off`,
      progress: THREE.MathUtils.clamp(this.distance / (TRACK_LENGTH * LAPS), 0, 1),
      log: this.log,
      verdict: this.verdict,
    }
  }
}

const envelope: Dimension[] = [
  { label: 'Minimum weight', value: '500 kg dry; 590 kg modelled with driver', source: REGS },
  { label: 'Engine', value: 'Ford-Cosworth DFV, 408 hp at 9,000 rpm', source: COSWORTH },
  { label: 'Power band', value: 'Little below 6,000 rpm — modelled as rpm²·²', source: INFER },
  { label: 'Gearbox', value: 'ZF 5DS-25, five speeds', source: NYE },
  { label: 'Top speed', value: '≈ 290 km/h in fifth', source: INFER },
  { label: 'Wheelbase', value: '2.36 m', source: NYE },
  { label: 'Weight distribution', value: '42 / 58 front to rear, static', source: INFER },
  { label: 'Centre of mass', value: '0.28 m — weight moves 7% per g', source: INFER },
  { label: 'Tyre grip', value: '1.3 g on tarmac, 0.55 g on grass', source: INFER },
  { label: 'Brakes', value: 'Girling discs, 60% front bias', source: NYE },
  { label: 'Rear wing', value: '49B high wing, ≈ 1.15 m² lift area', source: INFER },
  { label: 'Circuit', value: `${(TRACK_LENGTH / 1000).toFixed(2)} km, in the manner of Zandvoort`, source: INFER },
]

export const lotus49Sim: SimDef = {
  slug: 'lotus-49',
  title: 'Debut',
  place: 'A circuit in the dunes, laid out in the manner of Zandvoort, 1967',
  briefing: [
    'You are in the car Jim Clark took to victory on its first outing. The DFV behind you makes 408 horsepower, almost all of it above eight thousand rpm and almost none of it below six — the gear you are in decides what you have.',
    'The car weighs five hundred kilos on narrow treaded tyres, and every bit of grip has to be shared. Brake and the weight goes forward: the front bites, the rear goes light. Stand on the throttle out of a corner and it goes the other way: the rear spins up and steps out, and the tail comes round. Leave the tarmac and the grass gives you half the grip and six times the drag.',
    'Armco lines the outsides of the corners and tyre walls stand where the fast ones run out of road. There are no seat belts. The tall wing on struts came a year later, and you may fit it: more grip at speed, in exchange for drag. Three laps. Stay on the circuit.',
  ],
  task: 'Three laps, and stay on the circuit',
  views: [
    { name: 'chase', label: 'From behind' },
    { name: 'inside', label: 'Driver’s eye' },
    { name: 'tower', label: 'From the pit wall' },
  ],
  bindings: [
    { keys: 'W / S', action: 'Throttle · brake' },
    { keys: '← / →', action: 'Steer' },
    { keys: '↑ / ↓', action: 'Gear up · gear down' },
    { keys: 'G', action: 'Fit or remove the rear wing' },
    { keys: 'P · R', action: 'Pause · start again' },
  ],
  envelope,
  create: () => new Lotus49Sim(),
}
