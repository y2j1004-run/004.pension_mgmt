import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { priceBook, summarize, type Summary } from './calc/portfolio'
import { localToday } from './calc/schedule'
import { db, getSettings } from './db/db'
import type { Entry, Etf, PricePoint, Settings } from './model'

export interface Portfolio {
  today: string
  etfs: Etf[]
  entries: Entry[]
  prices: PricePoint[]
  settings: Settings
  book: Map<string, PricePoint[]>
  summary: Summary
  /** 가장 최근에 가격을 넣은 날 */
  lastPriceDate?: string
}

/** Everything the screens need, kept live with the database. undefined while loading. */
export function usePortfolio(): Portfolio | undefined {
  const etfs = useLiveQuery(async () => (await db.etfs.toArray()).sort((a, b) => a.createdAt - b.createdAt))
  const entries = useLiveQuery(() => db.entries.orderBy('date').toArray())
  const prices = useLiveQuery(() => db.prices.toArray())
  const settings = useLiveQuery(getSettings)
  return useMemo(() => {
    if (!etfs || !entries || !prices || !settings) return undefined
    const book = priceBook(prices, entries)
    const today = localToday()
    const lastPriceDate = [...prices.map((p) => p.date), ...entries.filter((e) => e.price).map((e) => e.date)].sort().at(-1)
    return { today, etfs, entries, prices, settings, book, summary: summarize(etfs, entries, book), lastPriceDate }
  }, [etfs, entries, prices, settings])
}
