export type Tab = 'home' | 'monthly' | 'funds' | 'records' | 'settings'

const tabs: { id: Tab; icon: string; label: string }[] = [
  { id: 'home', icon: '🏠', label: '홈' },
  { id: 'monthly', icon: '💰', label: '이번 달 불입' },
  { id: 'funds', icon: '📈', label: '종목' },
  { id: 'records', icon: '🧾', label: '기록' },
  { id: 'settings', icon: '⚙️', label: '설정' },
]

export default function TabBar({ current, onChange, badge }: { current: Tab; onChange: (tab: Tab) => void; badge?: Tab[] }) {
  return (
    <nav className="grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex flex-col items-center gap-0.5 py-2 text-xs ${current === t.id ? 'font-semibold text-indigo-700' : 'text-slate-500'}`}
        >
          <span className="relative text-xl">
            {t.icon}
            {badge?.includes(t.id) && <span className="absolute -top-0.5 -right-1.5 h-2 w-2 rounded-full bg-amber-500" aria-label="확인 필요" />}
          </span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}
