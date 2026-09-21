/**
 * Headless autopilot for the Lotus 49 exercise. Drives the sim class with a
 * fake keyboard for a few minutes of simulated time and reports whether the
 * lap logic closes and the numbers land where the sources say they should.
 *
 *   npx tsx scripts/smoke-lotus49.ts
 */
import { Lotus49Sim } from '../src/sim/lotus49'
import { nearestOnTrack, TRACK_LENGTH, TRACK_LINE } from '../src/sim/fields/circuit'

class FakeKeys {
  held = new Set<string>()
  taps = new Set<string>()
  down(...codes: string[]) {
    return codes.some((c) => this.held.has(c))
  }
  tapped(...codes: string[]) {
    let hit = false
    for (const c of codes) if (this.taps.delete(c)) hit = true
    return hit
  }
  axis(neg: string[], pos: string[]) {
    return (this.down(...pos) ? 1 : 0) - (this.down(...neg) ? 1 : 0)
  }
  endFrame() {
    this.taps.clear()
  }
}

const sim = new Lotus49Sim()
const keys = new FakeKeys()
const dt = 1 / 120
let topSpeed = 0
let t = 0

const N = TRACK_LINE.length
const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

// Local radius at every sample, from the heading change across its neighbours.
const RADIUS = TRACK_LINE.map((_, i) => {
  const a = TRACK_LINE[(i - 3 + N) % N]
  const b = TRACK_LINE[(i + 3) % N]
  const bend = Math.abs(wrap(Math.atan2(b.tx, b.tz) - Math.atan2(a.tx, a.tz)))
  let arc = b.s - a.s
  if (arc < 0) arc += TRACK_LENGTH
  return bend > 1e-5 ? arc / bend : 1e9
})
const minRadius = Math.min(...RADIUS)

// Private state, read for the report only.
const priv = sim as unknown as {
  speed: number
  rpm: number
  gear: number
  heading: number
  off: boolean
  offs: number
  steer: number
  frontUse: number
  rearUse: number
  spinning: boolean
  oversteer: boolean
  understeer: boolean
  beta: number
}
let lastOffs = 0
const edgeHist = [0, 0, 0, 0] // frames within 3 m, 3–4, 4–5, beyond 5 of the centreline

const WING = process.env.WING === '1'
// Downforce lifts the corner speed the autopilot may assume, at 1.3 g × load.
const GRIP = WING ? 1.15 : 1.0

for (let i = 0; i < 120 * 400 && !sim.finished; i++) {
  keys.held.clear()
  if (i === 1 && WING) keys.taps.add('KeyG')
  const { speed, rpm, gear, heading } = priv
  const near = nearestOnTrack(sim.position.x, sim.position.z)

  // Aim at a point some way down the road; further at speed.
  const ahead = Math.round(5 + speed * 0.28)
  const target = TRACK_LINE[(near.index + ahead) % N]
  // Aim the direction of travel, not the nose: a car going sideways is
  // steered by where it is going.
  const err = wrap(Math.atan2(target.x - sim.position.x, target.z - sim.position.z) - (heading - priv.beta))
  // Steer-position control: hold a key only until the wheel is where we want it.
  const wantSteer = Math.max(-1, Math.min(1, err * 3.5))
  if (priv.steer < wantSteer - 0.04) keys.held.add('ArrowRight')
  else if (priv.steer > wantSteer + 0.04) keys.held.add('ArrowLeft')

  // Brake for the tightest radius within braking distance. Only 0.6 g of
  // braking is assumed, because much of it has to happen while the tyres
  // are already working sideways — these corners tighten as they go.
  const BRAKE = 0.6 * 9.81
  const brakingDist = (speed * speed) / (2 * BRAKE) + 15
  let vLimit = Infinity
  for (let k = 0, s = 0; s < brakingDist; k++) {
    const j = (near.index + k) % N
    const vCorner = Math.sqrt(GRIP * 9.81 * RADIUS[j]) * 0.82
    // A corner further away allows more speed now, by the braking available.
    vLimit = Math.min(vLimit, Math.sqrt(vCorner * vCorner + 2 * BRAKE * s))
    s = k === 0 ? 0 : s + (TRACK_LINE[j].s - TRACK_LINE[(j - 1 + N) % N].s + TRACK_LENGTH) % TRACK_LENGTH
    if (k > 200) break
  }

  // A driver, not a novice: the pedals are pulsed in proportion to how far
  // off the target speed we are, so braking into a corner is a squeeze and
  // power out of it is fed in as the rear tyres have something to give.
  const over = speed - vLimit
  // Once the tyres are working sideways the pedal is squeezed, not stamped.
  const committed = Math.max(priv.frontUse, priv.rearUse) > 0.7
  const brakeDuty = Math.max(0, Math.min(1, over / 5)) * (committed ? 0.45 : 1)
  const gasDuty =
    Math.max(0, Math.min(1, -over / 3)) *
    Math.max(0, Math.min(1, (0.85 - priv.rearUse) / 0.3)) *
    (priv.spinning || Math.abs(priv.beta) > 0.06 ? 0 : 1)
  const phase = (i % 6) / 6
  if (over > 0 && phase < brakeDuty) keys.held.add('KeyS')
  else if (over < 0 && phase < gasDuty) keys.held.add('KeyW')

  if (rpm > 8800 && gear < 5) keys.taps.add('ArrowUp')
  if (rpm < 5200 && gear > 1 && speed > 3) keys.taps.add('ArrowDown')

  sim.step(dt, keys as never)
  keys.endFrame()
  t += dt
  topSpeed = Math.max(topSpeed, speed)

  // Frame trace through a window, for when a corner needs explaining.
  const TRACE = process.env.TRACE
  if (TRACE) {
    const [t0, t1] = TRACE.split('-').map(Number)
    if (t >= t0 && t <= t1 && i % 12 === 0) {
      const p = priv as unknown as { throttle: number; brakes: number; delta: number; accel: number }
      console.log(
        `  t=${t.toFixed(2)} idx=${near.index} r=${RADIUS[near.index].toFixed(0)} v=${(speed * 3.6).toFixed(0)} ` +
          `lim=${(vLimit * 3.6).toFixed(0)} gas=${p.throttle.toFixed(2)} brk=${p.brakes.toFixed(2)} ` +
          `δ=${((p.delta * 180) / Math.PI).toFixed(1)}° acc=${p.accel.toFixed(1)} F=${priv.frontUse.toFixed(2)} R=${priv.rearUse.toFixed(2)} ` +
          `β=${((priv.beta * 180) / Math.PI).toFixed(0)}° ${priv.spinning ? 'SPIN' : ''}${priv.oversteer ? 'OVER' : ''}${priv.understeer ? 'UNDER' : ''} d=${near.dist.toFixed(1)}`,
      )
    }
  }
  edgeHist[near.dist < 3 ? 0 : near.dist < 4 ? 1 : near.dist < 5 ? 2 : 3]++

  if (priv.offs !== lastOffs) {
    lastOffs = priv.offs
    console.log(
      `  off #${priv.offs} at t=${t.toFixed(1)}s idx=${near.index} r=${RADIUS[near.index].toFixed(0)}m ` +
        `v=${(speed * 3.6).toFixed(0)}km/h limit=${(vLimit * 3.6).toFixed(0)} ` +
        `front=${priv.frontUse.toFixed(2)} rear=${priv.rearUse.toFixed(2)} ` +
        `${priv.spinning ? 'SPIN ' : ''}${priv.oversteer ? 'OVER ' : ''}${priv.understeer ? 'UNDER ' : ''}beta=${((priv.beta * 180) / Math.PI).toFixed(0)}° err=${err.toFixed(2)}`,
    )
  }
}
console.log(`tightest corner radius ${minRadius.toFixed(0)} m`)
const total = edgeHist.reduce((a, b) => a + b, 0)
console.log(
  'distance from centreline: ' +
    ['<3 m', '3–4 m', '4–5 m', '>5 m']
      .map((l, i) => `${l} ${((edgeHist[i] / total) * 100).toFixed(1)}%`)
      .join(' · '),
)

const r = sim.readout()
console.log(`circuit ${(TRACK_LENGTH / 1000).toFixed(2)} km, ${TRACK_LINE.length} samples`)
console.log(`simulated ${t.toFixed(0)} s, finished=${sim.finished}`)
console.log(`top speed ${(topSpeed * 3.6).toFixed(0)} km/h`)
for (const g of r.gauges) console.log(`  ${g.label.padEnd(12)} ${g.value} ${g.unit ?? ''}`)
console.log(`status: ${r.status}`)
console.log(`verdict: ${r.verdict ? `${r.verdict.title} — ${r.verdict.lines.join(' ')}` : 'none'}`)
console.log('log:', r.log)
if (!sim.finished || !r.verdict?.good) process.exitCode = 1
