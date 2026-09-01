


export function createEventBus() {
  const clients = new Set()

  return {
    subscribe(res) {
      clients.add(res)
      return () => clients.delete(res)
    },
    publish(type, data) {
      const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
      for (const res of clients) res.write(message)
    },
    get size() {
      return clients.size
    },
  }
}
