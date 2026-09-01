import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { clientId } from './clientId'
import type { CirculationResult } from './types'

type CirculationEvent = CirculationResult & { action: 'issue' | 'return'; by: string; clientId: string | null }



export function useLiveEvents(enabled: boolean) {
  const queryClient = useQueryClient()
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const source = new EventSource('/api/events')
    const refresh = (...keys: string[]) => keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }))

    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false) 

    source.addEventListener('circulation', (e) => {
      const event: CirculationEvent = JSON.parse((e as MessageEvent).data)
      refresh('books', 'book', 'dashboard', 'transactions', 'borrowers')
      if (event.clientId === clientId) return
      const { book, borrower } = event.transaction
      toast(event.action === 'issue' ? `${book.title} issued to ${borrower.name}` : `${book.title} returned by ${borrower.name}`, {
        description: `at another desk by ${event.by}`,
      })
    })

    source.addEventListener('catalog', () => refresh('books', 'book', 'categories', 'dashboard'))

    return () => {
      source.close()
      setConnected(false)
    }
  }, [enabled, queryClient])

  return connected
}
