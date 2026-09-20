import * as THREE from 'three'
import type { Controls, Dimension, Source } from '../types'
import type { Keyboard } from './keyboard'
import type { Readout, Sim, SimDef, ViewName } from './types'
import { G, RHO, setAttitude } from './flight'
import { AVENUE, boulevard as field } from './terrain'
import { VELO } from '../three/stance'

/**
 * Down the Champs-Élysées, 1869.
 *
 * Two facts do the work. The drive is direct, so road speed is cadence and
 * nothing else: at 120 turns a minute of a 36-inch wheel the rider is doing
 * 20 km/h and cannot pedal faster, whatever the hill offers. And a
 * two-wheeler stays up only by steering underneath its own fall, which takes
 * speed — below a brisk walk the steering cannot answer quickly enough and
 * the machine goes over.
 */

const HERLIHY: Source = {
  kind: 'text',
  citation: 'Herlihy, D. V., Bicycle: The History (Yale, 2004)',
}
const LALLEMENT: Source = {
  kind: 'text',
  citation: 'Lallement, P., US Patent 59,915 (1866)',
}
const SMG: Source = {
  kind: 'artifact',
  citation: 'Michaux-type velocipede, c. 1869, Science Museum Group collection',
}
const INFER: Source = {
  kind: 'inference',
  citation: 'Derived for this simulation from the cited weight, wheel size and period accounts',
}

// --- Machine and rider ------------------------------------------------------
const MACHINE = 27 // kg
const RIDER = 72
const MASS = MACHINE + RIDER
const CG_H = 0.95 // m, rider and machine together
const L = VELO.frontZ - VELO.rearZ
const R = VELO.frontR
const ROAD_PER_TURN = 2 * Math.PI * R

const POWER = 180 // W, sustained by a fit amateur
const PEDAL_FORCE = 350 // N, seated, on the pedal
const CADENCE_MAX = 120 // rpm — legs cannot follow the cranks beyond this
const CDA = 0.62 // m², upright, in an 1869 coat
const SPOON = 130 // N — iron on iron, on a lightly loaded wheel
const BACK_PEDAL = 160 // N, resisting the cranks with the legs

const STEER_MAX = 40 * (Math.PI / 180)
const LEAN_INPUT = 9 * (Math.PI / 180)
const HOLD_MAX = 6 * (Math.PI / 180)
const FALL = 42 * (Math.PI / 180)
const PUSH_OFF = 1.7 // m/s
const KP = 4.2
const KD = 1.3

export const FINISH = 600 // m down the avenue
const MOORE = 11.5 // km/h, James Moore's average, Paris–Rouen, November 1869

const DEG = Math.PI / 180

type Phase = 'stand' | 'riding' | 'over'

export class VelocipedeSim implements Sim {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()

  private phase: Phase = 'stand'
  private heading = 0
  private speed = 0
  private roll = 0
  private rollRate = 0
  private steer = 0
  private leanInput = 0
  private leanTarget = 0
  private pitch = 0
  private braking = false
  private pedalling = false
  private spunOut = false

  private travel = 0
  private clock = 0
  private crossed = 0
  private jolt = 0
  private joltTarget = 0
  private joltClock = 0

  private forward = new THREE.Vector3(0, 0, 1)
  private log: string[] = []
  private verdict: Readout['verdict']
  private ctl: Controls = {}

  finished = false

  constructor() {
    this.reset()
  }

  reset() {
    this.phase = 'stand'
    this.heading = 0
    this.speed = 0
    this.roll = 0
    this.rollRate = 0
    this.steer = 0
    this.leanInput = 0
    this.leanTarget = 0
    this.pitch = 0
    this.braking = false
    this.pedalling = false
    this.spunOut = false
    this.travel = 0
    this.clock = 0
    this.crossed = 0
    this.jolt = 0
    this.joltTarget = 0
    this.joltClock = 0
    this.position.set(0, field.height(0, 0), 0)
    this.forward.set(0, 0, 1)
    this.conform()
    this.verdict = undefined
    this.finished = false
    this.log = [
      'In the saddle at the Étoile, one foot on the setts.',
      'Space to push off. The machine will not stand still.',
    ]
  }

  private say(line: string) {
    this.log.push(line)
    if (this.log.length > 6) this.log.shift()
  }

  step(dt: number, keys: Keyboard) {
    if (this.finished) return
    this.clock += dt

    const lean = keys.axis(['ArrowLeft'], ['ArrowRight'])
    this.leanInput = approach(this.leanInput, lean, dt, 2.6, 3.2)
    // The rider is aiming down the avenue: the arrow keys ask for a turn
    // against that, and letting go brings the heading back to straight.
    const straighten = THREE.MathUtils.clamp(this.heading * 0.8, -HOLD_MAX, HOLD_MAX)
    this.leanTarget = this.leanInput * LEAN_INPUT - straighten
    this.braking = keys.down('KeyS')
    const pedal = keys.down('KeyW')

    if (this.phase === 'stand') {
      this.speed = 0
      this.roll += (0 - this.roll) * (1 - Math.exp(-8 * dt))
      this.rollRate = 0
      if (keys.tapped('Space')) {
        this.phase = 'riding'
        this.speed = PUSH_OFF
        this.say('Pushed off. Pedal, and keep it moving.')
      }
      this.conform()
      return
    }

    // --- Legs and brake ------------------------------------------------------
    const cadence = (this.speed / ROAD_PER_TURN) * 60
    const legs = 1 - clamp01((cadence - 100) / (CADENCE_MAX - 100))
    if (cadence > CADENCE_MAX && !this.spunOut) {
      this.spunOut = true
      this.say('The cranks are outrunning your legs — feet up on the rests.')
    }
    if (cadence < 95) this.spunOut = false

    this.pedalling = pedal && legs > 0
    let force = 0
    if (this.pedalling) {
      force = Math.min(POWER / Math.max(this.speed, 0.6), (PEDAL_FORCE * VELO.crank) / R) * legs
    }

    const rolling = MASS * G * field.drag(this.position.x, this.position.z)
    const aero = 0.5 * RHO * CDA * this.speed * this.speed
    const slope = MASS * G * Math.sin(this.pitch)
    force -= rolling + aero + slope
    if (this.braking) force -= SPOON + BACK_PEDAL * legs

    this.speed = Math.max(0, this.speed + (force / MASS) * dt)
    this.travel += this.speed * dt

    // --- Balance -------------------------------------------------------------
    // The rider steers under the fall: enough lock to hold the wanted lean,
    // plus a correction for the error and the rate. All of it is limited by
    // the forty degrees the fork will turn, and by the speed available.
    const v = Math.max(this.speed, 0.3)
    const hold = Math.atan((G * L * Math.tan(this.leanTarget)) / (v * v))
    const wanted = hold + KP * (this.roll - this.leanTarget) + KD * this.rollRate
    this.steer = approach(this.steer, THREE.MathUtils.clamp(wanted, -STEER_MAX, STEER_MAX), dt, 14, 14, true)

    // The setts: a random shove every few decimetres, worse the faster you go.
    this.joltClock -= dt
    if (this.joltClock <= 0) {
      this.joltClock = 0.12 + Math.random() * 0.1
      this.joltTarget = (Math.random() - 0.5) * 2 * (0.25 + 0.06 * this.speed)
    }
    this.jolt += (this.joltTarget - this.jolt) * (1 - Math.exp(-12 * dt))

    const centripetal = (this.speed * this.speed * Math.tan(this.steer)) / L
    const rollAccel =
      (G / CG_H) * Math.sin(this.roll) - (centripetal / CG_H) * Math.cos(this.roll) + this.jolt
    this.rollRate += rollAccel * dt
    this.rollRate *= Math.exp(-0.4 * dt)
    this.roll += this.rollRate * dt

    this.heading += (this.speed * Math.tan(this.steer)) / L * dt
    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading))
    this.position.addScaledVector(this.forward, this.speed * dt)
    this.conform()

    // --- How it ends ---------------------------------------------------------
    if (Math.abs(this.roll) > FALL) {
      this.end(false, 'Down on the setts', [
        `${this.travel.toFixed(0)} m from the Étoile, at ${(this.speed * 3.6).toFixed(0)} km/h.`,
        this.speed < 1.8
          ? 'Too slow. Below a walking pace the steering cannot get under the fall in time.'
          : 'The cobbles put it over. There is no suspension between you and them but a leaf spring.',
      ])
      return
    }
    if (Math.abs(this.position.x) > AVENUE.halfWidth + 0.3) {
      if (this.speed > 1.2) {
        this.end(false, 'Into the kerb', [
          `${this.travel.toFixed(0)} m from the Étoile.`,
          'An iron tyre meets a granite kerb. Lean the other way sooner, and less.',
        ])
        return
      }
      this.speed = 0
    }

    if (!this.crossed && this.position.z >= FINISH) {
      this.crossed = this.clock
      this.say(`Past the stone at ${this.clock.toFixed(0)} s. Now stop.`)
    }

    if (this.speed < 0.4) {
      if (this.crossed) {
        const over = this.position.z - FINISH
        const kmh = (FINISH / this.crossed) * 3.6
        this.end(true, 'At the Rond-Point end', [
          `${FINISH} m in ${this.crossed.toFixed(0)} s — ${kmh.toFixed(1)} km/h over the ground.`,
          over > 8
            ? `Stopped ${over.toFixed(0)} m past the stone. The spoon is not much of a brake.`
            : `Stopped ${over.toFixed(0)} m past the stone.`,
          kmh > MOORE
            ? `Faster than James Moore’s ${MOORE} km/h to Rouen — though he kept it up for ten hours.`
            : `James Moore averaged ${MOORE} km/h all the way to Rouen.`,
        ])
      } else {
        this.phase = 'stand'
        this.speed = 0
        this.say('Feet down. Space to push off again.')
      }
    }
  }

  /** Sit the wheels on the setts, and shake the rider as the name promises. */
  private conform() {
    const fx = this.position.x + this.forward.x * VELO.frontZ
    const fz = this.position.z + this.forward.z * VELO.frontZ
    const rx = this.position.x + this.forward.x * VELO.rearZ
    const rz = this.position.z + this.forward.z * VELO.rearZ
    const hf = field.height(fx, fz)
    const hr = field.height(rx, rz)
    this.pitch = Math.atan2(hf - hr, L)
    const shake = 0.008 * Math.sin((this.travel / 0.14) * Math.PI * 2) * Math.min(1, this.speed / 2)
    this.position.y = (hf + hr) / 2 + shake
    setAttitude(this.quaternion, this.pitch, this.heading, this.roll)
  }

  private end(good: boolean, title: string, lines: string[]) {
    this.verdict = { good, title, lines }
    this.finished = true
    this.phase = 'over'
  }

  controls() {
    this.ctl.speed = this.speed * 3.6
    this.ctl.steer = this.steer / DEG
    // The body quaternion already carries the lean.
    this.ctl.lean = 0
    this.ctl.brake = this.braking ? 1 : 0
    return this.ctl
  }

  camera(view: ViewName, eye: THREE.Vector3, aim: THREE.Vector3) {
    if (view === 'inside') {
      eye.set(0, 1.55, -0.05).applyQuaternion(this.quaternion).add(this.position)
      aim.set(0, 0.7, 10).applyQuaternion(this.quaternion).add(this.position)
      return 62
    }
    if (view === 'tower') {
      const z = this.position.z + 4
      eye.set(-11.5, field.height(-11.5, z) + 1.65, z)
      aim.copy(this.position)
      aim.y += 0.7
      return 38
    }
    eye.copy(this.position).addScaledVector(this.forward, -4.2)
    eye.y += 1.7
    aim.copy(this.position).addScaledVector(this.forward, 3)
    aim.y += 0.8
    return 46
  }

  readout(): Readout {
    const kmh = this.speed * 3.6
    const cadence = (this.speed / ROAD_PER_TURN) * 60
    const grade = Math.tan(this.pitch) * 100

    const status =
      this.phase === 'over'
        ? 'Run over.'
        : this.phase === 'stand'
          ? 'Standing. Space pushes off.'
          : cadence > CADENCE_MAX
            ? 'Cranks outrunning your legs. Feet on the rests; the spoon is all you have.'
            : this.speed < 1.8
              ? 'Too slow to balance — pedal.'
              : this.braking
                ? 'Spoon on the tyre, legs resisting the cranks.'
                : this.pedalling
                  ? 'Pedalling. Each turn of the cranks is 2.87 m of road.'
                  : 'Coasting. The pedals keep turning under your feet.'

    return {
      gauges: [
        { label: 'Speed', value: kmh.toFixed(1), unit: 'km/h', bar: kmh / 24 },
        {
          label: 'Cadence',
          value: cadence.toFixed(0),
          unit: 'rpm',
          bar: cadence / CADENCE_MAX,
          warn: cadence > 105,
        },
        {
          label: 'Lean',
          value: (this.roll / DEG).toFixed(1),
          unit: '°',
          warn: Math.abs(this.roll) > 22 * DEG,
        },
        { label: 'Steer', value: (this.steer / DEG).toFixed(0), unit: '°' },
        { label: 'Distance', value: this.travel.toFixed(0), unit: 'm' },
        { label: 'Grade', value: grade.toFixed(1), unit: '%' },
        { label: 'Brake', value: this.braking ? 'Spoon on' : 'Off', warn: this.braking },
        { label: 'Time', value: this.clock.toFixed(1), unit: 's' },
      ],
      status,
      task: this.crossed
        ? 'Past the stone — now stop'
        : `Ride ${FINISH} m down the avenue to the stone, and stop`,
      progress: THREE.MathUtils.clamp(this.position.z / FINISH, 0, 1),
      log: this.log,
      verdict: this.verdict,
    }
  }
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

/** Move a value toward its input: quick to apply, slower to centre. */
function approach(
  value: number,
  input: number,
  dt: number,
  rate: number,
  centre: number,
  absolute = false,
) {
  if (absolute) {
    const d = input - value
    const step = rate * dt
    return Math.abs(d) <= step ? input : value + Math.sign(d) * step
  }
  if (input === 0) {
    const back = centre * dt
    return Math.abs(value) <= back ? 0 : value - Math.sign(value) * back
  }
  return THREE.MathUtils.clamp(value + input * rate * dt, -1, 1)
}

const envelope: Dimension[] = [
  { label: 'Machine weight', value: '≈ 27 kg', source: HERLIHY },
  { label: 'Rider', value: '72 kg, seated at 0.95 m', source: INFER },
  { label: 'Front wheel', value: '36 in — 2.87 m per turn', source: SMG },
  { label: 'Drive', value: 'Direct: cranks keyed to the front axle', source: LALLEMENT },
  { label: 'Cadence limit', value: '120 rpm — 20.7 km/h', source: INFER },
  { label: 'Rider power', value: '180 W sustained, 350 N on the pedal', source: INFER },
  { label: 'Rolling resistance', value: 'Iron tyre on setts, 0.020', source: INFER },
  { label: 'Spoon brake', value: '≈ 130 N at the rear tyre', source: INFER },
  { label: 'The avenue', value: '4 % down from the Étoile, easing to 1.3 %', source: INFER },
]

export const velocipedeSim: SimDef = {
  slug: 'velocipede',
  title: 'Down the Avenue',
  place: 'Champs-Élysées, Paris · spring 1869',
  briefing: [
    'You are on the saddle at the Étoile with one foot on the setts, and the avenue falls away in front of you for a kilometre. In 1869 this is where Paris came to watch people fall off velocipedes, and to try one.',
    'The machine will not stand still, and it will not balance slowly. A two-wheeler stays up by steering underneath its own fall, and the steering only answers at speed — push off hard and pedal at once. Lean with the arrow keys; the rider steers to hold the lean. The setts will shove you about the whole way.',
    'The drive is direct, so your legs set the speed: at a hundred and twenty turns a minute you are doing twenty kilometres an hour and cannot pedal faster. Past that, feet on the rests and coast. To slow down you have the spoon brake and your own legs against the cranks — and above the cadence limit, only the spoon.',
  ],
  task: 'Ride 600 m down the avenue to the stone, and stop',
  views: [
    { name: 'chase', label: 'From behind' },
    { name: 'inside', label: 'In the saddle' },
    { name: 'tower', label: 'From the pavement' },
  ],
  bindings: [
    { keys: 'Space', action: 'Push off' },
    { keys: 'W / S', action: 'Pedal · spoon brake and back-pedal' },
    { keys: '← / →', action: 'Lean into a turn' },
    { keys: 'V · P · R', action: 'View · pause · start again' },
  ],
  envelope,
  create: () => new VelocipedeSim(),
}
