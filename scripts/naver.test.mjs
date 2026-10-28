import { describe, expect, it } from 'vitest'
import { decode, parseDailyCloses, parseEtfList } from './naver.mjs'

describe('naver parsing', () => {
  it('reads the ETF list', () => {
    const json = { resultCode: 'success', result: { etfItemList: [{ itemcode: '069500', etfTabCode: 1, itemname: 'KODEX 200', nowVal: 95650 }, { itemcode: '' }] } }
    expect(parseEtfList(json)).toEqual([{ code: '069500', name: 'KODEX 200', tab: 1 }])
    expect(() => parseEtfList({})).toThrow()
  })

  it('reads daily closes from the chart XML, oldest first', () => {
    const xml = `<?xml version="1.0" encoding="EUC-KR" ?><protocol><chartdata symbol="0040X0" name="SOL" count="3" timeframe="day">
      <item data="20261028|9300|9400|9250|9345|120000" />
      <item data="20261027|9200|9350|9150|9290.5|98000" />
      <item data="20261024|0|0|0|0|0" />
    </chartdata></protocol>`
    expect(parseDailyCloses(xml)).toEqual([
      ['2026-10-27', 9290.5],
      ['2026-10-28', 9345],
    ])
  })

  it('decodes EUC-KR text', () => {
    const euckr = new Uint8Array([0xbf, 0xac, 0xb1, 0xdd]) // 연금
    expect(decode(euckr.buffer, 'text/plain;charset=EUC-KR')).toBe('연금')
    expect(decode(euckr.buffer, '')).toBe('연금')
    expect(decode(new TextEncoder().encode('연금').buffer, 'application/json')).toBe('연금')
  })
})
