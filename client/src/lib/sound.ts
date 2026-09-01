

let ctx: AudioContext | null = null

export function beep(ok: boolean) {
  try {
    ctx ??= new AudioContext()
    const tones = ok ? [[1320, 0]] : [[220, 0], [220, 0.16]]
    for (const [frequency, delay] of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = ok ? 'sine' : 'square'
      osc.frequency.value = frequency
      const start = ctx.currentTime + delay
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(ok ? 0.18 : 0.08, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.13)
    }
  } catch {
    
  }
}
