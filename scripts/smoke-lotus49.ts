/**
 * Headless autopilot for the Lotus 49 exercise. Drives the sim class with a
 * fake keyboard for a few minutes of simulated time and reports whether the
 * lap logic closes and the numbers land where the sources say they should.
 *
 *   npx tsx scripts/smoke-lotus49.ts
 */
import { Lotus49Sim } from '../src/sim/lotus49'
import { nearestOnTrack, TRACK_LENGTH, TRACK_LINE } from '../src/sim/terrain'

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
  sliding: boolean
  off: boolean
  offs: number
  steer: number
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
  const err = wrap(Math.atan2(target.x - sim.position.x, target.z - sim.position.z) - heading)
  // Steer-position control: hold a key only until the wheel is where we want it.
  const wantSteer = Math.max(-1, Math.min(1, err * 5))
  if (priv.steer < wantSteer - 0.04) keys.held.add('ArrowRight')
  else if (priv.steer > wantSteer + 0.04) keys.held.add('ArrowLeft')

  // Brake for the tightest radius within braking distance, allowing 1 g.
  const brakingDist = (speed * speed) / (2 * 9.81) + 15
  let vLimit = Infinity
  for (let k = 0, s = 0; s < brakingDist; k++) {
    const j = (near.index + k) % N
    const vCorner = Math.sqrt(GRIP * 9.81 * RADIUS[j]) * 0.88
    // A corner further away allows more speed now, by the braking available.
    vLimit = Math.min(vLimit, Math.sqrt(vCorner * vCorner + 2 * 9.81 * s))
    s = k === 0 ? 0 : s + (TRACK_LINE[j].s - TRACK_LINE[(j - 1 + N) % N].s + TRACK_LENGTH) % TRACK_LENGTH
    if (k > 200) break
  }

  if (speed > vLimit + 1) keys.held.add('KeyS')
  else if (speed < vLimit - 0.5) keys.held.add('KeyW')

  if (rpm > 8800 && gear < 5) keys.taps.add('ArrowUp')
  if (rpm < 5200 && gear > 1 && speed > 3) keys.taps.add('ArrowDown')

  sim.step(dt, keys as never)
  keys.endFrame()
  t += dt
  topSpeed = Math.max(topSpeed, speed)
  edgeHist[near.dist < 3 ? 0 : near.dist < 4 ? 1 : near.dist < 5 ? 2 : 3]++

  if (priv.offs !== lastOffs) {
    lastOffs = priv.offs
    console.log(
      `  off #${priv.offs} at t=${t.toFixed(1)}s idx=${near.index} r=${RADIUS[near.index].toFixed(0)}m ` +
        `v=${(speed * 3.6).toFixed(0)}km/h limit=${(vLimit * 3.6).toFixed(0)} sliding=${priv.sliding} err=${err.toFixed(2)}`,
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
