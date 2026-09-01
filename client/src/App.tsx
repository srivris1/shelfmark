import { lazy, Suspense, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './lib/auth'
import { Layout } from './components/Layout'
import { EmptyState, Spinner, buttonClass } from './components/ui'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'


const DeskPage = lazy(() => import('./pages/DeskPage').then((m) => ({ default: m.DeskPage })))
const BooksPage = lazy(() => import('./pages/BooksPage').then((m) => ({ default: m.BooksPage })))
const BookDetailPage = lazy(() => import('./pages/BookDetailPage').then((m) => ({ default: m.BookDetailPage })))
const TransactionsPage = lazy(() => import('./pages/TransactionsPage').then((m) => ({ default: m.TransactionsPage })))
const LabelsPage = lazy(() => import('./pages/LabelsPage').then((m) => ({ default: m.LabelsPage })))
const StaffPage = lazy(() => import('./pages/StaffPage').then((m) => ({ default: m.StaffPage })))

const page = (element: ReactNode) => <Suspense fallback={<Spinner />}>{element}</Suspense>

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Opening the desk" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') {
    return <EmptyState title="Admins only">Ask an admin if you need a new staff account.</EmptyState>
  }
  return children
}

function NotFound() {
  return (
    <EmptyState
      title="This shelf is empty"
      action={
        <Link to="/" className={buttonClass('secondary')}>
          Back to the dashboard
        </Link>
      }
    >
      The page you were looking for doesn't exist.
    </EmptyState>
  )
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="desk" element={page(<DeskPage />)} />
        <Route path="books" element={page(<BooksPage />)} />
        <Route path="books/:id" element={page(<BookDetailPage />)} />
        <Route path="transactions" element={page(<TransactionsPage />)} />
        <Route path="labels" element={page(<LabelsPage />)} />
        <Route path="staff" element={<AdminOnly>{page(<StaffPage />)}</AdminOnly>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
