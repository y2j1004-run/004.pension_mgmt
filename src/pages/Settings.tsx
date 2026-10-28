import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { localToday } from '../calc/schedule'
import { Button, Card, NumberInput, Segmented } from '../components/ui'
import { backupFileName, createBackup, lastBackupAt, markBackedUp, readBackup, restoreBackup, type Backup } from '../db/backup'
import { clearAll, db, getSettings, setSettings } from '../db/db'
import { ACCOUNT_LABEL, type AccountType } from '../model'

export const BACKUP_REMIND_DAYS = 30

export function daysSince(iso: string | undefined, now = Date.now()) {
  return iso ? Math.floor((now - Date.parse(iso)) / 86_400_000) : undefined
}

export default function Settings() {
  const s = useLiveQuery(getSettings)
  if (!s) return null
  const thisYear = localToday().slice(0, 4)
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">설정</h1>
      <Card title="계좌">
        <div className="space-y-3 text-xs text-slate-500">
          <Segmented
            value={s.accountType}
            onChange={(v: AccountType) => setSettings({ accountType: v })}
            options={(Object.keys(ACCOUNT_LABEL) as AccountType[]).map((k) => ({ id: k, label: ACCOUNT_LABEL[k] }))}
          />
          <p>{s.accountType === 'saving' ? '연금저축: 위험자산 한도는 없고, 레버리지·인버스 ETF는 살 수 없습니다.' : 'IRP·DC: 위험자산(주식형 등)은 계좌의 70%까지만 담을 수 있어 배분 계산에 반영합니다.'}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              월 불입액
              <NumberInput className="mt-1" value={s.monthlyAmount} onChange={(n) => setSettings({ monthlyAmount: n })} suffix="원" />
            </div>
            <div>
              매월 불입일
              <NumberInput className="mt-1" value={s.depositDay} onChange={(n) => n >= 1 && n <= 31 && setSettings({ depositDay: Math.round(n) })} suffix="일" />
            </div>
          </div>
          <div>
            목표 비중에서 벗어나면 알림
            <NumberInput className="mt-1" value={s.driftBand} onChange={(n) => n > 0 && setSettings({ driftBand: n })} decimals suffix="%p" />
          </div>
        </div>
      </Card>

      <Card title="세액공제">
        <div className="space-y-3 text-xs text-slate-500">
          <Segmented
            value={String(s.taxRate)}
            onChange={(v) => setSettings({ taxRate: Number(v) })}
            options={[
              { id: '0.165', label: '총급여 5,500만 이하 16.5%' },
              { id: '0.132', label: '초과 13.2%' },
            ]}
          />
          <div>
            앱으로 기록하기 전에 올해 이 계좌에 넣은 금액
            <NumberInput
              className="mt-1"
              value={s.paidBeforeAppYear === thisYear ? s.paidBeforeApp : 0}
              onChange={(n) => setSettings({ paidBeforeApp: n, paidBeforeAppYear: thisYear })}
              suffix="원"
            />
          </div>
          <div>
            다른 연금계좌(IRP 등)에 올해 넣는 금액
            <NumberInput className="mt-1" value={s.otherAnnual} onChange={(n) => setSettings({ otherAnnual: n })} suffix="원" />
          </div>
          <p>
            한도: 연금저축 연 600만원, IRP 합산 연 900만원. 월 {(s.monthlyAmount / 10_000).toLocaleString('ko-KR')}만원이면 연{' '}
            {((s.monthlyAmount * 12) / 10_000).toLocaleString('ko-KR')}만원입니다
            {s.accountType === 'saving' && s.monthlyAmount * 12 > 6_000_000
              ? ` — 연금저축만으로는 ${((s.monthlyAmount * 12 - 6_000_000) / 10_000).toLocaleString('ko-KR')}만원이 공제 한도를 넘으니, 넘는 만큼은 IRP로 나눠 넣는 방법도 있습니다.`
              : '.'}
          </p>
        </div>
      </Card>

      <BackupCard />
      <DataCard />
    </section>
  )
}

function BackupCard() {
  const last = useLiveQuery(lastBackupAt)
  const [msg, setMsg] = useState('')
  const [pending, setPending] = useState<Backup>()
  const age = daysSince(last)

  const file = async () => {
    const b = await createBackup()
    return new File([JSON.stringify(b)], backupFileName(b), { type: 'application/json' })
  }
  const share = async () => {
    const f = await file()
    try {
      await navigator.share({ files: [f], title: f.name })
      await markBackedUp()
      setMsg('공유했습니다. 저장한 곳(예: Google Drive)을 기억해 두세요.')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg('공유하지 못했습니다. "파일로 저장"을 써 보세요.')
    }
  }
  const download = async () => {
    const f = await file()
    const url = URL.createObjectURL(f)
    const a = document.createElement('a')
    a.href = url
    a.download = f.name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    await markBackedUp()
    setMsg(`${f.name} 파일을 다운로드 폴더에 저장했습니다.`)
  }
  const pick = async (f?: File) => {
    if (!f) return
    try {
      setPending(readBackup(JSON.parse(await f.text())))
      setMsg('')
    } catch (e) {
      setPending(undefined)
      setMsg(e instanceof SyntaxError ? '백업 파일을 읽지 못했습니다.' : (e as Error).message)
    }
  }

  return (
    <Card title="백업" right={<span className={`text-xs ${age == null || age >= BACKUP_REMIND_DAYS ? 'text-amber-700' : 'text-slate-500'}`}>{last ? `마지막 ${age}일 전` : '백업한 적 없음'}</span>}>
      <p className="text-xs text-slate-500">데이터는 이 휴대폰에만 있습니다. 한 달에 한 번, 불입 기록 후 백업해 두세요.</p>
      <div className="mt-3 flex gap-2">
        {'share' in navigator && (
          <Button className="flex-1" onClick={share}>
            공유로 저장
          </Button>
        )}
        <Button kind="secondary" className="flex-1" onClick={download}>
          파일로 저장
        </Button>
      </div>
      <label className="mt-3 block text-sm text-indigo-700">
        백업에서 복원…
        <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {pending && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {pending.exportedAt.slice(0, 10)} 백업: 종목 {pending.etfs.length}개, 기록 {pending.entries.length}건. 휴대폰의 내용을 지우고 이 백업으로 바꿉니다.
          <div className="mt-2 flex gap-2">
            <Button
              onClick={async () => {
                await restoreBackup(pending)
                setPending(undefined)
                setMsg('복원했습니다.')
              }}
            >
              복원
            </Button>
            <Button kind="secondary" onClick={() => setPending(undefined)}>
              취소
            </Button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-slate-700">{msg}</p>}
    </Card>
  )
}

function DataCard() {
  const count = useLiveQuery(() => db.entries.count())
  return (
    <Card title="데이터">
      <p className="text-xs text-slate-500">기록 {count ?? 0}건. 서버로 보내지 않고 이 휴대폰(브라우저 저장소)에만 저장합니다.</p>
      <Button
        kind="danger"
        className="mt-3 w-full"
        onClick={async () => {
          if (confirm('종목·기록·가격·설정을 모두 지울까요? 되돌릴 수 없습니다.')) await clearAll()
        }}
      >
        모든 데이터 지우기
      </Button>
    </Card>
  )
}
