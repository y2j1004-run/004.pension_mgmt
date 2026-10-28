import { describe, expect, it } from 'vitest'
import { avgTradingValue, buildAll, decode, parseDailyBars, parseDailyCloses, parseEtfList } from './naver.mjs'

describe('naver parsing', () => {
  it('reads the ETF list', () => {
    const json = { resultCode: 'success', result: { etfItemList: [{ itemcode: '069500', etfTabCode: 1, itemname: 'KODEX 200', nowVal: 95650 }, { itemcode: '' }] } }
    expect(parseEtfList({ result: { etfItemList: [{ ...json.result.etfItemList[0], marketSum: 123456 }] } })).toEqual([{ code: '069500', name: 'KODEX 200', tab: 1, aum: 123456 }])
    expect(parseEtfList(json)[0].aum).toBe(0)
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

  it('averages recent trading value in 억원 and lines every fund up on one date list', () => {
    const xml = `<item data="20261027|0|0|0|10000|50000" /><item data="20261028|0|0|0|10200|30000" />`
    const bars = parseDailyBars(xml)
    expect(bars).toEqual([
      ['2026-10-27', 10000, 50000],
      ['2026-10-28', 10200, 30000],
    ])
    expect(avgTradingValue(bars)).toBe(4.03) // (5억 + 3.06억) / 2
    const all = buildAll(
      [
        { code: 'A', name: 'a', tab: 1, aum: 10, amount: 1, prices: [['2026-10-27', 1], ['2026-10-28', 2]] },
        { code: 'B', name: 'b', tab: 4, aum: 5, amount: 2, prices: [['2026-10-28', 3]] },
      ],
      'now',
    )
    expect(all.dates).toEqual(['2026-10-27', '2026-10-28'])
    expect(all.items[1]).toEqual(['B', 'b', 4, 5, 2, [null, 3]])
  })

  it('decodes EUC-KR text', () => {
    const euckr = new Uint8Array([0xbf, 0xac, 0xb1, 0xdd]) // 연금
    expect(decode(euckr.buffer, 'text/plain;charset=EUC-KR')).toBe('연금')
    expect(decode(euckr.buffer, '')).toBe('연금')
    expect(decode(new TextEncoder().encode('연금').buffer, 'application/json')).toBe('연금')
  })
})
