import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { ArrowCounterClockwise, CaretLeft, CaretRight, CheckCircle, CircleNotch, Clock, Warning, X } from '@phosphor-icons/react'
import { twMerge } from 'tailwind-merge'


export const cx = (...classes: (string | false | null | undefined)[]) => twMerge(classes.filter(Boolean).join(' '))

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-primary-ink hover:bg-primary-hover',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'border border-line-strong bg-surface text-stamp hover:bg-tag-red-bg',
}
const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-5 text-[15px]',
}


export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md', className = '') =>
  cx(
    'inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
    SIZES[size],
    VARIANTS[variant],
    className,
  )

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  busy?: boolean
  icon?: ReactNode
}

export function Button({ variant, size, busy, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={busy || disabled} aria-busy={busy || undefined} {...rest}>
      {busy ? <CircleNotch className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

export const inputClass =
  'h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-ink focus:outline-none aria-[invalid=true]:border-stamp'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputClass, className)} {...rest} />
})

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputClass, 'cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

interface FieldProps {
  label: string
  htmlFor: string
  error?: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, error, hint, children, className }: FieldProps) {
  return (
    <div className={cx('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-[13px] text-stamp" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-3">{hint}</p>
      )}
    </div>
  )
}

type Tone = 'green' | 'blue' | 'yellow' | 'red' | 'neutral'
const TONES: Record<Tone, string> = {
  green: 'bg-tag-green-bg text-tag-green-ink',
  blue: 'bg-tag-blue-bg text-tag-blue-ink',
  yellow: 'bg-tag-yellow-bg text-tag-yellow-ink',
  red: 'bg-tag-red-bg text-tag-red-ink',
  neutral: 'bg-surface-2 text-ink-2',
}

export function Tag({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap uppercase', TONES[tone])}>
      {icon}
      {children}
    </span>
  )
}


const STATUS = {
  available: { tone: 'green', label: 'Available', Icon: CheckCircle },
  issued: { tone: 'blue', label: 'Issued', Icon: Clock },
  'on-loan': { tone: 'blue', label: 'On loan', Icon: Clock },
  overdue: { tone: 'red', label: 'Overdue', Icon: Warning },
  returned: { tone: 'neutral', label: 'Returned', Icon: ArrowCounterClockwise },
  'returned-late': { tone: 'yellow', label: 'Returned late', Icon: ArrowCounterClockwise },
} as const

export type StatusKind = keyof typeof STATUS

export function StatusTag({ status }: { status: StatusKind }) {
  const { tone, label, Icon } = STATUS[status]
  return (
    <Tag tone={tone} icon={<Icon size={12} weight="bold" aria-hidden />}>
      {label}
    </Tag>
  )
}

export const loanStatusKind = (t: { status: 'issued' | 'overdue' | 'returned'; daysOverdue: number }): StatusKind =>
  t.status === 'issued' ? 'on-loan' : t.status === 'returned' && t.daysOverdue > 0 ? 'returned-late' : t.status

export function CopiesMeter({ available, total }: { available: number; total: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`${available} of ${total} copies on the shelf`}>
      <div className="flex gap-0.5" aria-hidden>
        {Array.from({ length: Math.min(total, 8) }, (_, i) => (
          <span key={i} className={cx('h-3.5 w-1.5 rounded-[2px]', i < available ? 'bg-series-issued' : 'bg-line-strong')} />
        ))}
      </div>
      <span className="figures text-[13px] text-ink-2">
        {available}/{total}
      </span>
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-ink-3" role="status">
      <CircleNotch className="animate-spin" aria-hidden /> {label}…
    </div>
  )
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.'
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-tag-red-bg bg-tag-red-bg/60 px-4 py-3 text-sm text-tag-red-ink" role="alert">
      <Warning weight="bold" aria-hidden />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="px-2 py-12 text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-sm text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="font-display text-[clamp(1.9rem,1.4rem+1.6vw,2.6rem)] leading-[1.05] font-medium tracking-[-0.02em] text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode }[]
  label: string
  size?: 'md' | 'lg'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line-strong bg-surface-2 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cx(
            'inline-flex items-center gap-1.5 rounded-[5px] font-medium transition-colors',
            size === 'lg' ? 'h-10 px-5 text-[15px]' : 'h-8 px-3 text-[13px]',
            value === option.value ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]' : 'text-ink-2 hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  if (total <= pageSize) return null
  const last = Math.ceil(total / pageSize)
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <nav className="flex items-center justify-between gap-4 pt-4 text-[13px] text-ink-2" aria-label="Pagination">
      <span className="figures">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" icon={<CaretLeft aria-hidden />} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="ghost" disabled={page >= last} onClick={() => onPage(page + 1)}>
          Next <CaretRight aria-hidden />
        </Button>
      </div>
    </nav>
  )
}


export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-full max-w-md border-l border-line bg-surface p-0 text-ink backdrop:bg-[#1f1d19]/35"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-xl font-medium">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <X weight="bold" aria-hidden />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">{open && children}</div>
      </div>
    </dialog>
  )
}

export const tableClass = 'w-full border-collapse text-left text-sm'
export const thClass = 'border-b border-line px-3 py-2.5 text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase first:pl-0 last:pr-0'
export const tdClass = 'border-b border-line px-3 py-3 align-top first:pl-0 last:pr-0'
