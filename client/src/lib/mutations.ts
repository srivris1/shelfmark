import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from './api'
import { plural, rupees } from './format'
import type { CirculationResult } from './types'

export function useRefreshCirculation() {
  const queryClient = useQueryClient()
  return () => ['books', 'book', 'dashboard', 'transactions', 'borrowers'].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }))
}

export const returnSummary = ({ transaction }: CirculationResult) =>
  transaction.daysOverdue > 0
    ? `${plural(transaction.daysOverdue, 'day', 'days')} late · ${rupees(transaction.fine)} fine`
    : 'Returned on time'


export function useReturnLoan() {
  const refresh = useRefreshCirculation()
  return useMutation({
    mutationFn: (transactionId: number) => api<CirculationResult>('/circulation/return', { method: 'POST', body: { transactionId } }),
    onSuccess: (result) => {
      toast.success(`${result.transaction.book.title} is back on the shelf`, { description: returnSummary(result) })
      refresh()
    },
    onError: (err) => toast.error(err.message),
  })
}
