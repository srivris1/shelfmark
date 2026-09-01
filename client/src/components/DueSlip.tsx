import { cx } from './ui'

export interface Slip {
  key: string
  kind: 'issued' | 'returned' | 'error'
  title: string
  lines: string[]
  stamp?: string
  note?: string
  late?: boolean
}

const HEADINGS = { issued: 'Date due', returned: 'Returned', error: 'Not processed' }



export function DueSlip({ slip }: { slip: Slip }) {
  const stampColor = slip.kind === 'returned' ? 'text-stamp-green' : 'text-stamp'
  return (
    <article
      className={cx(
        'animate-rise relative overflow-hidden rounded-sm border bg-surface pt-3',
        slip.kind === 'error' ? 'border-tag-red-bg' : 'border-line-strong',
      )}
      aria-live="polite"
    >
      <div className="perforated absolute inset-x-0 top-0 h-2" aria-hidden />
      <div className="px-5 pt-3 pb-5">
        <p className={cx('font-mono text-[11px] font-semibold tracking-[0.18em] uppercase', slip.kind === 'error' ? 'text-stamp' : 'text-ink-3')}>{HEADINGS[slip.kind]}</p>
        <h3 className={cx('mt-2 pr-28 font-display text-lg leading-snug', slip.kind === 'error' ? 'text-ink-2' : 'text-ink')}>{slip.title}</h3>
        <div className="mt-1 space-y-0.5 pr-24 text-[13px] text-ink-2">
          {slip.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        {slip.note && <p className={cx('mt-2 text-[13px] font-medium', slip.late ? 'text-stamp' : 'text-ink-2')}>{slip.note}</p>}
      </div>
      {slip.stamp && (
        <div className={cx('stamp animate-stamp absolute top-8 right-4 px-2.5 py-1 text-center font-mono leading-tight font-bold', stampColor)}>
          <span className="block text-[10px] tracking-[0.2em]">{slip.kind === 'issued' ? 'DUE' : 'RETURNED'}</span>
          <span className="block text-[13px] tracking-wider">{slip.stamp}</span>
        </div>
      )}
    </article>
  )
}
