


export function createScanGate(windowMs = 2500, now = () => Date.now()) {
  const lastSeen = new Map<string, number>()

  return {
    accept(code: string) {
      const time = now()
      const previous = lastSeen.get(code)
      lastSeen.set(code, time)
      return previous === undefined || time - previous >= windowMs
    },
    reset() {
      lastSeen.clear()
    },
  }
}
