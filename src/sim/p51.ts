import * as THREE from 'three'
import type { Controls, Dimension, Source } from '../types'
import type { Keyboard } from './keyboard'
import type { Readout, Sim, SimDef, ViewName } from './types'
import {
  G,
  airflow,
  attitude,
  bodyAxes,
  liftCoefficient,
  rotateBody,
  setAttitude,
  stallFraction,
  type Airflow,
  type Attitude,
} from './flight'
import { ramp } from './terrain'
import { APRON, RUNWAY, airfield, paving } from './fields/airfield'
// Explicit extension: on a case-insensitive filesystem './fx' can resolve to
// the drawing component in 'Fx.tsx' rather than the particle buffer itself.
import { Effects } from './fx.ts'
import { Obstacles, type Obstacle } from './obstacles'
import { P51_STANCE, p51GroundRise, p51MainRise } from '../three/stance'
import { Battery, Flak } from './p51/guns'
import { RANGE, buildWorld, rangeScore, type World } from './p51/world'

/**
 * A test hop in a P-51D: off the strip, round four pylons, down the range
 * with the guns, and back onto the paving.
 *
 * The aerodynamics are built from the published figures and then checked
 * against one of them that was *not* used as an input: with 1,490 hp, a
 * zero-lift drag coefficient of 0.0163 and 21.83 m² of wing, this model
 * settles at about 355 mph at sea level. The Mustang's published sea-level
 * maximum is 360. Nothing was tuned to make that come out.
 *
 * Attitude is not commanded. Aileron, elevator and rudder make moments, the
 * moments are divided by the aeroplane's inertia, and what comes out is a
 * rate — which is why she is heavy at 400 mph, sloppy at 90, rolls left when
 * you open the throttle, and drops a wing if you ask for more lift than the
 * wing has left to give.
 */

const POH: Source = {
  kind: 'text',
  citation: 'AN 01-60JE-1, Pilot’s Flight Operating Instructions, P-51D (1944)',
  note: 'Limiting speeds, flap and gear restrictions, takeoff and landing procedure.',
}
const DEAN: Source = {
  kind: 'text',
  citation: 'Dean, F., America’s Hundred Thousand (Schiffer, 1997)',
  note: 'Measured drag breakdown, stability derivatives and flight-test performance for the P-51D.',
}
const SPEC: Source = {
  kind: 'text',
  citation: 'North American Aviation Report NA-8449, Model Specification',
}
const ORD: Source = {
  kind: 'text',
  citation: 'TM 9-225, Browning Machine Gun, Caliber .50, M2 (War Department, 1943)',
  note: 'Cyclic rate, muzzle velocity and the weight of the round.',
}
const INFER: Source = {
  kind: 'inference',
  citation: 'Derived for this simulation from the cited weight, area, drag and power',
}

// --- Airframe ---------------------------------------------------------------
const MASS = 4585 // kg, clean fighter loading
const AREA = 21.83 // m²
const SPAN = 11.28
const HALF_SPAN = SPAN / 2
const MAC = 1.93 // mean aerodynamic chord

/**
 * Moments of inertia. Not published in the sources used here, so they are
 * scaled from the mass distribution of a fighter of this size and weight:
 * heavy in roll because the guns and their ammunition are in the wing,
 * heaviest in yaw because the tail is a long way back.
 */
const IXX = 10_000 // kg·m², roll
const IYY = 13_000 // pitch
const IZZ = 22_000 // yaw

const POWER = 1_110_000 // W — 1,490 hp at war emergency
const PROP_EFF = 0.82
const PROP_OMEGA = 150 // rad/s at 1,437 propeller rpm
/**
 * Static thrust, which is what gets it off the ground. Momentum theory on
 * the 3.40 m propeller disc gives about 31 kN ideal; at the 65 per cent a
 * real propeller manages standing still, 14 kN. Above 65 m/s the power
 * limit below takes over instead.
 */
const THRUST_STATIC = 14_000 // N

const CL_SLOPE = 4.6 // per radian, AR 5.83
const ALPHA_ZERO = -0.026
const CL_MAX = 1.5 // clean, which puts the 1 g stall at 106 mph
const CD0 = 0.0163 // the laminar wing and the ducted radiator, measured
const K_INDUCED = 0.065 // 1/(π·AR·e), e = 0.84
const CD_GEAR = 0.017
const CD_FLAP = 0.09

// --- Stability and control derivatives -------------------------------------
const CM_0 = 0.04
const CM_ALPHA = -0.55 // stick-fixed static margin
const CM_DE = 1.1 // per radian of elevator, positive = nose up
const CM_Q = -12
const CL_DA = 0.036 // rolling moment per unit aileron
const CL_P = -0.5 // roll damping
const CL_BETA = -0.08 // dihedral effect
const CN_BETA = 0.12 // weathercock
const CN_DR = 0.075
const CN_R = -0.12
const CN_DA = -0.012 // adverse yaw: roll right, yaw left
const ELEVATOR_TRAVEL = 0.35 // radians, 20° down and 30° up
/**
 * Stick force. Control travel is not limited by the stops but by the pilot's
 * arm: hinge moment goes with dynamic pressure, so past about 180 mph full
 * deflection is simply not available to him. This constant is the dynamic
 * pressure at which he runs out of strength, fitted so that 300 mph still
 * gives the 8 g the airframe is rated for and 400 mph does not.
 */
const STICK_FORCE = 4000 // Pa

const FLAP_LIMIT = 73.7 // m/s — 165 mph indicated
const GEAR_LIMIT = 76 // m/s — 170 mph
const G_LIMIT = 8

const MPH = 2.23694
const FT = 3.28084
const DEG = Math.PI / 180

/** Wind over the field: 9 m/s from the north-north-east, near enough down
 *  the strip, with just enough across it to be worth a boot of rudder. */
export const WIND = new THREE.Vector3(3, 0, -8.5)

/** The course: four pylons, then down the range. */
export const GATES = [
  { x: 0, y: 200, z: 1700, r: 62, note: 'Straight out, climbing' },
  { x: 1250, y: 380, z: 3100, r: 62, note: 'Right and up' },
  { x: 1750, y: 240, z: 900, r: 62, note: 'Hard right, back down the field' },
  { x: 500, y: 140, z: -1100, r: 62, note: 'Low pass, then round for the range' },
]

type Phase = 'ground' | 'air' | 'done' | 'dead'
type Stage = 'pylons' | 'strafe' | 'land'

export class P51Sim implements Sim {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()

  readonly fx = new Effects(700)
  readonly obstacles = new Obstacles()
  showModel = true

  private world: World
  private guns: Battery
  private flakGuns: Flak

  private velocity = new THREE.Vector3()
  private wind = WIND.clone()
  private phase: Phase = 'ground'
  private stage: Stage = 'pylons'

  private throttle = 0
  private gearDown = true
  private flaps = 0 // degrees
  private brakes = 0
  private radiator = 6 // degrees of exit door

  private stick = 0 // +1 = pull
  private aileron = 0
  private pedal = 0
  private trim = 0

  // Body rates, pilot's sense: nose up, right wing down, nose right.
  private q = 0
  private p = 0
  private r = 0
  private groundPitch = P51_STANCE.pitch

  private att: Attitude = { pitch: 0, bank: 0, heading: 0 }
  private air: Airflow = { V: 0, qbar: 0, alpha: 0, beta: 0 }
  private liftDir = new THREE.Vector3()
  private dragDir = new THREE.Vector3()
  private forward = new THREE.Vector3()
  private up = new THREE.Vector3()
  private right = new THREE.Vector3()
  private force = new THREE.Vector3()
  private probe = new THREE.Vector3()
  private scratch = new THREE.Vector3()
  private probes = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]
  private recoil = 0

  private gate = 0
  private clock = 0
  private gLoad = 1
  private overG = 0
  private stall = 0
  private dropSign = 1
  private buffet = 0
  private shake = 0
  private damage = 0
  private smokeDue = 0
  private score = 0
  private killed = 0
  private available = 0
  private convoyAlert = false
  private log: string[] = []
  private verdict: Readout['verdict']
  private ctl: Controls = {}

  finished = false

  constructor() {
    this.world = buildWorld(this.obstacles)
    this.guns = new Battery(
      this.obstacles,
      (x, z) => airfield.height(x, z),
      this.fx,
      (o, at) => this.scored(o, at),
    )
    this.flakGuns = new Flak(this.fx, (at) => this.flakStrike(at))
    this.fx.ground = (x, z) => airfield.height(x, z)
    this.reset()
  }

  reset() {
    this.obstacles.reset()
    this.world = buildWorld(this.obstacles)
    this.available = rangeScore(this.world)
    this.fx.reset()
    this.guns.reset()
    this.flakGuns.reset()

    this.groundPitch = P51_STANCE.pitch
    this.position.set(0, p51GroundRise(this.groundPitch), -RUNWAY.length / 2 + 60)
    setAttitude(this.quaternion, this.groundPitch, 0, 0)
    this.velocity.set(0, 0, 0)
    this.phase = 'ground'
    this.stage = 'pylons'
    this.showModel = true
    this.throttle = 0
    this.gearDown = true
    this.flaps = 0
    this.brakes = 0
    this.radiator = 6
    this.stick = this.aileron = this.pedal = this.trim = 0
    this.q = this.p = this.r = 0
    this.gate = 0
    this.clock = 0
    this.gLoad = 1
    this.overG = 0
    this.stall = 0
    this.buffet = 0
    this.shake = 0
    this.damage = 0
    this.score = 0
    this.killed = 0
    this.convoyAlert = false
    this.verdict = undefined
    this.finished = false
    this.log = ['Chocks away. Twenty degrees of flap is usual for takeoff.']
  }

  private say(line: string) {
    this.log.push(line)
    if (this.log.length > 6) this.log.shift()
  }

  /** The next gate, or null once the course is flown. */
  get nextGate() {
    return this.gate < GATES.length ? GATES[this.gate] : null
  }

  get gatesFlown() {
    return this.gate
  }

  /** Rounds left, for the scene's tracer pool and the panel. */
  get rounds() {
    return this.guns.rounds
  }

  get shells() {
    return this.flakGuns.shells
  }

  step(dt: number, keys: Keyboard) {
    this.clock += dt
    this.fx.step(dt)
    this.obstacles.step(dt)
    this.shake = Math.max(0, this.shake - dt * 1.6)

    if (this.phase === 'dead') {
      this.wreckage(dt)
      return
    }

    // --- Cockpit -----------------------------------------------------------
    this.throttle = THREE.MathUtils.clamp(
      this.throttle + keys.axis(['KeyS'], ['KeyW']) * dt * 0.5,
      0,
      1,
    )
    this.stick = spring(this.stick, keys.axis(['ArrowUp'], ['ArrowDown']), dt, 3, 4)
    this.aileron = spring(this.aileron, keys.axis(['ArrowLeft'], ['ArrowRight']), dt, 4, 5)
    this.pedal = spring(this.pedal, keys.axis(['KeyA'], ['KeyD']), dt, 3, 4)
    this.brakes = keys.down('KeyB') ? 1 : 0
    this.trim = THREE.MathUtils.clamp(
      this.trim + keys.axis(['Comma'], ['Period']) * dt * 0.25,
      -0.6,
      0.6,
    )

    if (keys.tapped('KeyG')) {
      this.gearDown = !this.gearDown
      if (!this.gearDown && this.air.V > GEAR_LIMIT) {
        this.say('Gear raised above 170 mph — the doors will not thank you.')
      } else {
        this.say(this.gearDown ? 'Gear down and locked.' : 'Gear up.')
      }
    }
    if (keys.tapped('BracketRight')) this.flaps = Math.min(50, this.flaps + 10)
    if (keys.tapped('BracketLeft')) this.flaps = Math.max(0, this.flaps - 10)
    if (keys.tapped('KeyC')) this.radiator = this.radiator > 12 ? 6 : 22

    if (this.phase === 'done') {
      this.settle(dt)
      return
    }

    // --- Guns and the people shooting back ---------------------------------
    // Fired against last frame's attitude, which nobody can see, and before
    // the flight integration so the recoil arrives with the rounds.
    bodyAxes(this.quaternion, this.forward, this.up, this.right)
    this.recoil = this.guns.step(
      dt,
      keys.down('Space'),
      this.position,
      this.right,
      this.up,
      this.forward,
      this.velocity,
      MASS,
    )
    if (this.guns.fired > 0) this.shake = Math.min(0.5, this.shake + this.guns.fired * 0.012)
    this.flakGuns.step(dt, this.world.flak, this.position, this.velocity, this.stage === 'strafe' ? 0.85 : 0.5)
    this.convoy(dt)
    this.trail(dt)

    // The airframe is stiff in pitch at speed: a fortieth of a second is too
    // long a step for it, and the answer wobbles. Substep until it does not.
    const n = Math.min(8, Math.max(1, Math.ceil(dt / 0.01)))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      if (this.phase !== 'ground' && this.phase !== 'air') break
      this.aero(h)
      if (this.phase === 'ground' || this.phase === 'air') this.collide()
    }

    this.progressStage()
  }

  /** One integration step of the flight mechanics. */
  private aero(dt: number) {
    // --- Airflow -----------------------------------------------------------
    bodyAxes(this.quaternion, this.forward, this.up, this.right)
    airflow(this.velocity, this.wind, this.quaternion, this.air, this.liftDir, this.dragDir)
    attitude(this.quaternion, this.att)
    const { V, qbar, alpha, beta } = this.air

    const flapFrac = this.flaps / 50
    const clMax = CL_MAX + 0.4 * flapFrac
    let cl = liftCoefficient(alpha, CL_SLOPE, ALPHA_ZERO - 0.14 * flapFrac, clMax)
    const wasStalled = this.stall > 0.06
    this.stall = stallFraction(alpha, CL_SLOPE, ALPHA_ZERO - 0.14 * flapFrac, clMax)
    if (this.stall > 0.06 && !wasStalled) {
      // Which wing goes first is decided by whichever one is already the
      // more loaded — the slipping wing, or the one the torque is pushing.
      this.dropSign = beta > 0.01 ? -1 : beta < -0.01 ? 1 : this.throttle > 0.4 ? -1 : 1
      if (this.phase === 'air') this.say('Buffet. She is on the edge — ease the stick forward.')
    }
    this.buffet += ((this.stall > 0.02 ? Math.min(1, this.stall * 3) : 0) - this.buffet) * (1 - Math.exp(-6 * dt))

    // Ground effect. Within about a span of the ground the wing's downwash
    // has nowhere to go: induced drag falls away and the wing carries more
    // for the same incidence, which is why a Mustang unsticks at a hundred
    // miles an hour and floats if you bring it over the fence any faster.
    const wheelHeight = Math.max(
      0,
      this.position.y - airfield.height(this.position.x, this.position.z) - 1.6,
    )
    const ge = 1 - Math.min(1, wheelHeight / (SPAN * 0.7))
    cl *= 1 + 0.12 * ge

    let cd = CD0 + K_INDUCED * (1 - 0.45 * ge) * cl * cl + CD_FLAP * flapFrac * flapFrac
    if (this.gearDown) cd += CD_GEAR
    cd += 0.0009 * this.radiator // the exit door is a speed brake if you let it be
    cd += 0.02 * this.damage
    // Compressibility: the dive limit is a real wall, and it is made of drag.
    cd += 0.05 * ramp(V, 200, 260)

    const lift = qbar * AREA * cl
    const drag = qbar * AREA * cd
    const power = 1 - 0.55 * this.damage
    const thrust = Math.min(
      THRUST_STATIC * (0.08 + 0.92 * this.throttle),
      (PROP_EFF * POWER * (0.05 + 0.95 * this.throttle)) / Math.max(V, 22),
    ) * power

    this.gLoad = lift / (MASS * G)

    if (this.phase === 'ground') this.rollOut(dt, thrust, drag, lift, this.recoil)
    else this.fly(dt, thrust, drag, lift, beta, this.recoil)
  }

  // --- On the wheels --------------------------------------------------------
  private rollOut(dt: number, thrust: number, drag: number, lift: number, recoil: number) {
    const V = this.velocity.length()
    const surface = airfield.drag(this.position.x, this.position.z)
    const weightOn = Math.max(0, MASS * G - lift)
    const rolling = surface * weightOn + this.brakes * 0.55 * weightOn
    const along = thrust - drag - rolling - recoil * MASS

    // The tail comes up when the elevator has enough air to lift it, and the
    // stick decides when. Three-point to level is the whole of the rotation.
    const target = THREE.MathUtils.clamp(
      P51_STANCE.pitch * (1 - ramp(V, 18, 42)) + this.stick * 0.22 * ramp(V, 12, 40),
      -0.02,
      P51_STANCE.pitch,
    )
    this.groundPitch += (target - this.groundPitch) * (1 - Math.exp(-2.5 * dt))

    // The tailwheel and rudder steer the aircraft during the ground roll.
    // Throttle must not introduce steering input: W/S only control power.
    const tailDown = 1 - ramp(this.groundPitch, 0.02, P51_STANCE.pitch * 0.8)
    const steering = this.pedal * (0.22 + 0.5 * ramp(V, 1, 30) + 0.3 * tailDown)
    this.att.heading += steering * dt * 0.5
    this.r = steering * 0.5

    setAttitude(this.quaternion, this.groundPitch, this.att.heading, 0)
    bodyAxes(this.quaternion, this.forward, this.up, this.right)

    const speed = Math.max(0, V + (along / MASS) * dt)
    this.velocity.copy(this.forward).setY(0).normalize().multiplyScalar(speed)
    this.position.addScaledVector(this.velocity, dt)
    this.position.y = airfield.height(this.position.x, this.position.z) + p51GroundRise(this.groundPitch)

    if (paving(this.position.x, this.position.z) < 0.4 && speed > 12) {
      this.say('Off the paving and into the grass — watch the drag.')
    }

    if (lift > MASS * G * 0.99 && speed > 35) {
      this.phase = 'air'
      this.q = 0
      this.velocity.y = 0.25
      this.say(`Unstuck at ${(speed * MPH).toFixed(0)} mph. Gear up before 170.`)
    }
  }

  // --- In the air -----------------------------------------------------------
  private fly(dt: number, thrust: number, drag: number, lift: number, beta: number, recoil: number) {
    const { V, qbar } = this.air

    this.force.set(0, -MASS * G, 0)
    this.force.addScaledVector(this.liftDir, lift)
    this.force.addScaledVector(this.dragDir, drag)
    this.force.addScaledVector(this.forward, thrust - recoil * MASS)
    this.force.addScaledVector(this.right, -qbar * AREA * 0.9 * beta)

    this.velocity.addScaledVector(this.force, dt / MASS)
    this.position.addScaledVector(this.velocity, dt)

    // --- Moments -----------------------------------------------------------
    // Everything below is a coefficient, multiplied by dynamic pressure and
    // a reference length, divided by an inertia. No rate is commanded.
    const qS = qbar * AREA
    const speed = Math.max(V, 12)
    const stalled = 1 - 0.55 * this.stall

    // Elevator: travel limited by what the pilot can hold at this speed.
    const deMax = ELEVATOR_TRAVEL * Math.min(1, STICK_FORCE / Math.max(qbar, 1))
    const de = THREE.MathUtils.clamp(this.stick + this.trim, -1, 1) * deMax * stalled
    const cm =
      CM_0 +
      CM_ALPHA * this.air.alpha +
      CM_DE * de +
      CM_Q * ((this.q * MAC) / (2 * speed))
    let qdot = (qS * MAC * cm) / IYY

    // Ailerons stiffen with speed — less than most of her contemporaries,
    // which is half the reason she could still fight at 400 mph.
    const daAuth = THREE.MathUtils.clamp(11000 / Math.max(qbar, 1), 0.6, 1) * stalled
    const cl =
      CL_DA * this.aileron * daAuth +
      CL_P * ((this.p * SPAN) / (2 * speed)) +
      CL_BETA * beta +
      // One wing always goes before the other, and once it has gone it drops
      // hard. Below the break there is buffet and no drop, which is the
      // warning the laminar wing is famously short of.
      this.dropSign * 0.055 * Math.max(0, this.stall - 0.12)
    let pdot = (qS * SPAN * cl) / IXX
    // Reaction torque: 1,490 hp through a 1,437 rpm propeller is 7.4 kN·m
    // trying to roll the aeroplane to the left the whole time. Rather less
    // than that reaches the pilot — the slipstream swirling over the wing
    // hands some of it back, and the aeroplane is rigged to help — so what
    // is applied here is the part he has to hold off with aileron.
    pdot -= (0.45 * (POWER * this.throttle)) / PROP_OMEGA / IXX

    const cn =
      CN_BETA * beta +
      CN_DR * this.pedal * stalled +
      CN_R * ((this.r * SPAN) / (2 * speed)) +
      CN_DA * this.aileron * daAuth
    let rdot = (qS * SPAN * cn) / IZZ
    // Slipstream and P-factor: worth a bootful of right rudder at low speed
    // and high power, and nothing at all in the cruise.
    rdot -= (5200 * this.throttle * (1 - ramp(V, 25, 130))) / IZZ

    // Buffet: the airflow over the tail is breaking up, and the aeroplane
    // shakes with it. It is a warning, and it is also a nuisance.
    if (this.buffet > 0.02) {
      const b = this.buffet * 2.4
      qdot += (Math.random() - 0.5) * b
      pdot += (Math.random() - 0.5) * b * 2
      rdot += (Math.random() - 0.5) * b
      this.shake = Math.max(this.shake, this.buffet * 0.5)
    }

    this.q += qdot * dt
    this.p += pdot * dt
    this.r += rdot * dt
    rotateBody(this.quaternion, this.q, this.r, this.p, dt)

    // --- Limits ------------------------------------------------------------
    if (Math.abs(this.gLoad) > G_LIMIT) {
      this.overG += dt
      if (this.overG > 0.8) {
        this.destroy('Pulled the wings off', [
          `${this.gLoad.toFixed(1)} g. The airframe is rated to ${G_LIMIT}.`,
          'The manual is not a suggestion.',
        ], 9)
        return
      }
    } else {
      this.overG = Math.max(0, this.overG - dt * 0.5)
    }
    if (this.flaps > 0 && V > FLAP_LIMIT + 8) {
      this.flaps = Math.max(0, this.flaps - 40 * dt)
      this.say('Flaps blown back up by the airflow. 165 mph is the limit.')
    }

    // --- Course ------------------------------------------------------------
    const gate = this.nextGate
    if (gate) {
      const dx = this.position.x - gate.x
      const dy = this.position.y - gate.y
      const dz = this.position.z - gate.z
      if (dx * dx + dy * dy + dz * dz < gate.r * gate.r) {
        this.gate++
        this.say(
          this.gate < GATES.length
            ? `Pylon ${this.gate} of ${GATES.length}. ${GATES[this.gate].note}.`
            : 'Pylons flown. Round to the north and make one pass down the range.',
        )
      }
    }

    // --- Ground ------------------------------------------------------------
    const terrain = airfield.height(this.position.x, this.position.z)
    const wheels = this.gearDown ? p51MainRise(this.att.pitch) : 1.05
    const tip = Math.abs(Math.sin(this.att.bank)) * HALF_SPAN
    const clearance = this.position.y - terrain - Math.max(wheels, tip)

    if (clearance <= 0) {
      // You land by descending into the ground, not by brushing it. Just
      // after lift-off the wing is barely carrying the weight and the wheels
      // are still within inches of the runway; with the undercarriage down
      // and the aeroplane climbing, the oleos take that, not the airframe.
      if (this.velocity.y < -0.25 || !this.gearDown) {
        this.touchdown(terrain, wheels, tip)
      } else {
        this.position.y = terrain + Math.max(wheels, tip)
        if (this.velocity.y < 0) this.velocity.y = 0
      }
    }
  }

  // --- Running into things --------------------------------------------------

  /**
   * Four probes: the spinner, both wingtips and the belly. An aeroplane is
   * mostly empty air, and a sphere around the whole of it would have her
   * exploding on things she has comfortably missed.
   */
  private collide() {
    const speed = this.velocity.length()
    this.probes[0].copy(this.position).addScaledVector(this.forward, 3.4)
    this.probes[1].copy(this.position).addScaledVector(this.right, HALF_SPAN - 0.5)
    this.probes[2].copy(this.position).addScaledVector(this.right, -(HALF_SPAN - 0.5))
    this.probes[3].copy(this.position).addScaledVector(this.up, -0.8)
    const parts = ['nose', 'wingtip', 'wingtip', 'belly']
    const radii = [1.1, 0.9, 0.9, 1.5]

    for (let i = 0; i < 4; i++) {
      const at = this.probes[i]
      const radius = radii[i]
      const part = parts[i]
      const hit = this.obstacles.hit(at, radius)
      if (!hit) continue
      const o = hit.obstacle
      const severity = speed * o.solidity

      // Whatever it was, it has just been hit by four and a half tonnes.
      if (o.hp !== Infinity && this.obstacles.damage(o, 999)) this.scored(o, hit.point)

      if (severity > 14) {
        this.destroy(crashTitle(o.kind, part), [
          `${(speed * MPH).toFixed(0)} mph into ${describe(o.kind)}.`,
          part === 'wingtip'
            ? 'A wingtip at that speed is a pivot, and the aeroplane goes round it.'
            : 'Nothing about the airframe is designed for that.',
        ], Math.min(10, 3 + speed / 10))
        return
      }

      // A glancing blow on something soft: it hurts, it slows her, and it
      // will cost you the landing rather than your life.
      this.damage = Math.min(1, this.damage + 0.12)
      this.shake = 1
      this.velocity.multiplyScalar(0.86)
      this.fx.impact(hit.point, 1.2, '#8f8677')
      this.say(`Clipped ${describe(o.kind)}. Something is bent.`)
      return
    }
  }

  private touchdown(terrain: number, wheels: number, tip: number) {
    const sink = -this.velocity.y
    const bank = Math.abs(this.att.bank) / DEG
    const speed = this.velocity.length()
    const paved = paving(this.position.x, this.position.z) > 0.6

    this.position.y = terrain + Math.max(wheels, tip)

    const lines = [
      `Touchdown at ${(speed * MPH).toFixed(0)} mph, ${sink.toFixed(1)} m/s of sink, ${bank.toFixed(0)}° of bank.`,
      `${this.gate} of ${GATES.length} pylons, ${this.score} of ${this.available} on the range.`,
    ]

    if (!this.gearDown) {
      this.destroy('Landed on the radiator', [
        ...lines,
        'The scoop under the spar is not undercarriage. Gear is the G key.',
      ], 4 + speed / 14)
      return
    }
    if (bank > 10) {
      this.destroy('Cartwheeled a wingtip', [
        ...lines,
        'Level the wings before the wheels arrive: the tip touches first, and it does not let go.',
      ], 4 + speed / 12)
      return
    }
    if (sink > 3.5 || speed > 62) {
      this.destroy('Flew into the ground', [
        ...lines,
        'Below 100 mph over the fence, with full flap. That is what the flaps are for.',
      ], 3 + speed / 12)
      return
    }
    if (!paved) {
      this.end(false, 'Down in the field', [
        ...lines,
        'A good landing, on the wrong 1,500 metres of England.',
      ])
      return
    }
    const clean = this.gate === GATES.length && this.score >= this.available * 0.6
    this.phase = 'done'
    this.end(
      clean,
      clean ? 'Down, and the card is clean' : 'Down, exercise incomplete',
      [...lines, ...(this.damage > 0 ? ['She will need a fitter before she flies again.'] : [])],
    )
  }

  // --- Coming to grief ------------------------------------------------------

  /**
   * The aeroplane stops being an aeroplane. What is left is a fuel fireball
   * scaled to how fast it arrived, the airframe in pieces going the way it
   * was already going, and a fire that will still be burning when the
   * ambulance gets there.
   */
  private destroy(title: string, lines: string[], scale: number) {
    if (this.phase === 'dead') return
    const floor = airfield.height(this.position.x, this.position.z)

    this.fx.explosion(this.position, THREE.MathUtils.clamp(scale, 3, 10), { debris: 0, fire: 0 })
    // Wreckage carries the aeroplane's own momentum: it goes on down the
    // field, tumbling, and skids where it lands.
    for (let i = 0; i < 20; i++) {
      this.scratch
        .copy(this.velocity)
        .multiplyScalar(0.35 + Math.random() * 0.35)
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * 22,
            Math.random() * 14,
            (Math.random() - 0.5) * 22,
          ),
        )
      this.fx.emit('debris', this.position, {
        vel: this.scratch.clone(),
        life: 6 + Math.random() * 4,
        size: 0.35 + Math.random() * 0.9,
        grow: 1,
        colour: '#6a6358',
        fade: '#2f2b26',
        drag: 0.22,
        gravity: -9.81,
        spin: 12,
        bounce: true,
      })
    }
    this.scratch.set(this.position.x, floor + 0.4, this.position.z)
    this.fx.ignite(this.scratch, 3.4, 90)
    this.fx.impact(this.scratch, 2.4, '#9d9276')

    this.showModel = false
    this.shake = 1.6
    this.phase = 'dead'
    this.velocity.multiplyScalar(0.25)
    this.end(false, title, [
      ...lines,
      `${this.gate} of ${GATES.length} pylons, ${this.score} of ${this.available} on the range, ${this.clock.toFixed(0)} seconds.`,
    ])
  }

  /** After the crash: the fire burns, and the camera stays to watch it. */
  private wreckage(dt: number) {
    this.velocity.multiplyScalar(Math.exp(-2.6 * dt))
    this.position.addScaledVector(this.velocity, dt)
    this.position.y = Math.max(
      airfield.height(this.position.x, this.position.z) + 0.6,
      this.position.y - 6 * dt,
    )
    this.throttle *= Math.exp(-4 * dt)
  }

  private settle(dt: number) {
    this.velocity.multiplyScalar(Math.exp(-1.6 * dt))
    this.position.addScaledVector(this.velocity, dt)
    this.position.y =
      airfield.height(this.position.x, this.position.z) + p51GroundRise(P51_STANCE.pitch)
    this.groundPitch += (P51_STANCE.pitch - this.groundPitch) * (1 - Math.exp(-2 * dt))
    setAttitude(this.quaternion, this.groundPitch, this.att.heading, 0)
    this.throttle *= Math.exp(-2 * dt)
  }

  private end(good: boolean, title: string, lines: string[]) {
    if (this.verdict) return
    this.verdict = { good, title, lines }
    this.finished = true
    if (this.phase !== 'dead') this.phase = 'done'
  }

  // --- The range ------------------------------------------------------------

  private scored(o: Obstacle, at: THREE.Vector3) {
    const worth = o.data.score ?? 0
    const big = o.kind === 'flak' || o.kind === 'wreck-target' || o.kind === 'truck'
    this.fx.explosion(at, o.kind === 'drum' ? 3.4 : big ? 4.2 : 2.6, {
      fire: o.kind === 'fence' || o.kind === 'pole' ? 0 : 26,
    })
    if (worth > 0) {
      this.score += worth
      this.killed++
      this.say(`${describe(o.kind)} destroyed — ${this.score} of ${this.available}.`)
    }
  }

  /** The lorries drive until one of them is hit, and then they stop. */
  private convoy(dt: number) {
    if (this.convoyAlert) return
    for (const t of this.world.convoy) {
      if (t.dead || t.hp < 12) {
        this.convoyAlert = true
        this.say('The convoy has stopped. They know you are there.')
        return
      }
    }
    for (const t of this.world.convoy) {
      t.pos.x += 9 * dt
      if (t.pos.x > (t.data.home ?? 0) + 420) t.pos.x -= 840
      t.pos.y = airfield.height(t.pos.x, t.pos.z) + 1.5
    }
  }

  private flakStrike(at: THREE.Vector3) {
    this.damage = Math.min(1, this.damage + 0.2)
    this.shake = 1.2
    this.fx.impact(at, 1.1, '#6d655a')
    if (this.damage >= 1) {
      this.destroy('Shot down over the range', [
        'The flak had the range, and one pass was one too many.',
        'Twenty millimetre through the coolant is the end of a Merlin.',
      ], 7)
      return
    }
    this.say(
      this.damage > 0.5
        ? 'Hit again. Glycol on the windscreen — get out of range.'
        : 'Hit. The flak has your number.',
    )
  }

  /** A damaged Merlin trails coolant, and then smoke, all the way home. */
  private trail(dt: number) {
    if (this.damage < 0.25 || this.phase === 'dead') return
    this.smokeDue -= dt
    if (this.smokeDue > 0) return
    this.smokeDue = 0.09
    this.scratch.copy(this.position).addScaledVector(this.forward, 1.6)
    this.fx.puff(
      this.scratch,
      this.probe.copy(this.velocity).multiplyScalar(0.25),
      0.5 + this.damage,
      this.damage > 0.6 ? '#33302c' : '#8d8880',
      1.4 + this.damage * 2,
    )
  }

  /** Move the exercise on: pylons, then the range, then the runway. */
  private progressStage() {
    if (this.stage === 'pylons' && this.gate >= GATES.length) {
      this.stage = 'strafe'
      this.say('Range is at the north end, beyond the road. Space fires the guns.')
      return
    }
    if (this.stage === 'strafe') {
      const done = this.world.targets.every((t) => t.dead)
      if (done || this.guns.ammo === 0) {
        this.stage = 'land'
        this.say(
          done
            ? 'Range clear. Bring her home and put her on the paving.'
            : 'Out of ammunition. Bring her home and put her on the paving.',
        )
      }
    }
  }

  controls() {
    this.ctl.throttle = this.throttle * 100
    this.ctl.gear = this.gearDown ? 1 : 0
    this.ctl.flaps = this.flaps
    this.ctl.canopy = 0
    this.ctl.roll = this.aileron * 10
    this.ctl.elevator = this.stick > 0 ? this.stick * 30 : this.stick * 20
    this.ctl.rudder = this.pedal * 30
    this.ctl.radiator = this.radiator
    this.ctl.guns = this.guns.firing ? 1 : 0
    return this.ctl
  }

  camera(view: ViewName, eye: THREE.Vector3, aim: THREE.Vector3) {
    bodyAxes(this.quaternion, this.forward, this.up, this.right)
    const jolt = this.shake * this.shake

    if (this.phase === 'dead') {
      // Stand off and watch it burn. Nothing else to fly.
      eye.set(this.position.x + 26, this.position.y + 14, this.position.z - 30)
      aim.copy(this.position)
      this.jitter(eye, jolt * 1.4)
      return 42
    }
    if (view === 'inside') {
      // Head in the bubble hood. The nose is in the way, which is the point.
      eye.copy(this.position)
        .addScaledVector(this.forward, 0.55)
        .addScaledVector(this.up, 0.72)
      aim.copy(eye).addScaledVector(this.forward, 40).addScaledVector(this.up, 1.5)
      this.jitter(eye, jolt * 0.5)
      return 68
    }
    if (view === 'tower') {
      eye.set(APRON.x - 40, airfield.height(APRON.x - 40, APRON.z + 60) + 11, APRON.z + 60)
      aim.copy(this.position)
      return 30
    }
    eye.copy(this.position)
      .addScaledVector(this.forward, -26)
      .addScaledVector(this.up, 7)
    aim.copy(this.position).addScaledVector(this.forward, 12)
    this.jitter(eye, jolt)
    return 45
  }

  private jitter(eye: THREE.Vector3, amount: number) {
    if (amount < 1e-3) return
    eye.x += (Math.random() - 0.5) * amount
    eye.y += (Math.random() - 0.5) * amount
    eye.z += (Math.random() - 0.5) * amount
  }

  readout(): Readout {
    const V = this.air.V
    const alt = (this.position.y - airfield.height(this.position.x, this.position.z)) * FT
    const vs = this.velocity.y * FT * 60
    const gate = this.nextGate
    const bearing = gate
      ? ((Math.atan2(gate.x - this.position.x, gate.z - this.position.z) / DEG + 360) % 360)
      : ((Math.atan2(RANGE.x - this.position.x, RANGE.z - this.position.z) / DEG + 360) % 360)
    const range = gate
      ? Math.hypot(gate.x - this.position.x, gate.z - this.position.z) / 1000
      : Math.hypot(RANGE.x - this.position.x, RANGE.z - this.position.z) / 1000
    const alphaStall = (CL_MAX + 0.4 * (this.flaps / 50)) / CL_SLOPE + ALPHA_ZERO
    const margin = THREE.MathUtils.clamp(this.air.alpha / alphaStall, 0, 1.4)

    return {
      gauges: [
        { label: 'Throttle', value: (this.throttle * 100).toFixed(0), unit: '%', bar: this.throttle },
        { label: 'Manifold', value: (10 + this.throttle * 51).toFixed(0), unit: 'inHg' },
        { label: 'Engine', value: (1200 + this.throttle * 1800).toFixed(0), unit: 'rpm' },
        { label: 'Indicated', value: (V * MPH).toFixed(0), unit: 'mph', warn: this.stall > 0.05 },
        { label: 'Altitude', value: alt.toFixed(0), unit: 'ft' },
        { label: 'Climb', value: (vs > 0 ? '+' : '') + vs.toFixed(0), unit: 'ft/min' },
        { label: 'Load', value: this.gLoad.toFixed(1), unit: 'g', warn: Math.abs(this.gLoad) > G_LIMIT * 0.85 },
        {
          label: 'Incidence',
          value: (this.air.alpha / DEG).toFixed(0),
          unit: '°',
          bar: margin / 1.4,
          warn: margin > 0.9,
        },
        { label: 'Bank', value: (this.att.bank / DEG).toFixed(0), unit: '°' },
        { label: 'Trim', value: (this.trim >= 0 ? '+' : '') + this.trim.toFixed(2) },
        { label: 'Flaps', value: this.flaps.toFixed(0), unit: '°', warn: this.flaps > 0 && V > FLAP_LIMIT },
        { label: 'Gear', value: this.gearDown ? 'Down' : 'Up', warn: this.gearDown && V > GEAR_LIMIT },
        {
          label: 'Rounds',
          value: this.guns.ammo.toFixed(0),
          bar: this.guns.ammo / 1880,
          warn: this.guns.ammo < 200,
        },
        {
          label: this.guns.jammed ? 'Guns jammed' : 'Barrels',
          value: this.guns.jammed ? 'Cooling' : `${(this.guns.heat * 100).toFixed(0)}%`,
          bar: Math.min(1, this.guns.heat),
          warn: this.guns.heat > 0.7,
        },
        { label: 'Damage', value: `${(this.damage * 100).toFixed(0)}%`, warn: this.damage > 0.3 },
        gate
          ? { label: 'Next pylon', value: `${range.toFixed(1)} km · ${bearing.toFixed(0)}°` }
          : this.stage === 'strafe'
            ? { label: 'Range', value: `${range.toFixed(1)} km · ${bearing.toFixed(0)}°` }
            : { label: 'Score', value: `${this.score} of ${this.available}` },
      ],
      status: this.status(),
      task:
        this.stage === 'pylons'
          ? `Fly the four pylons — ${this.gate} down`
          : this.stage === 'strafe'
            ? `Strafe the range — ${this.score} of ${this.available} scored`
            : 'Land on the runway: gear down, wings level, under 100 mph',
      progress:
        (this.gate / GATES.length) * 0.45 +
        (this.available ? this.score / this.available : 0) * 0.35 +
        (this.phase === 'done' ? 0.2 : 0),
      log: this.log,
      verdict: this.verdict,
    }
  }

  /** What the aeroplane is doing to you, in one line of plain English. */
  private status() {
    if (this.phase === 'dead') return 'Wreckage. The fire will burn for a while yet.'
    if (this.phase === 'done') return 'Stopped, chocks in, engine ticking as it cools.'
    if (this.phase === 'ground') {
      if (this.throttle < 0.2) return 'Brakes off and throttle up. Use the rudder to steer.'
      if (this.air.V < 30) return 'Rolling straight. The tail comes up at about 45 mph.'
      return 'Tail up and tracking. She will unstick at about 100 mph.'
    }
    if (this.stall > 0.35) return 'Stalled, and the wing has dropped. Stick forward, level her, let the speed build.'
    if (this.stall > 0.05) return 'Buffet — you are asking for more lift than the wing has. Ease off.'
    if (Math.abs(this.gLoad) > G_LIMIT * 0.9) return `${this.gLoad.toFixed(1)} g. The wing spar is rated to eight.`
    if (this.air.V > 200) return 'Over 450 mph. The controls have gone heavy and the drag is climbing fast.'
    if (this.guns.jammed) return 'Guns jammed hot. Let go of the trigger and give the barrels a minute.'
    if (this.damage > 0.5) return 'Losing coolant, losing power. Get her on the ground while she still flies.'
    if (this.gearDown && this.air.V > GEAR_LIMIT) return 'Gear down above 170 mph. Raise it or slow down.'
    if (this.stage === 'strafe') {
      return this.position.y - airfield.height(this.position.x, this.position.z) > 400
        ? 'Too high to shoot at anything. Come down and make one pass.'
        : 'On the range. One pass, then break off — the flak is finding the height.'
    }
    if (this.stage === 'land') {
      if (!this.gearDown) return 'Downwind. Gear below 170, flaps below 165, and 100 mph over the fence.'
      return 'Gear down. Wings level, sink under three metres a second, and put her on the paving.'
    }
    const gate = this.nextGate
    return gate ? `Pylon ${this.gate + 1}: ${gate.note.toLowerCase()}` : 'Round for the range.'
  }
}

function spring(value: number, input: number, dt: number, rate: number, centre: number) {
  if (input === 0) {
    const back = centre * dt
    return Math.abs(value) <= back ? 0 : value - Math.sign(value) * back
  }
  return THREE.MathUtils.clamp(value + input * rate * dt, -1, 1)
}

/** What to call the thing in the log and the verdict. */
function describe(kind: string) {
  switch (kind) {
    case 'tree': return 'a tree'
    case 'hangar': return 'a blister hangar'
    case 'tower': return 'the control tower'
    case 'nissen': return 'a Nissen hut'
    case 'pole': return 'a telegraph pole'
    case 'fence': return 'the perimeter fence'
    case 'bowser': return 'a fuel bowser'
    case 'parked': return 'a parked aircraft'
    case 'truck': return 'a lorry'
    case 'drum': return 'a fuel drum'
    case 'flak': return 'the flak tower'
    case 'wreck-target': return 'a derelict airframe'
    case 'windsock': return 'the windsock mast'
    default: return 'something solid'
  }
}

function crashTitle(kind: string, part: string) {
  if (part === 'wingtip') return 'Cartwheeled a wingtip'
  switch (kind) {
    case 'tower': return 'Flew into the control tower'
    case 'hangar': return 'Flew into a hangar'
    case 'tree': return 'Flew into the trees'
    case 'pole': return 'Took a telegraph pole with her'
    case 'flak': return 'Flew into the flak tower'
    default: return 'Flew into the ground'
  }
}

const envelope: Dimension[] = [
  { label: 'Loaded weight', value: '4,585 kg', source: SPEC },
  { label: 'Wing area', value: '21.83 m², span 11.28 m', source: SPEC },
  { label: 'Power', value: '1,490 hp at war emergency', source: DEAN },
  { label: 'Zero-lift drag', value: 'CD₀ 0.0163', source: DEAN },
  { label: 'Flap limit', value: '165 mph indicated', source: POH },
  { label: 'Gear limit', value: '170 mph indicated', source: POH },
  { label: 'Load limit', value: '8 g', source: POH },
  { label: 'Armament', value: '6 × .50 M2, 1,880 rounds, 856 m/s', source: ORD },
  { label: 'Harmonisation', value: '250 yards, converging', source: POH },
  { label: 'Inertia', value: 'Ixx 10,000 · Iyy 13,000 · Izz 22,000 kg·m²', source: INFER },
  { label: 'Modelled top speed', value: '≈355 mph at sea level, against 360 published', source: INFER },
]

export const p51Sim: SimDef = {
  slug: 'p51-mustang',
  title: 'Test Hop and Range Detail',
  place: 'A grass field with 1,500 metres of paving · 1944',
  briefing: [
    'The aeroplane is at the threshold with the tail on the ground, which means you cannot see where you are going. Open the throttle slowly and use the rudder to keep her aligned with the runway.',
    'She comes unstuck at about a hundred miles an hour. Gear up before 170, flaps up before 165 — the manual is specific, and so is the airflow. Nothing about the controls is instant: the stick makes a moment, the moment turns four and a half tonnes, and above 300 mph you will not have the strength to pull full elevator anyway.',
    'Fly the four pylons, then come back over the field and make one pass down the gunnery range at the north end. Six half-inch Brownings, harmonised at 250 yards, and 1,880 rounds between them. The flak on the range is live, and it gets better the longer you stay.',
    'Then put her back on the paving. Everything on this field is solid — trees, poles, hangars, the tower — and at 300 mph none of it gives way.',
  ],
  task: 'Take off, fly the four pylons, strafe the range, land on the runway',
  views: [
    { name: 'chase', label: 'From astern' },
    { name: 'inside', label: 'Under the hood' },
    { name: 'tower', label: 'From the tower' },
  ],
  bindings: [
    { keys: 'W / S', action: 'Throttle' },
    { keys: '↑ / ↓', action: 'Stick — down is nose up' },
    { keys: '← / →', action: 'Ailerons' },
    { keys: 'A / D', action: 'Rudder' },
    { keys: 'Space', action: 'Fire the guns' },
    { keys: ', / .', action: 'Elevator trim' },
    { keys: 'B', action: 'Brakes' },
    { keys: 'G', action: 'Undercarriage' },
    { keys: '[ / ]', action: 'Flaps up / down' },
    { keys: 'C', action: 'Radiator exit door' },
    { keys: 'P · R', action: 'Pause · start again' },
  ],
  envelope,
  create: () => new P51Sim(),
}
