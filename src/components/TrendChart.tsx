import { useState } from 'react'

// One accent hue for the main series; a muted ink line for the comparison (e.g. 원금).
const MAIN = '#4338ca' // indigo-700, the app accent
const MAIN_WASH = 'rgba(67, 56, 202, 0.08)'
const REF = '#94a3b8' // slate-400
const GRID = '#e2e8f0'
const AXIS_TEXT = '#64748b'
const W = 340
const PAD = { top: 12, right: 8, bottom: 22, left: 40 }

interface Point {
  date: string
  value: number
  ref?: number
}

function niceRange(min: number, max: number, count = 4) {
  const raw = Math.max((max - min) / count, 1e-9)
  const p = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= raw)!
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  return { lo, hi: hi === lo ? lo + step : hi, step }
}

/** Value over time (x spaced by real dates), with an optional dashed comparison line. Tap to read a point. */
export default function TrendChart({
  data,
  format,
  axis,
  height = 180,
}: {
  data: Point[]
  format: (d: Point) => string
  axis: (v: number) => string
  height?: number
}) {
  const [sel, setSel] = useState<number>()
  const i = Math.min(sel ?? data.length - 1, data.length - 1)
  const all = data.flatMap((d) => (d.ref != null ? [d.value, d.ref] : [d.value]))
  const { lo, hi, step } = niceRange(Math.min(...all), Math.max(...all))
  const tickValues = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, k) => lo + step * k)
  const t0 = Date.parse(data[0].date)
  const t1 = Date.parse(data.at(-1)!.date)
  const plotW = W - PAD.left - PAD.right
  const plotH = height - PAD.top - PAD.bottom
  const x = (date: string) => PAD.left + (t1 === t0 ? plotW / 2 : ((Date.parse(date) - t0) / (t1 - t0)) * plotW)
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH
  const line = (get: (d: Point) => number | undefined) =>
    data
      .filter((d) => get(d) != null)
      .map((d, k) => `${k ? 'L' : 'M'}${x(d.date)},${y(get(d)!)}`)
      .join(' ')
  const main = line((d) => d.value)
  const area = `${main} L${x(data.at(-1)!.date)},${PAD.top + plotH} L${x(data[0].date)},${PAD.top + plotH} Z`
  const months = data.filter((d, k) => k === 0 || d.date.slice(0, 7) !== data[k - 1].date.slice(0, 7))
  const every = Math.max(1, Math.ceil(months.length / 5))

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    let best = 0
    data.forEach((d, k) => {
      if (Math.abs(x(d.date) - px) < Math.abs(x(data[best].date) - px)) best = k
    })
    setSel(best)
  }
  const d = data[i]

  return (
    <figure>
      <figcaption className="mb-1 h-5 text-sm font-semibold tabular-nums">{format(d)}</figcaption>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full touch-none select-none" role="img" onPointerDown={pick} onPointerMove={pick}>
        {tickValues.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={PAD.left - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill={AXIS_TEXT}>
              {axis(t)}
            </text>
          </g>
        ))}
        {months
          .filter((_, k) => k % every === 0)
          .map((m) => (
            <text key={m.date} x={Math.min(x(m.date), W - PAD.right - 24)} y={height - 6} fontSize={9} fill={AXIS_TEXT}>
              {m.date.slice(2, 7).replace('-', '.')}
            </text>
          ))}
        <path d={area} fill={MAIN_WASH} />
        {data.some((p) => p.ref != null) && <path d={line((p) => p.ref)} fill="none" stroke={REF} strokeWidth={1.5} strokeDasharray="4 3" />}
        <path d={main} fill="none" stroke={MAIN} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(d.date)} x2={x(d.date)} y1={PAD.top} y2={PAD.top + plotH} stroke={AXIS_TEXT} strokeWidth={1} opacity={0.4} />
        <circle cx={x(d.date)} cy={y(d.value)} r={5} fill={MAIN} stroke="#fff" strokeWidth={2} />
      </svg>
    </figure>
  )
}
