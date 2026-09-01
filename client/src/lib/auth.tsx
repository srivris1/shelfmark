import { createContext, useContext, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type { Staff } from './types'

interface AuthState {
  user: Staff | null
  loading: boolean
  login: (email: string, password: string) => Promise<Staff>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export const ME_KEY = ['me'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: () =>
      api<{ user: Staff }>('/auth/me')
        .then((r) => r.user)
        .catch((err) => {
          if (err instanceof ApiError && err.status === 401) return null
          throw err
        }),
    staleTime: Infinity,
    retry: false,
  })

  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api<{ user: Staff }>('/auth/login', { method: 'POST', body: { email, password } }).then((r) => r.user),
    onSuccess: (user) => queryClient.setQueryData(ME_KEY, user),
  })

  const value: AuthState = {
    user: me.data ?? null,
    loading: me.isPending,
    login: (email, password) => loginMutation.mutateAsync({ email, password }),
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined)
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, null)
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
