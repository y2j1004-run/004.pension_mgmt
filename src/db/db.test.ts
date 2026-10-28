import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { accountOn } from '../calc/portfolio'
import { createBackup, readBackup, restoreBackup } from './backup'
import { clearAll, db, getSettings, saveMonthly, setSettings } from './db'
import { loadSample, sampleData } from './sample'

beforeEach(clearAll)

describe('db', () => {
  it('saves a month: deposit, buys and the prices of the day', async () => {
    await saveMonthly('2026-10-21', 700_000, [
      { code: 'A', qty: 10, price: 50_000 },
      { code: 'B', qty: 0, price: 12_000 },
    ])
    const entries = await db.entries.toArray()
    expect(entries.map((e) => e.kind)).toEqual(['deposit', 'buy'])
    expect(await db.prices.count()).toBe(2)
    expect(accountOn(entries).cash).toBe(200_000)
  })

  it('keeps settings with defaults', async () => {
    await setSettings({ monthlyAmount: 500_000 })
    expect((await getSettings()).monthlyAmount).toBe(500_000)
    expect((await getSettings()).depositDay).toBe(21)
  })

  it('round-trips a backup', async () => {
    await loadSample('2026-10-28')
    const b = readBackup(JSON.parse(JSON.stringify(await createBackup())))
    const count = await db.entries.count()
    await clearAll()
    await restoreBackup(b)
    expect(await db.entries.count()).toBe(count)
    expect(await db.etfs.count()).toBe(4)
    expect(() => readBackup({ app: 'workout-mgmt' })).toThrow()
  })

  it('builds sample data that never spends money it does not have', () => {
    const s = sampleData('2026-10-28')
    expect(accountOn(s.entries).cash).toBeGreaterThanOrEqual(0)
    expect(s.entries.filter((e) => e.kind === 'deposit').length).toBe(14)
  })
})
