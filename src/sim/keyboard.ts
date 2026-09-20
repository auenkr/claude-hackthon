/**
 * Keyboard state for the simulators.
 *
 * The physics runs inside the render loop, so it needs to ask "is this key
 * held right now" rather than wait for React to re-render. This keeps a live
 * set of held keys, plus edge-triggered taps that are consumed on read so a
 * single press fires a single shot.
 */
export class Keyboard {
  private held = new Set<string>()
  private taps = new Set<string>()

  /** Codes we swallow, so the page does not scroll while you are flying. */
  private static readonly SWALLOW = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Space',
  ])

  private onDown = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (Keyboard.SWALLOW.has(e.code)) e.preventDefault()
    if (!e.repeat) this.taps.add(e.code)
    this.held.add(e.code)
  }

  private onUp = (e: KeyboardEvent) => {
    this.held.delete(e.code)
  }

  /** A lost window means lost keys; otherwise the throttle sticks open. */
  private onBlur = () => {
    this.held.clear()
    this.taps.clear()
  }

  attach() {
    window.addEventListener('keydown', this.onDown)
    window.addEventListener('keyup', this.onUp)
    window.addEventListener('blur', this.onBlur)
    return () => this.detach()
  }

  detach() {
    window.removeEventListener('keydown', this.onDown)
    window.removeEventListener('keyup', this.onUp)
    window.removeEventListener('blur', this.onBlur)
    this.onBlur()
  }

  down(...codes: string[]) {
    for (const c of codes) if (this.held.has(c)) return true
    return false
  }

  /** True once per physical press. */
  tapped(...codes: string[]) {
    let hit = false
    for (const c of codes) {
      if (this.taps.has(c)) {
        this.taps.delete(c)
        hit = true
      }
    }
    return hit
  }

  /** A -1/0/+1 axis from a pair of keys. */
  axis(negative: string[], positive: string[]) {
    return (this.down(...positive) ? 1 : 0) - (this.down(...negative) ? 1 : 0)
  }

  /** Drop taps nobody asked about, so they do not fire a frame late. */
  endFrame() {
    this.taps.clear()
  }
}
