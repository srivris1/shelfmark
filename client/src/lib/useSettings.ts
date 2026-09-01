import { useQuery } from '@tanstack/react-query'
import { api } from './api'
import type { Settings } from './types'

export const useSettings = () =>
  useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/settings'), staleTime: Infinity })
