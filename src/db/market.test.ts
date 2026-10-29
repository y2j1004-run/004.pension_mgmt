import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAll, db } from './db'
import { storedBrief, storedNews, syncBriefing } from './market'

const files: Record<string, unknown> = {
  'brief.json': { date: '2026-10-29', up: 365, down: 792, flat: 0, groups: [], gainers: [], losers: [] },
  'news.json': { updatedAt: '2026-10-29T08:00:00Z', themes: [] },
}
let calls: string[] = []

beforeEach(async () => {
  await clearAll()
  await db.meta.bulkDelete(['briefFetchedAt', 'marketBrief', 'news'])
  calls = []
  vi.stubGlobal('fetch', async (url: string) => {
    calls.push(url)
    const name = url.split('/').pop()!
    return name in files ? new Response(JSON.stringify(files[name])) : new Response('', { status: 404 })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('syncBriefing', () => {
  it('fetches the summary and news when the phone has none, even right after a price sync', async () => {
    await db.meta.put({ key: 'marketFetchedAt', value: Date.now() })
    await syncBriefing()
    expect((await storedBrief())?.up).toBe(365)
    expect(await storedNews()).toBeTruthy()
  })

  it('waits an hour before fetching again, unless forced', async () => {
    await syncBriefing()
    calls = []
    await syncBriefing()
    expect(calls).toEqual([])
    await syncBriefing(true)
    expect(calls).toHaveLength(2)
  })

  it('tries again on the next open when a file was missing', async () => {
    delete files['news.json']
    await syncBriefing()
    expect(await storedBrief()).toBeTruthy()
    calls = []
    await syncBriefing()
    expect(calls).toHaveLength(2)
  })
})
