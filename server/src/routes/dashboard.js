import { Router } from 'express'
import { getDashboard } from '../services/dashboard.js'

export function dashboardRouter({ db, config }) {
  const router = Router()
  router.get('/', async (req, res) => {
    res.json(await getDashboard(db, config))
  })
  return router
}



export function eventsHandler(events) {
  return (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', 
    })
    res.flushHeaders()
    res.write('retry: 5000\n\n')

    const unsubscribe = events.subscribe(res)
    
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000)

    req.on('close', () => {
      clearInterval(heartbeat)
      unsubscribe()
    })
  }
}
