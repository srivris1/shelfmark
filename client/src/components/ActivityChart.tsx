import { useState } from 'react'
import type { Dashboard } from '../lib/types'




const W = 560
const H = 190
const PAD_LEFT = 26
const PAD_TOP = 14
const PAD_BOTTOM = 24
const SERIES = [
  { key: 'issued', label: 'Issued', color: 'var(--series-issued)' },
  { key: 'returned', label: 'Returned', color: 'var(--series-returned)' },
] as const


function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', opts)

export function ActivityChart({ trend }: { trend: Dashboard['trend'] }) {
  const [active, setActive] = useState<number | null>(null)
  const totals = { issued: trend.reduce((s, d) => s + d.issued, 0), returned: trend.reduce((s, d) => s + d.returned, 0) }
  const peak = Math.max(1, ...trend.flatMap((d) => [d.issued, d.returned]))
  const top = Math.max(2, Math.ceil(peak / 2) * 2)
  const plotH = H - PAD_TOP - PAD_BOTTOM
  const groupW = (W - PAD_LEFT) / trend.length
  const barW = Math.max(3, Math.min(11, (groupW - 8) / 2))
  const y = (v: number) => PAD_TOP + plotH * (1 - v / top)
  const last = trend.length - 1

  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <figcaption className="font-display text-lg font-medium">Last 14 days</figcaption>
        <div className="flex gap-4 text-[13px] text-ink-2">
          {SERIES.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} aria-hidden />
              {s.label} <span className="figures font-medium text-ink">{totals[s.key]}</span>
            </span>
          ))}
        </div>
      </div>

      {totals.issued + totals.returned === 0 ? (
        <p className="py-10 text-sm text-ink-3">No books have gone in or out in the last two weeks.</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label={`Books issued and returned per day for the last 14 days: ${totals.issued} issued, ${totals.returned} returned.`}>
            {[0, top / 2, top].map((v) => (
              <g key={v}>
                <line x1={PAD_LEFT} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
                <text x={PAD_LEFT - 8} y={y(v) + 3.5} textAnchor="end" className="figures fill-ink-3 text-[10px]">
                  {v}
                </text>
              </g>
            ))}

            {trend.map((d, i) => {
              const cx = PAD_LEFT + groupW * i + groupW / 2
              const bars = [
                { x: cx - barW - 1, value: d.issued, color: SERIES[0].color },
                { x: cx + 1, value: d.returned, color: SERIES[1].color },
              ]
              return (
                <g key={d.day} opacity={active === null || active === i ? 1 : 0.45}>
                  {bars.map((b, j) =>
                    b.value > 0 ? <path key={j} d={barPath(b.x, y(b.value), barW, y(0) - y(b.value))} fill={b.color} /> : null,
                  )}
                  {}
                  {i === last &&
                    bars.map((b, j) =>
                      b.value > 0 ? (
                        <text key={j} x={b.x + barW / 2} y={y(b.value) - 5} textAnchor="middle" className="figures fill-ink-2 text-[10px] font-medium">
                          {b.value}
                        </text>
                      ) : null,
                    )}
                  {(i % 2 === last % 2 || i === 0) && (
                    <text x={cx} y={H - 6} textAnchor="middle" className="fill-ink-3 text-[10px]">
                      {i === last ? 'Today' : dayLabel(d.day, { day: 'numeric' })}
                    </text>
                  )}
                  {}
                  <rect
                    x={cx - groupW / 2}
                    y={PAD_TOP}
                    width={groupW}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    aria-label={`${dayLabel(d.day, { weekday: 'long', day: 'numeric', month: 'short' })}: ${d.issued} issued, ${d.returned} returned`}
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className="outline-none"
                  />
                </g>
              )
            })}
          </svg>

          {active !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-line bg-surface px-3 py-2 text-xs shadow-[0_4px_14px_rgba(0,0,0,0.08)]"
              style={{ left: `${((PAD_LEFT + groupW * active + groupW / 2) / W) * 100}%` }}
            >
              <p className="mb-1 font-medium text-ink">{dayLabel(trend[active].day, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
              {SERIES.map((s) => (
                <p key={s.key} className="flex items-center gap-1.5 text-ink-2">
                  <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} aria-hidden />
                  {s.label} <span className="figures ml-auto pl-3 font-medium text-ink">{trend[active][s.key]}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <details className="mt-2 text-[13px] text-ink-2">
        <summary className="cursor-pointer select-none hover:text-ink">View as table</summary>
        <table className="figures mt-2 w-full text-left">
          <thead>
            <tr className="text-ink-3">
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 font-medium">Issued</th>
              <th className="py-1 font-medium">Returned</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1">{dayLabel(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                <td className="py-1">{d.issued}</td>
                <td className="py-1">{d.returned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
