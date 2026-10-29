import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { depositedIn, localToday, nextDepositDate } from './calc/schedule'
import TabBar, { type Tab } from './components/TabBar'
import UpdateBanner from './components/UpdateBanner'
import { BACKUP_REMIND_DAYS, daysSince } from './pages/Settings'
import { lastBackupAt } from './db/backup'
import { db, getSettings } from './db/db'
import { syncBriefing, syncMarket } from './db/market'
import Home from './pages/Home'
import Monthly from './pages/Monthly'
import Funds from './pages/Funds'
import Records from './pages/Records'
import Settings from './pages/Settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  // dots: 이번 달 불입일이 됐는데 아직 기록이 없을 때, 백업한 지 오래됐을 때
  const badge = useLiveQuery(async () => {
    const out: Tab[] = []
    const entries = await db.entries.toArray()
    if (!entries.length) return out
    const today = localToday()
    const { depositDay } = await getSettings()
    const thisMonthDay = nextDepositDate(`${today.slice(0, 7)}-01`, depositDay)
    if (today >= thisMonthDay && !depositedIn(entries, today.slice(0, 7))) out.push('monthly')
    const age = daysSince(await lastBackupAt())
    if (age == null || age >= BACKUP_REMIND_DAYS) out.push('settings')
    return out
  })

  // 앱을 열거나 다시 볼 때, 받은 지 3시간이 지났으면 내 종목의 최신 종가를 받음
  const codes = useLiveQuery(async () => (await db.etfs.toArray()).map((e) => e.code).sort().join(','))
  useEffect(() => {
    if (!codes) return
    const sync = () => {
      syncMarket(codes.split(',')).catch(() => {})
      syncBriefing().catch(() => {})
    }
    sync()
    const onVisible = () => document.visibilityState === 'visible' && sync()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [codes])

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <UpdateBanner />
      <main className="flex-1 overflow-y-auto px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
        {tab === 'home' && <Home go={setTab} />}
        {tab === 'monthly' && <Monthly go={setTab} />}
        {tab === 'funds' && <Funds />}
        {tab === 'records' && <Records />}
        {tab === 'settings' && <Settings />}
      </main>
      <TabBar current={tab} onChange={setTab} badge={badge} />
    </div>
  )
}
