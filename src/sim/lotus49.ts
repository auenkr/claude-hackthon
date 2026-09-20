import * as THREE from 'three'
import type { Controls, Dimension, Source } from '../types'
import type { Keyboard } from './keyboard'
import type { Readout, Sim, SimDef, ViewName } from './types'
import { G, RHO } from './flight'
import {
  circuit as field,
  nearestOnTrack,
  START_INDEX,
  TRACK,
  TRACK_LENGTH,
  TRACK_LINE,
  type Nearest,
} from './fields/circuit'

/**
 * Three laps, Zandvoort 1967.
 *
 * Two facts about the 49 do most of the work. The DFV makes almost nothing
 * below six thousand and everything above eight, so the gear you are in
 * matters more than how hard you press. And the car weighs five hundred kilos
 * on tyres narrower than a modern road car's: there is very little grip, and
 * what there is has to be shared between turning and accelerating.
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

const DEG = Math.PI / 180

// --- Car ------------------------------------------------------------------
const MASS = 590 // kg: the 506 kg car with driver and fuel for three laps
const P_MAX = 304_000 // W — 408 hp
const RPM_IDLE = 2200
const RPM_PEAK = 9000
const RPM_LIMIT = 9500
const WHEELBASE = 2.36
const GAUGE = 1.53
const LOCK = 25 * DEG
/** Frontal drag area without a wing: open wheels and a driver in the wind. */
const CDA = 0.92 // m²
/** The 49B's strutted rear wing. Effective, and unsprung. */
const WING_CLA = 1.15 // m²
const WING_CDA = 0.28 // m²
const REAR_SHARE = 0.6 // static load on the driven axle
const BRAKE_G = 1.15
const MU_TARMAC = 1.3
const MU_KERB = 1.05
const MU_GRASS = 0.55
/** Road speed at the 9,000 rpm peak in each of the ZF's five gears. */
const GEAR_TOP = [85, 125, 170, 220, 292].map((k) => k / 3.6)
const SHIFT_TIME = 0.22 // s of no drive while the dog rings engage
const LAPS = 3
const MAX_OFFS = 8

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

export class Lotus49Sim implements Sim {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()

  private heading = 0
  private pitch = 0
  private bank = 0
  private speed = 0
  private throttle = 0
  private brakes = 0
  private steer = 0
  private delta = 0
  private gear = 1
  private rpm = RPM_IDLE
  private shift = 0
  private wing = 0

  private sliding = false
  private spinning = false
  private off = false
  private offs = 0

  private clock = 0
  private distance = 0
  private lastS = 0
  private laps = 0
  private lapStart = 0
  private lastLap = Infinity
  private bestLap = Infinity

  private forward = new THREE.Vector3()
  private near: Nearest = { dist: 0, s: 0, index: 0 }
  private log: string[] = []
  private verdict: Readout['verdict']
  private ctl: Controls = {}

  finished = false

  constructor() {
    this.reset()
  }

  reset() {
    const start = TRACK_LINE[START_INDEX]
    this.heading = Math.atan2(start.tx, start.tz)
    this.pitch = 0
    this.bank = 0
    this.speed = 0
    this.throttle = 0
    this.brakes = 0
    this.steer = 0
    this.delta = 0
    this.gear = 1
    this.rpm = RPM_IDLE
    this.shift = 0
    this.wing = 0
    this.sliding = false
    this.spinning = false
    this.off = false
    this.offs = 0
    this.clock = 0
    this.distance = 0
    this.lastS = start.s
    this.laps = 0
    this.lapStart = 0
    this.lastLap = Infinity
    this.bestLap = Infinity
    this.position.set(start.x, field.height(start.x, start.z), start.z)
    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.quaternion.setFromEuler(euler.set(0, this.heading, 0, 'YXZ'))
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

  step(dt: number, keys: Keyboard) {
    this.clock += dt

    // --- Driver ------------------------------------------------------------
    const gas = keys.down('KeyW') ? 1 : 0
    const pedal = keys.down('KeyS') ? 1 : 0
    this.throttle = THREE.MathUtils.clamp(this.throttle + (gas ? dt * 3.5 : -dt * 5), 0, 1)
    this.brakes = THREE.MathUtils.clamp(this.brakes + (pedal ? dt * 4 : -dt * 6), 0, 1)
    this.steer = spring(this.steer, keys.axis(['ArrowLeft'], ['ArrowRight']), dt, 2.6, 4.5)

    if (this.shift <= 0) {
      if (keys.tapped('ArrowUp') && this.gear < 5) {
        this.gear++
        this.shift = SHIFT_TIME
      } else if (keys.tapped('ArrowDown') && this.gear > 1) {
        this.gear--
        this.shift = SHIFT_TIME
      }
    }
    this.shift = Math.max(0, this.shift - dt)

    if (keys.tapped('KeyG')) {
      this.wing = this.wing ? 0 : 1
      this.say(
        this.wing
          ? 'Wing fitted. More grip at speed, and a little less of it.'
          : 'Wing off. Zandvoort 1967 specification.',
      )
    }

    // --- Surface -----------------------------------------------------------
    nearestOnTrack(this.position.x, this.position.z, this.near)
    const onTarmac = this.near.dist <= TRACK.halfWidth
    const onKerb = !onTarmac && this.near.dist <= TRACK.halfWidth + TRACK.kerb
    const mu = onTarmac ? MU_TARMAC : onKerb ? MU_KERB : MU_GRASS
    if (!onTarmac && !onKerb) {
      if (!this.off) {
        this.off = true
        this.offs++
        this.say(`Off the circuit — ${this.offs} of ${MAX_OFFS} allowed.`)
      }
    } else if (onTarmac) {
      this.off = false
    }

    const v = this.speed
    const q = 0.5 * RHO * v * v
    const downforce = this.wing * q * WING_CLA
    const load = MASS * G + downforce
    const rearLoad = MASS * G * REAR_SHARE + downforce

    // --- Engine ------------------------------------------------------------
    // Below walking pace the clutch is slipping, so the engine holds idle.
    this.rpm = Math.max(RPM_IDLE, (v / GEAR_TOP[this.gear - 1]) * RPM_PEAK)
    const limiter = this.rpm >= RPM_LIMIT
    const power = this.shift > 0 || limiter ? 0 : P_MAX * powerCurve(this.rpm) * this.throttle
    let drive = power / Math.max(v, 3)

    // --- Cornering ---------------------------------------------------------
    // The rack gives 25° of lock. The driver's hands give only what the tyres
    // can use: nobody can feel the slip peak through a keyboard, so the wheel
    // is modelled as saturating a little past it rather than winding on to
    // the stop — which at 150 km/h would spin the car on the spot.
    const ayMax = (mu * load) / MASS
    const usable = v > 1 ? Math.atan((1.35 * ayMax * WHEELBASE) / (v * v)) : LOCK
    this.delta = this.steer * Math.min(LOCK, usable)
    const ayWant = (v * v * Math.tan(this.delta)) / WHEELBASE
    const demand = Math.abs(ayWant) / Math.max(ayMax, 0.01)
    // Tyres saturate gently: past the peak, more lock buys nothing but scrub.
    const ay = Math.sign(ayWant) * ayMax * Math.tanh(demand)
    this.sliding = demand > 1.15 && v > 2
    const lateralUse = Math.abs(ay) / Math.max(ayMax, 0.01)
    if (v > 0.3) this.heading += (ay / v) * dt

    // --- Friction circle: grip used sideways is not available lengthways ---
    // A floor keeps some braking through a slide; a locked front still slows.
    const spare = Math.max(0.2, Math.sqrt(Math.max(0, 1 - lateralUse * lateralUse)))
    const tractionCap = mu * rearLoad * spare
    this.spinning = drive > tractionCap && v < 60 && this.throttle > 0.1
    drive = Math.min(drive, tractionCap)

    const brake = this.brakes * Math.min(BRAKE_G * MASS * G, mu * load * spare)
    const aero = q * (CDA + this.wing * WING_CDA)
    const rolling = MASS * G * field.drag(this.position.x, this.position.z)
    const engineBrake = this.throttle < 0.05 ? 0.012 * MASS * G * (this.rpm / RPM_PEAK) : 0
    const scrub = this.sliding ? 0.25 * MASS * G * Math.min(1, demand - 1) : 0

    let force = drive
    if (v > 0.05) force -= aero + rolling + brake + engineBrake + scrub
    this.speed = Math.max(0, v + (force / MASS) * dt)
    if (!gas && this.speed < 0.15) this.speed = 0

    // --- Ground ------------------------------------------------------------
    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.position.addScaledVector(this.forward, this.speed * dt)
    this.conform(dt)

    // --- Lap timing --------------------------------------------------------
    let ds = this.near.s - this.lastS
    if (ds > TRACK_LENGTH / 2) ds -= TRACK_LENGTH
    if (ds < -TRACK_LENGTH / 2) ds += TRACK_LENGTH
    this.distance += ds
    this.lastS = this.near.s

    if (!this.finished) {
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
            `Best lap ${lapTime(this.bestLap)}, ${this.offs} excursion${this.offs === 1 ? '' : 's'}.`,
            this.offs === 0
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
  }

  /** Sit the car on the ground at all four wheels. Racing springs, so stiff. */
  private conform(dt: number) {
    const s = Math.sin(this.heading)
    const c = Math.cos(this.heading)
    const sample = (dz: number, dx: number) =>
      field.height(this.position.x + dz * s + dx * c, this.position.z + dz * c - dx * s)
    const fl = sample(WHEELBASE / 2, -GAUGE / 2)
    const fr = sample(WHEELBASE / 2, GAUGE / 2)
    const rl = sample(-WHEELBASE / 2, -GAUGE / 2)
    const rr = sample(-WHEELBASE / 2, GAUGE / 2)

    const height = (fl + fr + rl + rr) / 4
    const pitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, WHEELBASE)
    const bank = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, GAUGE)

    const k = 1 - Math.exp(-10 * dt)
    this.position.y += (height - this.position.y) * k
    this.pitch += (pitch - this.pitch) * k
    // A little roll into the corner, the way a car on soft 1967 springs did.
    const roll = this.sliding ? 0 : (this.delta * this.speed) / 90
    this.bank += (bank + roll - this.bank) * k

    euler.set(-this.pitch, this.heading, -this.bank, 'YXZ')
    this.quaternion.setFromEuler(euler)
  }

  private end(good: boolean, title: string, lines: string[]) {
    this.verdict = { good, title, lines }
    this.finished = true
  }

  controls() {
    this.ctl.throttle = this.throttle * 100
    this.ctl.steering = this.delta / DEG
    this.ctl.wing = this.wing * 100
    this.ctl.noseCone = 0
    // Not a panel control: lets the reconstruction spin its wheels to speed.
    this.ctl.speed = this.speed * 3.6
    return this.ctl
  }

  camera(view: ViewName, eye: THREE.Vector3, aim: THREE.Vector3) {
    if (view === 'inside') {
      eye.set(0, 0.86, 0.45).applyQuaternion(this.quaternion).add(this.position)
      aim.copy(eye).addScaledVector(this.forward, 80)
      aim.y -= 0.6
      return 64
    }
    if (view === 'tower') {
      eye.set(-30, field.height(-30, -40) + 11, -40)
      aim.copy(this.position)
      return 22
    }
    eye.copy(this.position).addScaledVector(this.forward, -8.5)
    eye.y += 2.4
    aim.copy(this.position).addScaledVector(this.forward, 5)
    aim.y += 0.6
    return 52
  }

  readout(): Readout {
    const kmh = this.speed * 3.6
    const lapNow = Math.min(LAPS, this.laps + 1)
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
        { label: 'Lap', value: `${lapNow} / ${LAPS}` },
        { label: 'Last lap', value: lapTime(this.lastLap) },
        { label: 'Best lap', value: lapTime(this.bestLap) },
        { label: 'Wing', value: this.wing ? '49B, fitted' : 'None' },
        { label: 'Off circuit', value: `${this.offs}`, warn: this.offs > MAX_OFFS - 3 },
      ],
      status: this.finished
        ? 'Exercise over.'
        : this.off
          ? 'On the grass — half the grip, six times the drag.'
          : this.spinning
            ? 'Rear wheels spinning. Feather it.'
            : this.sliding
              ? 'Sliding. The tyres have nothing left.'
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

const euler = new THREE.Euler(0, 0, 0, 'YXZ')

const envelope: Dimension[] = [
  { label: 'Minimum weight', value: '500 kg dry; 590 kg modelled with driver', source: REGS },
  { label: 'Engine', value: 'Ford-Cosworth DFV, 408 hp at 9,000 rpm', source: COSWORTH },
  { label: 'Power band', value: 'Little below 6,000 rpm — modelled as rpm²·²', source: INFER },
  { label: 'Gearbox', value: 'ZF 5DS-25, five speeds', source: NYE },
  { label: 'Top speed', value: '≈ 290 km/h in fifth', source: INFER },
  { label: 'Wheelbase', value: '2.36 m', source: NYE },
  { label: 'Tyre grip', value: '1.3 g on tarmac, 0.55 g on grass', source: INFER },
  { label: 'Rear wing', value: '49B high wing, ≈ 1.15 m² lift area', source: INFER },
  { label: 'Circuit', value: `${(TRACK_LENGTH / 1000).toFixed(2)} km, in the manner of Zandvoort`, source: INFER },
]

export const lotus49Sim: SimDef = {
  slug: 'lotus-49',
  title: 'Debut',
  place: 'A circuit in the dunes, laid out in the manner of Zandvoort, 1967',
  briefing: [
    'You are in the car Jim Clark took to victory on its first outing. The DFV behind you makes 408 horsepower, almost all of it above eight thousand rpm and almost none of it below six — the gear you are in decides what you have.',
    'The car weighs five hundred kilos on narrow treaded tyres, and every bit of grip has to be shared. Turn and accelerate at once and the rear will spin up; brake and turn at once and the front will wash out. Leave the tarmac and the grass gives you half the grip and six times the drag.',
    'The tall wing on struts came a year later, and you may fit it: more grip at speed, in exchange for drag and a little less top speed. Three laps. Stay on the circuit.',
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
    { keys: 'V · P · R', action: 'View · pause · start again' },
  ],
  envelope,
  create: () => new Lotus49Sim(),
}
