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
import { RUNWAY, airfield, ramp } from './terrain'
import { P51_STANCE, p51GroundRise, p51MainRise } from '../three/stance'

/**
 * A test hop in a P-51D.
 *
 * The aerodynamics are built from the published figures and then checked
 * against one of them that was *not* used as an input: with 1,490 hp, a
 * zero-lift drag coefficient of 0.0163 and 21.83 m² of wing, this model
 * settles at about 355 mph at sea level. The Mustang's published sea-level
 * maximum is 360. Nothing was tuned to make that come out.
 */

const POH: Source = {
  kind: 'text',
  citation: 'AN 01-60JE-1, Pilot’s Flight Operating Instructions, P-51D (1944)',
  note: 'Limiting speeds, flap and gear restrictions, takeoff and landing procedure.',
}
const DEAN: Source = {
  kind: 'text',
  citation: 'Dean, F., America’s Hundred Thousand (Schiffer, 1997)',
  note: 'Measured drag breakdown and flight-test performance for the P-51D.',
}
const SPEC: Source = {
  kind: 'text',
  citation: 'North American Aviation Report NA-8449, Model Specification',
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

const POWER = 1_110_000 // W — 1,490 hp at war emergency
const PROP_EFF = 0.82
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

const FLAP_LIMIT = 73.7 // m/s — 165 mph indicated
const GEAR_LIMIT = 76 // m/s — 170 mph
const G_LIMIT = 8

const MPH = 2.23694
const FT = 3.28084
const DEG = Math.PI / 180

/** The course: four pylons, then bring it home. */
export const GATES = [
  { x: 0, y: 200, z: 1700, r: 62, note: 'Straight out, climbing' },
  { x: 1250, y: 380, z: 3100, r: 62, note: 'Right and up' },
  { x: 1750, y: 240, z: 900, r: 62, note: 'Hard right, back down the field' },
  { x: 500, y: 140, z: -1100, r: 62, note: 'Low pass, then set up to land' },
]

type Phase = 'ground' | 'air' | 'done'

export class P51Sim implements Sim {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()

  private velocity = new THREE.Vector3()
  private wind = new THREE.Vector3(0, 0, 0)
  private phase: Phase = 'ground'

  private throttle = 0
  private gearDown = true
  private flaps = 0 // degrees
  private brakes = 0

  private stick = 0 // +1 = pull
  private aileron = 0
  private pedal = 0

  private pitchRate = 0
  private rollRate = 0
  private yawRate = 0
  private groundPitch = P51_STANCE.pitch

  private att: Attitude = { pitch: 0, bank: 0, heading: 0 }
  private air: Airflow = { V: 0, qbar: 0, alpha: 0, beta: 0 }
  private liftDir = new THREE.Vector3()
  private dragDir = new THREE.Vector3()
  private forward = new THREE.Vector3()
  private up = new THREE.Vector3()
  private right = new THREE.Vector3()
  private force = new THREE.Vector3()

  private gate = 0
  private clock = 0
  private gLoad = 1
  private overG = 0
  private stall = 0
  private log: string[] = []
  private verdict: Readout['verdict']
  private ctl: Controls = {}

  finished = false

  constructor() {
    this.reset()
  }

  reset() {
    this.groundPitch = P51_STANCE.pitch
    this.position.set(0, p51GroundRise(this.groundPitch), -RUNWAY.length / 2 + 60)
    setAttitude(this.quaternion, this.groundPitch, 0, 0)
    this.velocity.set(0, 0, 0)
    this.phase = 'ground'
    this.throttle = 0
    this.gearDown = true
    this.flaps = 0
    this.brakes = 0
    this.stick = this.aileron = this.pedal = 0
    this.pitchRate = this.rollRate = this.yawRate = 0
    this.gate = 0
    this.clock = 0
    this.gLoad = 1
    this.overG = 0
    this.stall = 0
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

  step(dt: number, keys: Keyboard) {
    this.clock += dt

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

    if (this.phase === 'done') {
      this.settle(dt)
      return
    }

    // --- Airflow -----------------------------------------------------------
    bodyAxes(this.quaternion, this.forward, this.up, this.right)
    airflow(this.velocity, this.wind, this.quaternion, this.air, this.liftDir, this.dragDir)
    attitude(this.quaternion, this.att)
    const { V, qbar, alpha, beta } = this.air

    const flapFrac = this.flaps / 50
    const clMax = CL_MAX + 0.4 * flapFrac
    const cl = liftCoefficient(alpha, CL_SLOPE, ALPHA_ZERO - 0.14 * flapFrac, clMax)
    this.stall = stallFraction(alpha, CL_SLOPE, ALPHA_ZERO - 0.14 * flapFrac, clMax)

    let cd = CD0 + K_INDUCED * cl * cl + CD_FLAP * flapFrac * flapFrac
    if (this.gearDown) cd += CD_GEAR
    // Compressibility: the dive limit is a real wall, and it is made of drag.
    cd += 0.05 * ramp(V, 200, 260)

    const lift = qbar * AREA * cl
    const drag = qbar * AREA * cd
    const thrust = Math.min(
      THRUST_STATIC * (0.08 + 0.92 * this.throttle),
      (PROP_EFF * POWER * (0.05 + 0.95 * this.throttle)) / Math.max(V, 22),
    )

    this.gLoad = lift / (MASS * G)

    if (this.phase === 'ground') this.rollOut(dt, thrust, drag, lift)
    else this.fly(dt, thrust, drag, lift, beta)
  }

  // --- On the wheels --------------------------------------------------------
  private rollOut(dt: number, thrust: number, drag: number, lift: number) {
    const V = this.velocity.length()
    const surface = airfield.drag(this.position.x, this.position.z)
    const weightOn = Math.max(0, MASS * G - lift)
    const rolling = surface * weightOn + this.brakes * 0.55 * weightOn
    const along = thrust - drag - rolling

    // The tail comes up when the elevator has enough air to lift it, and the
    // stick decides when. Three-point to level is the whole of the rotation.
    const target = THREE.MathUtils.clamp(
      P51_STANCE.pitch * (1 - ramp(V, 18, 42)) + this.stick * 0.22 * ramp(V, 12, 40),
      -0.02,
      P51_STANCE.pitch,
    )
    this.groundPitch += (target - this.groundPitch) * (1 - Math.exp(-2.5 * dt))

    // 1,490 hp against a fixed fin: the nose goes left, and you argue back.
    // The swing needs the slipstream to exist, so it builds as she starts to
    // roll, peaks around twenty knots, and fades once the fin bites.
    const torque = -0.4 * this.throttle * ramp(V, 0.5, 9) * (1 - ramp(V, 12, 75))
    const steering = this.pedal * (0.25 + 0.55 * ramp(V, 1, 30)) + torque
    this.att.heading += steering * dt * 0.5
    this.yawRate = steering * 0.5

    setAttitude(this.quaternion, this.groundPitch, this.att.heading, 0)
    bodyAxes(this.quaternion, this.forward, this.up, this.right)

    const speed = Math.max(0, V + (along / MASS) * dt)
    this.velocity.copy(this.forward).setY(0).normalize().multiplyScalar(speed)
    this.position.addScaledVector(this.velocity, dt)
    this.position.y = airfield.height(this.position.x, this.position.z) + p51GroundRise(this.groundPitch)

    if (Math.abs(this.position.x) > RUNWAY.halfWidth + 3 && speed > 8) {
      this.say('Off the paving and into the grass — watch the drag.')
    }

    if (lift > MASS * G * 0.99 && speed > 35) {
      this.phase = 'air'
      this.pitchRate = 0
      this.velocity.y = 0.25
      this.say(`Unstuck at ${(speed * MPH).toFixed(0)} mph. Gear up before 170.`)
    }
  }

  // --- In the air -----------------------------------------------------------
  private fly(dt: number, thrust: number, drag: number, lift: number, beta: number) {
    const { V, qbar } = this.air

    this.force.set(0, -MASS * G, 0)
    this.force.addScaledVector(this.liftDir, lift)
    this.force.addScaledVector(this.dragDir, drag)
    this.force.addScaledVector(this.forward, thrust)
    this.force.addScaledVector(this.right, -qbar * AREA * 0.9 * beta)

    this.velocity.addScaledVector(this.force, dt / MASS)
    this.position.addScaledVector(this.velocity, dt)

    // Control authority follows dynamic pressure, falls away in the stall,
    // and stiffens as the air starts to pile up.
    const authority = THREE.MathUtils.clamp(V / 110, 0.12, 1.5) * (1 - 0.55 * this.stall) * (1 - 0.45 * ramp(V, 200, 270))

    // Positive stability: left alone, she looks for her trim speed.
    const trim = 0.045 - 0.1 * (this.flaps / 50)
    const pitchTarget = this.stick * 1.05 * authority - 1.5 * (this.air.alpha - trim) * authority
    const rollTarget = this.aileron * 1.9 * authority
    const yawTarget = (this.pedal * 0.55 + 0.7 * beta) * authority

    this.pitchRate += (pitchTarget - this.pitchRate) * (1 - Math.exp(-4.5 * dt))
    this.rollRate += (rollTarget - this.rollRate) * (1 - Math.exp(-6 * dt))
    this.yawRate += (yawTarget - this.yawRate) * (1 - Math.exp(-3 * dt))
    // Torque roll: still there at low speed and high power.
    this.rollRate += -0.35 * this.throttle * (1 - ramp(V, 40, 110)) * dt
    rotateBody(this.quaternion, this.pitchRate, this.yawRate, this.rollRate, dt)

    // --- Limits ------------------------------------------------------------
    if (Math.abs(this.gLoad) > G_LIMIT) {
      this.overG += dt
      if (this.overG > 0.8) {
        this.end(false, 'Pulled the wings off', [
          `${this.gLoad.toFixed(1)} g. The airframe is rated to ${G_LIMIT}.`,
          'The manual is not a suggestion.',
        ])
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
            : 'Course complete. Bring her back and put her on the paving.',
        )
      }
    }

    // --- Ground ------------------------------------------------------------
    const terrain = airfield.height(this.position.x, this.position.z)
    const wheels = this.gearDown ? p51MainRise(this.att.pitch) : 1.05
    const tip = Math.abs(Math.sin(this.att.bank)) * HALF_SPAN
    const clearance = this.position.y - terrain - Math.max(wheels, tip)

    if (clearance <= 0) this.touchdown(terrain, wheels, tip)
  }

  private touchdown(terrain: number, wheels: number, tip: number) {
    const sink = -this.velocity.y
    const bank = Math.abs(this.att.bank) / DEG
    const speed = this.velocity.length()
    const paved =
      Math.abs(this.position.x) < RUNWAY.halfWidth &&
      Math.abs(this.position.z) < RUNWAY.length / 2

    this.position.y = terrain + Math.max(wheels, tip)

    const lines = [
      `Touchdown at ${(speed * MPH).toFixed(0)} mph, ${sink.toFixed(1)} m/s of sink, ${bank.toFixed(0)}° of bank.`,
      `${this.gate} of ${GATES.length} pylons flown in ${this.clock.toFixed(0)} seconds.`,
    ]

    if (!this.gearDown) {
      this.end(false, 'Landed on the radiator', [
        ...lines,
        'The scoop under the spar is not undercarriage. Gear is the G key.',
      ])
      return
    }
    if (bank > 10) {
      this.end(false, 'Wingtip first', [...lines, 'Level the wings before the wheels arrive.'])
      return
    }
    if (sink > 3.5 || speed > 62) {
      this.end(false, 'Arrived rather than landed', [
        ...lines,
        'Below 100 mph over the fence, with full flap. That is what the flaps are for.',
      ])
      return
    }
    if (!paved) {
      this.end(false, 'Down in the field', [
        ...lines,
        'A good landing, on the wrong 1,500 metres of England.',
      ])
      return
    }
    this.phase = 'done'
    this.end(this.gate === GATES.length, this.gate === GATES.length ? 'Down, and the card is clean' : 'Down, course incomplete', lines)
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
    this.verdict = { good, title, lines }
    this.finished = true
    this.phase = 'done'
  }

  controls() {
    this.ctl.throttle = this.throttle * 100
    this.ctl.gear = this.gearDown ? 1 : 0
    this.ctl.flaps = this.flaps
    this.ctl.canopy = 0
    this.ctl.roll = this.aileron * 10
    this.ctl.elevator = this.stick > 0 ? this.stick * 30 : this.stick * 20
    this.ctl.rudder = this.pedal * 30
    return this.ctl
  }

  camera(view: ViewName, eye: THREE.Vector3, aim: THREE.Vector3) {
    bodyAxes(this.quaternion, this.forward, this.up, this.right)
    if (view === 'inside') {
      // Head in the bubble hood. The nose is in the way, which is the point.
      eye.copy(this.position)
        .addScaledVector(this.forward, 0.55)
        .addScaledVector(this.up, 0.72)
      aim.copy(eye).addScaledVector(this.forward, 40).addScaledVector(this.up, 1.5)
      return 68
    }
    if (view === 'tower') {
      eye.set(RUNWAY.halfWidth + 40, airfield.height(60, -620) + 9, -620)
      aim.copy(this.position)
      return 30
    }
    eye.copy(this.position)
      .addScaledVector(this.forward, -26)
      .addScaledVector(this.up, 7)
    aim.copy(this.position).addScaledVector(this.forward, 12)
    return 45
  }

  readout(): Readout {
    const V = this.air.V
    const alt = (this.position.y - airfield.height(this.position.x, this.position.z)) * FT
    const vs = this.velocity.y * FT * 60
    const gate = this.nextGate
    const bearing = gate
      ? ((Math.atan2(gate.x - this.position.x, gate.z - this.position.z) / DEG + 360) % 360)
      : 0
    const range = gate
      ? Math.hypot(gate.x - this.position.x, gate.z - this.position.z) / 1000
      : 0

    return {
      gauges: [
        { label: 'Throttle', value: (this.throttle * 100).toFixed(0), unit: '%', bar: this.throttle },
        { label: 'Manifold', value: (10 + this.throttle * 51).toFixed(0), unit: 'inHg' },
        { label: 'Engine', value: (1200 + this.throttle * 1800).toFixed(0), unit: 'rpm' },
        { label: 'Indicated', value: (V * MPH).toFixed(0), unit: 'mph', warn: this.stall > 0.15 },
        { label: 'Altitude', value: alt.toFixed(0), unit: 'ft' },
        { label: 'Climb', value: (vs > 0 ? '+' : '') + vs.toFixed(0), unit: 'ft/min' },
        { label: 'Load', value: this.gLoad.toFixed(1), unit: 'g', warn: Math.abs(this.gLoad) > G_LIMIT },
        { label: 'Bank', value: (this.att.bank / DEG).toFixed(0), unit: '°' },
        { label: 'Flaps', value: this.flaps.toFixed(0), unit: '°', warn: this.flaps > 0 && V > FLAP_LIMIT },
        { label: 'Gear', value: this.gearDown ? 'Down' : 'Up', warn: this.gearDown && V > GEAR_LIMIT },
        gate
          ? { label: 'Next pylon', value: `${range.toFixed(1)} km · ${bearing.toFixed(0)}°` }
          : { label: 'Course', value: 'Complete' },
      ],
      status:
        this.phase === 'ground'
          ? this.throttle < 0.2
            ? 'Brakes off, throttle up. She will pull left — hold her with the rudder.'
            : 'Rolling. Unstick at about 100 mph.'
          : this.phase === 'done'
            ? 'Stopped.'
            : this.stall > 0.2
              ? 'Stalled. Unload, let the speed build, then fly her out.'
              : gate
                ? `Pylon ${this.gate + 1}: ${gate.note.toLowerCase()}`
                : 'Course flown. Gear down, flaps out, land on the paving.',
      task: gate
        ? `Fly the four pylons — ${this.gate} down`
        : 'Land on the runway: gear down, wings level, under 100 mph',
      progress: (this.gate + (this.phase === 'done' && this.verdict?.good ? 1 : 0)) / (GATES.length + 1),
      log: this.log,
      verdict: this.verdict,
    }
  }
}

function spring(value: number, input: number, dt: number, rate: number, centre: number) {
  if (input === 0) {
    const back = centre * dt
    return Math.abs(value) <= back ? 0 : value - Math.sign(value) * back
  }
  return THREE.MathUtils.clamp(value + input * rate * dt, -1, 1)
}

const envelope: Dimension[] = [
  { label: 'Loaded weight', value: '4,585 kg', source: SPEC },
  { label: 'Wing area', value: '21.83 m², span 11.28 m', source: SPEC },
  { label: 'Power', value: '1,490 hp at war emergency', source: DEAN },
  { label: 'Zero-lift drag', value: 'CD₀ 0.0163', source: DEAN },
  { label: 'Flap limit', value: '165 mph indicated', source: POH },
  { label: 'Gear limit', value: '170 mph indicated', source: POH },
  { label: 'Load limit', value: '8 g', source: POH },
  { label: 'Modelled top speed', value: '≈355 mph at sea level, against 360 published', source: INFER },
]

export const p51Sim: SimDef = {
  slug: 'p51-mustang',
  title: 'Test Hop',
  place: 'A grass field with 1,500 metres of paving · 1944',
  briefing: [
    'The aeroplane is at the threshold with the tail on the ground, which means you cannot see where you are going. Open the throttle slowly: 1,490 horsepower through a four-bladed propeller will try to take the nose to the left, and the rudder is how you argue back.',
    'She comes unstuck at about a hundred miles an hour. Gear up before 170, flaps up before 165 — the manual is specific, and so is the airflow.',
    'Then fly the four pylons and put her back on the paving. The wing that makes her fast at altitude also makes her stall without much warning, so watch the airspeed on the turn onto final.',
  ],
  task: 'Take off, fly the four pylons, land on the runway',
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
    { keys: 'B', action: 'Brakes' },
    { keys: 'G', action: 'Undercarriage' },
    { keys: '[ / ]', action: 'Flaps up / down' },
    { keys: 'V · P · R', action: 'View · pause · start again' },
  ],
  envelope,
  create: () => new P51Sim(),
}
