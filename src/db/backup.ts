import type { Entry, Etf, PricePoint, Settings } from '../model'
import { db, getSettings } from './db'

const APP = 'pension-mgmt'
const FORMAT = 1

export interface Backup {
  app: typeof APP
  format: number
  exportedAt: string
  settings: Settings
  etfs: Etf[]
  entries: Entry[]
  prices: PricePoint[]
}

export async function createBackup(): Promise<Backup> {
  const [settings, etfs, entries, prices] = await Promise.all([getSettings(), db.etfs.toArray(), db.entries.orderBy('date').toArray(), db.prices.toArray()])
  return { app: APP, format: FORMAT, exportedAt: new Date().toISOString(), settings, etfs, entries, prices }
}

export function backupFileName(b: Backup) {
  return `개인연금-백업-${b.exportedAt.slice(0, 10)}.json`
}

export async function markBackedUp(at = new Date().toISOString()) {
  await db.meta.put({ key: 'lastBackupAt', value: at })
}

export async function lastBackupAt(): Promise<string | undefined> {
  return (await db.meta.get('lastBackupAt'))?.value as string | undefined
}

/** Checks that a parsed JSON file is one of our backups; throws a message for the user otherwise. */
export function readBackup(json: unknown): Backup {
  const b = json as Partial<Backup>
  if (!b || b.app !== APP || !Array.isArray(b.etfs) || !Array.isArray(b.entries) || !Array.isArray(b.prices)) {
    throw new Error('이 앱에서 만든 백업 파일이 아닙니다.')
  }
  if ((b.format ?? 0) > FORMAT) throw new Error('더 새로운 버전의 앱에서 만든 백업입니다. 앱을 업데이트한 뒤 다시 시도하세요.')
  if (b.entries.some((e) => typeof e?.date !== 'string' || typeof e.kind !== 'string')) throw new Error('백업 파일의 내용이 손상되었습니다.')
  return b as Backup
}

/** 휴대폰의 내용을 지우고 백업으로 바꿉니다. */
export async function restoreBackup(b: Backup) {
  await db.transaction('rw', db.etfs, db.entries, db.prices, db.meta, async () => {
    await Promise.all([db.etfs.clear(), db.entries.clear(), db.prices.clear(), db.meta.delete('sample')])
    await db.meta.put({ key: 'settings', value: b.settings })
    await db.etfs.bulkPut(b.etfs)
    await db.entries.bulkAdd(b.entries.map(({ id: _id, ...e }) => e))
    await db.prices.bulkPut(b.prices)
  })
}
