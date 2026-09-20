import * as THREE from 'three'

/**
 * Fire, smoke, dust and wreckage.
 *
 * A simulation that can kill you has to show it. This is a plain particle
 * buffer owned by the simulation rather than by React: the sim emits into it
 * from `step`, the scene draws it from `useFrame`, and nothing in between
 * allocates or re-renders. Three instanced meshes cover everything —
 * additive for flame and sparks, soft for smoke and dust, solid for debris.
 */

export type FxKind = 'fire' | 'spark' | 'smoke' | 'dust' | 'debris'

export interface Particle {
  live: boolean
  kind: FxKind
  pos: THREE.Vector3
  vel: THREE.Vector3
  spin: THREE.Vector3
  quat: THREE.Quaternion
  age: number
  life: number
  /** Metres across at birth, and the multiple it reaches by the end. */
  size: number
  grow: number
  colour: THREE.Color
  fade: THREE.Color
  /** Velocity lost per second, as a fraction, and metres per second squared down. */
  drag: number
  gravity: number
  /** Debris stops when it lands; smoke does not care. */
  bounce: boolean
}

export interface EmitOptions {
  vel?: THREE.Vector3
  life?: number
  size?: number
  grow?: number
  colour?: THREE.ColorRepresentation
  fade?: THREE.ColorRepresentation
  drag?: number
  gravity?: number
  spin?: number
  bounce?: boolean
}

/** A wreck that goes on burning. */
export interface Fire {
  pos: THREE.Vector3
  radius: number
  /** Seconds left. */
  left: number
  /** Accumulator, so emission is frame-rate independent. */
  due: number
}

const FIRE = new THREE.Color('#ffce6a')
const EMBER = new THREE.Color('#c2340f')
const SOOT = new THREE.Color('#3a352f')
const PALE = new THREE.Color('#b6b1a6')

const scratch = new THREE.Vector3()
const axis = new THREE.Vector3()

export class Effects {
  readonly particles: Particle[] = []
  readonly fires: Fire[] = []
  /** Ground height, so debris lands and dust does not sink. */
  ground: ((x: number, z: number) => number) | null = null

  private cursor = 0

  constructor(capacity = 700) {
    for (let i = 0; i < capacity; i++) {
      this.particles.push({
        live: false,
        kind: 'smoke',
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        quat: new THREE.Quaternion(),
        age: 0,
        life: 1,
        size: 1,
        grow: 1,
        colour: new THREE.Color(),
        fade: new THREE.Color(),
        drag: 0,
        gravity: 0,
        bounce: false,
      })
    }
  }

  /**
   * Take the next slot. The pool is a ring: when it is full the oldest
   * particle is overwritten, which is what you want — a big explosion should
   * cost the tail of the last one, not be silently dropped.
   */
  private take() {
    const p = this.particles[this.cursor]
    this.cursor = (this.cursor + 1) % this.particles.length
    return p
  }

  emit(kind: FxKind, pos: THREE.Vector3, o: EmitOptions = {}) {
    const p = this.take()
    p.live = true
    p.kind = kind
    p.pos.copy(pos)
    p.vel.copy(o.vel ?? scratch.set(0, 0, 0))
    p.age = 0
    p.life = o.life ?? 1
    p.size = o.size ?? 1
    p.grow = o.grow ?? 1
    p.colour.set((o.colour ?? '#ffffff') as THREE.ColorRepresentation)
    p.fade.set((o.fade ?? p.colour) as THREE.ColorRepresentation)
    p.drag = o.drag ?? 0.6
    p.gravity = o.gravity ?? 0
    p.bounce = o.bounce ?? false
    const spin = o.spin ?? 0
    p.spin.set(
      (Math.random() - 0.5) * spin,
      (Math.random() - 0.5) * spin,
      (Math.random() - 0.5) * spin,
    )
    p.quat.setFromAxisAngle(
      axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      Math.random() * Math.PI,
    )
    return p
  }

  /** A scatter of velocities in a cone about `dir`, or a full sphere. */
  private spray(out: THREE.Vector3, speed: number, up = 0.4) {
    const a = Math.random() * Math.PI * 2
    const r = Math.random()
    out.set(Math.cos(a) * r, up + Math.random() * up, Math.sin(a) * r)
      .normalize()
      .multiplyScalar(speed * (0.35 + Math.random()))
  }

  /**
   * The full thing: a white flash, a rolling fireball, sparks thrown clear,
   * black smoke that outlives it, and tumbling wreckage. `scale` is roughly
   * the radius of the fireball in metres.
   */
  explosion(pos: THREE.Vector3, scale = 3, options: { debris?: number; fire?: number } = {}) {
    const v = new THREE.Vector3()

    this.emit('fire', pos, {
      life: 0.16,
      size: scale * 1.5,
      grow: 1.7,
      colour: '#fffbe8',
      fade: FIRE,
      drag: 3,
    })

    const balls = Math.round(5 + scale)
    for (let i = 0; i < balls; i++) {
      this.spray(v, scale * 2.2, 0.5)
      this.emit('fire', pos, {
        vel: v,
        life: 0.5 + Math.random() * 0.55,
        size: scale * (0.5 + Math.random() * 0.6),
        grow: 2.1,
        colour: FIRE,
        fade: EMBER,
        drag: 2.4,
        gravity: -1.5,
      })
    }

    for (let i = 0; i < 18; i++) {
      this.spray(v, scale * 9, 0.6)
      this.emit('spark', pos, {
        vel: v,
        life: 0.35 + Math.random() * 0.7,
        size: scale * 0.1,
        grow: 0.3,
        colour: '#ffd98a',
        fade: '#a8300a',
        drag: 1.1,
        gravity: -9,
      })
    }

    const puffs = Math.round(6 + scale * 1.5)
    for (let i = 0; i < puffs; i++) {
      this.spray(v, scale * 1.4, 0.8)
      this.emit('smoke', pos, {
        vel: v,
        life: 2.4 + Math.random() * 3.2,
        size: scale * (0.8 + Math.random()),
        grow: 3.4,
        colour: '#5b5248',
        fade: SOOT,
        drag: 1.2,
        gravity: 0.5,
      })
    }

    const chunks = options.debris ?? Math.round(4 + scale)
    for (let i = 0; i < chunks; i++) {
      this.spray(v, scale * 6, 0.9)
      this.emit('debris', pos, {
        vel: v,
        life: 4 + Math.random() * 3,
        size: scale * (0.08 + Math.random() * 0.22),
        grow: 1,
        colour: '#4a443c',
        fade: '#332f2a',
        drag: 0.25,
        gravity: -9.81,
        spin: 14,
        bounce: true,
      })
    }

    if (options.fire !== 0) this.ignite(pos, scale * 0.6, options.fire ?? 30)
  }

  /** Dirt thrown up where something struck the ground. */
  impact(pos: THREE.Vector3, scale = 1, colour: THREE.ColorRepresentation = '#a99a7d') {
    const v = new THREE.Vector3()
    for (let i = 0; i < 8; i++) {
      this.spray(v, scale * 5, 1.1)
      this.emit('dust', pos, {
        vel: v,
        life: 0.9 + Math.random() * 1.4,
        size: scale * (0.4 + Math.random() * 0.7),
        grow: 2.6,
        colour,
        fade: PALE,
        drag: 1.8,
        gravity: -1.2,
      })
    }
    for (let i = 0; i < 5; i++) {
      this.spray(v, scale * 7, 1.2)
      this.emit('debris', pos, {
        vel: v,
        life: 1.4 + Math.random(),
        size: scale * 0.1,
        grow: 1,
        colour: '#6b6150',
        fade: '#57503f',
        drag: 0.2,
        gravity: -9.81,
        spin: 10,
        bounce: true,
      })
    }
  }

  /** One puff, for a trail. Call it on a timer, not every frame. */
  puff(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    size: number,
    colour: THREE.ColorRepresentation = '#6e6a63',
    life = 1.6,
  ) {
    this.emit('smoke', pos, {
      vel,
      life,
      size,
      grow: 3,
      colour,
      fade: '#8d8880',
      drag: 1.6,
      gravity: 0.35,
    })
  }

  /** A wreck burns on its own for `seconds`. */
  ignite(pos: THREE.Vector3, radius: number, seconds = 30) {
    this.fires.push({ pos: pos.clone(), radius, left: seconds, due: 0 })
  }

  step(dt: number) {
    const v = new THREE.Vector3()

    for (const f of this.fires) {
      if (f.left <= 0) continue
      f.left -= dt
      f.due -= dt
      while (f.due <= 0) {
        f.due += 0.055
        const a = Math.random() * Math.PI * 2
        const r = f.radius * Math.sqrt(Math.random())
        v.set(f.pos.x + Math.cos(a) * r, f.pos.y, f.pos.z + Math.sin(a) * r)
        this.emit('fire', v, {
          vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5),
          life: 0.45 + Math.random() * 0.4,
          size: f.radius * (0.35 + Math.random() * 0.4),
          grow: 1.6,
          colour: FIRE,
          fade: EMBER,
          drag: 1.4,
          gravity: 1.5,
        })
        this.emit('smoke', v, {
          vel: new THREE.Vector3((Math.random() - 0.5) * 2, 3.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2),
          life: 3.5 + Math.random() * 4,
          size: f.radius * (0.7 + Math.random() * 0.8),
          grow: 4.5,
          colour: '#443e37',
          fade: SOOT,
          drag: 0.7,
          gravity: 1.1,
        })
      }
    }
    if (this.fires.length > 12) this.fires.splice(0, this.fires.length - 12)

    for (const p of this.particles) {
      if (!p.live) continue
      p.age += dt
      if (p.age >= p.life) {
        p.live = false
        continue
      }
      p.vel.y += p.gravity * dt
      const keep = Math.max(0, 1 - p.drag * dt)
      p.vel.multiplyScalar(keep)
      p.pos.addScaledVector(p.vel, dt)

      if (p.spin.lengthSq() > 0) {
        v.copy(p.spin).multiplyScalar(dt)
        p.quat.multiply(
          new THREE.Quaternion().setFromEuler(new THREE.Euler(v.x, v.y, v.z)),
        )
      }

      if (p.bounce && this.ground) {
        const floor = this.ground(p.pos.x, p.pos.z) + p.size * 0.5
        if (p.pos.y < floor) {
          p.pos.y = floor
          if (p.vel.y < 0) p.vel.y *= -0.32
          p.vel.x *= 0.6
          p.vel.z *= 0.6
          p.spin.multiplyScalar(0.6)
          if (Math.abs(p.vel.y) < 0.4) {
            p.vel.set(0, 0, 0)
            p.spin.set(0, 0, 0)
            p.gravity = 0
          }
        }
      }
    }
  }

  reset() {
    for (const p of this.particles) p.live = false
    this.fires.length = 0
    this.cursor = 0
  }
}
