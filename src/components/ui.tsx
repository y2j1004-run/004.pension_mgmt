import { useEffect, useState, type ReactNode } from 'react'
import type { Tip } from '../calc/advice'
import { parseNumber } from '../format'

export function Card({ title, right, children }: { title?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub, className = '' }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${className}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 tabular-nums">{sub}</div>}
    </div>
  )
}

const TIP_STYLE = {
  warn: 'bg-amber-50 text-amber-900',
  info: 'bg-slate-50 text-slate-700',
  good: 'bg-emerald-50 text-emerald-800',
}
const TIP_ICON = { warn: '⚠️', info: '💡', good: '✅' }

export function Tips({ tips }: { tips: Tip[] }) {
  if (!tips.length) return null
  return (
    <ul className="space-y-2">
      {tips.map((t, i) => (
        <li key={i} className={`flex gap-2 rounded-xl px-3 py-2 text-sm ${TIP_STYLE[t.level]}`}>
          <span>{TIP_ICON[t.level]}</span>
          <span>{t.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** 쉼표가 붙는 숫자 입력. 입력 중에는 글자 그대로 두고, 바깥 값이 바뀌면 따라갑니다. */
export function NumberInput({
  value,
  onChange,
  suffix,
  className = '',
  decimals = false,
  placeholder,
}: {
  value: number | undefined
  onChange: (n: number) => void
  suffix?: string
  className?: string
  decimals?: boolean
  placeholder?: string
}) {
  const show = (n: number | undefined) => (n == null || Number.isNaN(n) ? '' : n.toLocaleString('ko-KR', { maximumFractionDigits: 4 }))
  const [text, setText] = useState(show(value))
  useEffect(() => {
    if (parseNumber(text) !== value) setText(show(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <label className={`flex items-center rounded-lg border border-slate-300 bg-white px-2 focus-within:border-indigo-500 ${className}`}>
      <input
        inputMode={decimals ? 'decimal' : 'numeric'}
        className="w-full min-w-0 bg-transparent py-2 text-right tabular-nums outline-none"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseNumber(e.target.value))
        }}
        onBlur={() => setText(show(parseNumber(text) || (text.trim() ? 0 : undefined)))}
      />
      {suffix && <span className="pl-1 text-sm text-slate-500">{suffix}</span>}
    </label>
  )
}

export function Button({
  children,
  onClick,
  kind = 'primary',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  kind?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  className?: string
}) {
  const style = {
    primary: 'bg-indigo-700 text-white',
    secondary: 'bg-slate-100 text-slate-800',
    danger: 'bg-red-50 text-red-700',
  }[kind]
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-xl px-4 py-2.5 font-semibold disabled:opacity-40 ${style} ${className}`}>
      {children}
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-lg px-2 py-1.5 ${value === o.id ? 'bg-white font-semibold text-indigo-700 shadow-sm' : 'text-slate-600'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** 지금 비중(막대)과 목표(세로선) */
export function WeightBar({ pct, target, color = 'bg-indigo-500' }: { pct: number; target?: number; color?: string }) {
  return (
    <div className="relative h-2 rounded-full bg-slate-100">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      {target != null && target > 0 && <div className="absolute -top-1 h-4 w-0.5 bg-slate-800" style={{ left: `${Math.min(100, target)}%` }} />}
    </div>
  )
}
