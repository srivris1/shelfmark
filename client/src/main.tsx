import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IconContext } from '@phosphor-icons/react'
import { Toaster } from 'sonner'
import { ApiError } from './lib/api'
import { AuthProvider, ME_KEY } from './lib/auth'
import { App } from './App'
import './index.css'

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    
    onError: (err) => {
      if (err instanceof ApiError && err.status === 401) queryClient.setQueryData(ME_KEY, null)
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <IconContext.Provider value={{ weight: 'bold', size: 18 }}>
            <App />
            <Toaster
              position="bottom-right"
              toastOptions={{
                classNames: {
                  toast: '!bg-surface !text-ink !border !border-line !rounded-md !shadow-[0_4px_16px_rgba(0,0,0,0.06)] !font-sans',
                  description: '!text-ink-2',
                },
              }}
            />
          </IconContext.Provider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
