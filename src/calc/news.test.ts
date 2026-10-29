import { describe, expect, it } from 'vitest'
import { relatedThemes, themesOf, type NewsFile } from './news'

describe('news themes', () => {
  it('matches funds to themes by name', () => {
    expect(themesOf('KODEX 200')).toEqual(['kospi'])
    expect(themesOf('ACE 엔비디아밸류체인액티브')).toEqual(['nvidia', 'semi'])
    expect(themesOf('KODEX 테슬라커버드콜채권혼합액티브')).toEqual(['tesla', 'rates', 'dividend'])
    expect(themesOf('KODEX 미국AI전력핵심인프라')).toEqual(['us', 'fx', 'power'])
    expect(themesOf('KODEX 금액티브')).toEqual(['gold'])
    expect(themesOf('KODEX 주주환원고배당주')).toEqual(['dividend'])
  })

  it('lists the themes related to my funds, leaving out empty and market-wide ones', () => {
    const h = { title: 't', source: 's', link: 'l', date: 'd' }
    const news: NewsFile = {
      updatedAt: '',
      themes: [
        { id: 'kospi', label: '국내 증시', items: [h] },
        { id: 'semi', label: '반도체', items: [h] },
        { id: 'gold', label: '금', items: [] },
        { id: 'tesla', label: '테슬라', items: [h] },
      ],
    }
    expect(relatedThemes(['KODEX AI반도체TOP2플러스', 'KODEX 금액티브'], news)).toEqual([{ id: 'semi', label: '반도체', items: [h], funds: ['KODEX AI반도체TOP2플러스'] }])
  })
})
