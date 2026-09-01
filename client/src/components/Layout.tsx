import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Books, ChartBar, DotsThreeOutline, Moon, Printer, Receipt, Scan, SignOut, Sun, Users, X } from '@phosphor-icons/react'
import { useAuth } from '../lib/auth'
import { useLiveEvents } from '../lib/useLiveEvents'
import { useTheme } from '../lib/theme'
import { cx } from './ui'

const NAV = [
  { to: '/', label: 'Dashboard', Icon: ChartBar, end: true },
  { to: '/desk', label: 'Scan desk', Icon: Scan },
  { to: '/books', label: 'Catalogue', Icon: Books },
  { to: '/transactions', label: 'Transactions', Icon: Receipt },
  { to: '/labels', label: 'QR labels', Icon: Printer },
  { to: '/staff', label: 'Staff', Icon: Users, adminOnly: true },
]

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2 text-ink', className)}>
      <svg viewBox="0 0 20 26" className="h-6 w-auto" aria-hidden>
        <path d="M1 1h18v24l-9-6.5L1 25z" fill="currentColor" />
        <path d="M5.5 7h9M5.5 11h9" stroke="var(--canvas)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <span className="font-display text-[1.45rem] leading-none font-medium tracking-[-0.02em] italic">Shelfmark</span>
    </span>
  )
}

function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-3" title={connected ? 'Screens update live' : 'Reconnecting to live updates'}>
      <span className={cx('h-1.5 w-1.5 rounded-full', connected ? 'bg-series-issued' : 'bg-line-strong')} aria-hidden />
      {connected ? 'Live' : 'Offline'}
    </span>
  )
}

export function Layout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const connected = useLiveEvents(Boolean(user))
  const [moreOpen, setMoreOpen] = useState(false)
  const items = NAV.filter((item) => !item.adminOnly || user?.role === 'admin')

  const ThemeIcon = theme === 'dark' ? Sun : Moon
  const themeLabel = theme === 'dark' ? 'Light mode' : 'Dark mode'

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_1fr]">
      {}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line px-5 py-7 lg:flex print:hidden">
        <NavLink to="/" className="mb-10 px-2">
          <Wordmark />
        </NavLink>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {items.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-md px-2.5 py-2 text-[14px] transition-colors',
                  isActive ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:bg-surface-2/60 hover:text-ink',
                )
              }
            >
              <Icon size={18} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-4 border-t border-line pt-5">
          <div className="px-2">
            <p className="text-sm font-medium text-ink">{user?.name}</p>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-xs text-ink-3 capitalize">{user?.role}</span>
              <LiveDot connected={connected} />
            </div>
          </div>
          <div className="grid gap-0.5">
            <button onClick={toggle} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
              <ThemeIcon size={16} aria-hidden /> {themeLabel}
            </button>
            <button onClick={logout} className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-ink-2 hover:bg-surface-2 hover:text-ink">
              <SignOut size={16} aria-hidden /> Sign out
            </button>
          </div>
        </div>
      </aside>

      {}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/90 px-5 py-3 backdrop-blur lg:hidden print:hidden">
        <NavLink to="/">
          <Wordmark />
        </NavLink>
        <LiveDot connected={connected} />
      </div>

      <main className="mx-auto w-full max-w-6xl px-5 pt-8 pb-32 sm:px-8 lg:px-12 lg:pt-12 lg:pb-16 print:max-w-none print:p-0">
        <Outlet />
      </main>

      {}
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden print:hidden" aria-label="Main">
        {[items[0], items[2]].map(({ to, label, Icon, end }) => (
          <MobileTab key={to} to={to} label={label} end={end} icon={<Icon size={22} aria-hidden />} />
        ))}
        <NavLink to="/desk" className="-mt-5 flex flex-col items-center gap-1 text-[11px] font-medium text-ink">
          <span className="grid h-13 w-13 place-items-center rounded-full bg-primary text-primary-ink shadow-[0_2px_10px_rgba(0,0,0,0.12)]">
            <Scan size={24} aria-hidden />
          </span>
          Scan
        </NavLink>
        <MobileTab to="/transactions" label="History" icon={<Receipt size={22} aria-hidden />} />
        <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-1 py-1 text-[11px] text-ink-2">
          <DotsThreeOutline size={22} aria-hidden />
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-30 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <button className="absolute inset-0 bg-[#1f1d19]/35" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div className="animate-rise absolute inset-x-0 bottom-0 rounded-t-xl border-t border-line bg-surface px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-ink-3 capitalize">{user?.role}</p>
              </div>
              <button onClick={() => setMoreOpen(false)} className="p-2 text-ink-2" aria-label="Close menu">
                <X size={20} aria-hidden />
              </button>
            </div>
            <div className="divide-y divide-line">
              {items.slice(4).map(({ to, label, Icon }) => (
                <NavLink key={to} to={to} onClick={() => setMoreOpen(false)} className="flex items-center gap-3 py-3.5 text-[15px]">
                  <Icon size={20} aria-hidden /> {label}
                </NavLink>
              ))}
              <button onClick={toggle} className="flex w-full items-center gap-3 py-3.5 text-[15px]">
                <ThemeIcon size={20} aria-hidden /> {themeLabel}
              </button>
              <button onClick={logout} className="flex w-full items-center gap-3 py-3.5 text-[15px] text-stamp">
                <SignOut size={20} aria-hidden /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MobileTab({ to, label, icon, end }: { to: string; label: string; icon: React.ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => cx('flex flex-col items-center gap-1 py-1 text-[11px]', isActive ? 'font-medium text-ink' : 'text-ink-2')}
    >
      {icon}
      {label}
    </NavLink>
  )
}
