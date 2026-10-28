import Dexie, { type EntityTable } from 'dexie'
import { DEFAULT_SETTINGS, type Entry, type Etf, type PricePoint, type Settings } from '../model'

export interface Meta {
  key: string
  value: unknown
}

// All pension data lives only in this browser's IndexedDB.
export const db = new Dexie('pension-mgmt') as Dexie & {
  etfs: EntityTable<Etf, 'code'>
  entries: EntityTable<Entry, 'id'>
  prices: Dexie.Table<PricePoint, [string, string]>
  /** 매일 받아오는 종가 (앱 주소의 prices/에서). 다시 받을 수 있어 백업에는 넣지 않음 */
  market: Dexie.Table<PricePoint, [string, string]>
  meta: EntityTable<Meta, 'key'>
}

db.version(1).stores({
  etfs: 'code',
  entries: '++id, date, kind, code',
  prices: '[code+date], code, date',
  meta: 'key',
})
db.version(2).stores({
  etfs: 'code',
  entries: '++id, date, kind, code',
  prices: '[code+date], code, date',
  market: '[code+date], code, date',
  meta: 'key',
})

export async function getSettings(): Promise<Settings> {
  const saved = (await db.meta.get('settings'))?.value as Partial<Settings> | undefined
  return { ...DEFAULT_SETTINGS, ...saved }
}

export async function setSettings(patch: Partial<Settings>) {
  await db.meta.put({ key: 'settings', value: { ...(await getSettings()), ...patch } })
}

export async function savePrices(points: PricePoint[]) {
  await db.prices.bulkPut(points.filter((p) => p.price > 0))
}

/** 이번 달 불입: 입금 1건 + 매수 여러 건 + 그날 가격을 한 번에 저장 */
export async function saveMonthly(date: string, deposit: number, buys: { code: string; qty: number; price: number }[]) {
  await db.transaction('rw', db.entries, db.prices, async () => {
    if (deposit > 0) await db.entries.add({ date, kind: 'deposit', amount: deposit })
    const bought = buys.filter((b) => b.qty > 0)
    await db.entries.bulkAdd(bought.map((b) => ({ date, kind: 'buy' as const, code: b.code, qty: b.qty, price: b.price })))
    await db.prices.bulkPut(buys.filter((b) => b.price > 0).map((b) => ({ code: b.code, date, price: b.price })))
  })
}

export async function deleteEtf(code: string) {
  await db.transaction('rw', db.etfs, db.prices, async () => {
    await db.etfs.delete(code)
    await db.prices.where('code').equals(code).delete()
  })
}

export async function clearAll() {
  await db.transaction('rw', [db.etfs, db.entries, db.prices, db.market, db.meta], async () => {
    await Promise.all([db.etfs.clear(), db.entries.clear(), db.prices.clear(), db.market.clear(), db.meta.delete('settings'), db.meta.delete('sample'), db.meta.delete('previousTargets')])
  })
}
