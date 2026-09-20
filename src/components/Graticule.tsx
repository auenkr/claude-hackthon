import { useEffect, useState } from 'react'
import {
  FIELD_MILS,
  MIL,
  MUZZLE,
  STADIA_TARGET,
  sight,
  type SightState,
} from '../sim/t34/sight'

/**
 * The TSh-16's graticule, drawn to scale.
 *
 * The sight is four-power over a sixteen-degree field, which in the Soviet
 * unit — the тысячная, one six-thousandth of a circle — is 267 mils top to
 * bottom. The whole overlay is drawn in those mils, so every mark on it
 * subtends the angle it claims to. That is why the reticle looks small: a
 * tank at a kilometre really is only two and a half mils tall, and the
 * superelevation for that range really is only seven and a half.
 *
 * The square viewBox is fitted rather than stretched, so on any viewport
 * wider than it is tall the vertical scale is exact.
 */

const HALF = FIELD_MILS / 2
const BOX = `${-HALF} ${-HALF} ${FIELD_MILS} ${FIELD_MILS}`

const G = 9.81

/** Superelevation in mils for a range, with drag neglected. */
function lay(range: number, v: number) {
  return Math.atan((G * range) / (2 * v * v)) / MIL
}

/** Ranges the sight's own scale is graduated for, in hundreds of metres. */
const LADDER = [4, 8, 12, 16, 20]
const STADIA = [4, 6, 8, 10, 14, 20]

export function Graticule() {
  // The gunnery runs in the render loop; this reads it on its own clock, the
  // same ten times a second the instrument panel refreshes at.
  const [s, setS] = useState<SightState>(() => ({ ...sight }))
  useEffect(() => {
    const id = setInterval(() => setS({ ...sight }), 100)
    return () => clearInterval(id)
  }, [])

  const v = MUZZLE[s.round]
  const here = s.laid ? lay(s.laid, v) : 0
  const loaded = s.reload <= 0

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={BOX}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        {/* The eyepiece field stop. Everything outside it is the sight tube. */}
        <defs>
          <mask id="tsh-stop">
            <rect x={-HALF} y={-HALF} width={FIELD_MILS} height={FIELD_MILS} fill="white" />
            <circle cx="0" cy="0" r={HALF * 0.995} fill="black" />
          </mask>
        </defs>
        <rect
          x={-HALF}
          y={-HALF}
          width={FIELD_MILS}
          height={FIELD_MILS}
          fill="var(--color-ink)"
          opacity="0.5"
          mask="url(#tsh-stop)"
        />
        <circle cx="0" cy="0" r={HALF * 0.995} fill="none" stroke="var(--color-ink)" strokeWidth="1.4" opacity="0.5" />

        {/* Etched twice: a pale line under an ink one, so the graticule stays
            legible against a burning hulk as well as against the sky. */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <g stroke="#f4f2ec" strokeWidth="2.1" opacity="0.5">
            <Marks here={here} v={v} />
          </g>
          <g stroke="var(--color-ink)" strokeWidth="0.85" opacity="0.92">
            <Marks here={here} v={v} />
          </g>
        </g>

        <g
          fill="var(--color-ink)"
          fontSize="5.6"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          opacity="0.9"
        >
          {[8, 16, 24, 32].map((m) => (
            <g key={m}>
              <text x={-m} y="-3.4" textAnchor="middle">
                {m / 8}
              </text>
              <text x={m} y="-3.4" textAnchor="middle">
                {m / 8}
              </text>
            </g>
          ))}
          {LADDER.map((r) => (
            <text key={r} x="-7.5" y={lay(r * 100, v) + 2} textAnchor="end">
              {r}
            </text>
          ))}
          {STADIA.map((r, i) => (
            <text
              key={r}
              x={30 + i * 9}
              y={39.5}
              textAnchor="middle"
              fontSize="4.6"
              opacity="0.8"
            >
              {r}
            </text>
          ))}
          <text x={30 + STADIA.length * 9 + 4} y={30} fontSize="4.4" opacity="0.65">
            2.7 m
          </text>
        </g>

        {/* Where the gun is actually laid, if it is resting on something. */}
        {s.laid > 0 && (
          <g stroke="var(--color-ink)" strokeWidth="1.1" opacity="0.95">
            <path d={`M-5.5 ${here} L-2.6 ${here - 1.6} L-2.6 ${here + 1.6} Z`} fill="var(--color-ink)" />
            <path d={`M5.5 ${here} L2.6 ${here - 1.6} L2.6 ${here + 1.6} Z`} fill="var(--color-ink)" />
          </g>
        )}
      </svg>

      {/* What the gunner has to know that the graticule cannot show him. */}
      <div className="pointer-events-none absolute inset-x-0 top-[62%] flex justify-center">
        <div className="flex items-stretch gap-px overflow-hidden rounded border border-rail bg-gallery/85 backdrop-blur">
          <Cell label="Loaded">
            <span className={loaded ? 'text-ink' : 'text-label'}>
              {s.round === 'ap' ? 'BR-365 AP' : 'O-365K HE'}
            </span>
            {!loaded && (
              <span className="ml-1.5 text-label">{s.reload.toFixed(1)} s</span>
            )}
          </Cell>
          <Cell label="Range">
            {s.laid ? `${s.laid.toFixed(0)} m` : '—'}
            {s.on && s.on !== 'ground' && (
              <span className="ml-1.5 text-label">{s.on}</span>
            )}
          </Cell>
          <Cell label="Lay high">{s.laid ? `${here.toFixed(1)} mil` : '—'}</Cell>
          <Cell label="DT belt">{s.belt}</Cell>
          {s.atStop && <Cell label="Gun">−5° stop</Cell>}
          {s.speed > 5 && <Cell label="Hull">{s.speed.toFixed(0)} km/h — halt</Cell>}
        </div>
      </div>
    </>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-r border-rail/70 px-3 py-1.5 last:border-r-0">
      <div className="placard text-[8px] leading-none text-label/80">{label}</div>
      <div className="mt-1 font-mono text-[11px] leading-none tabular-nums text-ink">
        {children}
      </div>
    </div>
  )
}

/**
 * The etched marks themselves, drawn twice over. The central chevron is the
 * aiming mark; the horizontal scale is lead in 0-08 divisions; the ladder
 * below it is the superelevation for four hundred to two thousand metres,
 * computed from the loaded round rather than drawn from memory.
 */
function Marks({ here, v }: { here: number; v: number }) {
  const ticks: number[] = []
  for (let m = 2; m <= 40; m += 2) ticks.push(m)

  return (
    <>
      {/* Aiming chevron. */}
      <path d="M-7 -0.2 L0 6.4 L7 -0.2" />

      {/* Lead scale either side of it. */}
      <path d={`M-42 0 L-9 0`} />
      <path d={`M9 0 L42 0`} />
      {ticks.map((m) => {
        const len = m % 8 === 0 ? 3.4 : m % 4 === 0 ? 2.2 : 1.2
        return (
          <g key={m}>
            <path d={`M${-m} 0 L${-m} ${-len}`} />
            <path d={`M${m} 0 L${m} ${-len}`} />
          </g>
        )
      })}

      {/* Range ladder: put the target on the mark for its range. */}
      {LADDER.map((r) => {
        const y = lay(r * 100, v)
        const w = r % 8 === 0 ? 4.6 : 3.2
        return <path key={r} d={`M${-w} ${y} L0 ${y + 2.6} L${w} ${y}`} />
      })}
      <path d={`M0 ${lay(2000, v) + 3.4} L0 ${lay(2000, v) + 6}`} />

      {/* Stadia for a 2.7 m target: the gap between the base line and the
          curve is the height of a tank at that range. */}
      <path d={`M26 34 L${30 + (STADIA.length - 1) * 9 + 4} 34`} />
      <path
        d={
          'M' +
          STADIA.map((r, i) => {
            const x = 30 + i * 9
            const h = STADIA_TARGET / (r * 100) / MIL
            return `${x} ${34 - h}`
          }).join(' L')
        }
      />
      {STADIA.map((r, i) => {
        const x = 30 + i * 9
        const h = STADIA_TARGET / (r * 100) / MIL
        return <path key={r} d={`M${x} 34 L${x} ${34 - h}`} />
      })}

      {/* A short witness mark on the vertical, so the eye finds the centre. */}
      <path d={`M0 ${-4} L0 ${-9}`} />
      <path d={`M-1.6 ${here} L1.6 ${here}`} />
    </>
  )
}
