import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withMongo } from './helpers/mongo.js'
import { useMongo } from '../storage/mongo.js'
import { SENTIMENT_RULES, recordReading, scoreDueReadings, sentimentSkill } from '../market/sentimentTrack.js'

withMongo()

const { HORIZON_MS, MIN_SAMPLES } = SENTIMENT_RULES
const OLD = Date.now() - HORIZON_MS - 1000

/** Seed n scored readings, `hits` of which were followed the right way. */
const seed = async (n, hits) => {
  const rows = Array.from({ length: n }, (_, i) => ({
    symbol: 'ETH',
    sentiment: 'bullish',
    strength: 0.6,
    price: 100,
    readAt: OLD,
    scored: true,
    confirmed: i < hits,
    movePercent: i < hits ? 1 : -1,
  }))
  await useMongo().collection('sentimentReadings').insertMany(rows)
}

describe('recording', () => {
  it('writes down the price the reading was taken at', async () => {
    await recordReading({ symbol: 'ETH', sentiment: 'bullish', strength: 0.7, price: 1885 })
    const [doc] = await useMongo().collection('sentimentReadings').find().toArray()
    expect(doc.price).toBe(1885)
    expect(doc.scored).toBe(false)
  })

  /* Neutral makes no directional claim, so scoring it would be scoring
     nothing — and counting those as misses would understate real skill. */
  it('ignores a neutral read, which claims nothing to be right about', async () => {
    expect(await recordReading({ symbol: 'ETH', sentiment: 'neutral', strength: 0.1, price: 1885 })).toBeNull()
    expect(await useMongo().collection('sentimentReadings').countDocuments()).toBe(0)
  })

  it('refuses a reading with no usable price', async () => {
    expect(await recordReading({ symbol: 'ETH', sentiment: 'bullish', price: NaN })).toBeNull()
  })
})

describe('scoring', () => {
  it('waits the full horizon before judging a reading', async () => {
    await recordReading({ symbol: 'ETH', sentiment: 'bullish', strength: 0.6, price: 100 })
    const result = await scoreDueReadings({ priceOf: async () => 200 })
    expect(result.scored).toBe(0) // taken just now, nowhere near due
  })

  it('confirms a bullish read only when price rose past the cost', async () => {
    await useMongo().collection('sentimentReadings').insertOne({
      symbol: 'ETH', sentiment: 'bullish', strength: 0.6, price: 100, readAt: OLD, scored: false,
    })
    await scoreDueReadings({ priceOf: async () => 101 }) // +1%
    const [doc] = await useMongo().collection('sentimentReadings').find().toArray()
    expect(doc.confirmed).toBe(true)
  })

  /* The failure this whole project keeps running into: a correct direction on
     a move too small to pay for the trade is not a win. */
  it('rejects a correct direction that could not cover its own costs', async () => {
    await useMongo().collection('sentimentReadings').insertOne({
      symbol: 'ETH', sentiment: 'bullish', strength: 0.6, price: 100, readAt: OLD, scored: false,
    })
    await scoreDueReadings({ priceOf: async () => 100.1 }) // +0.1%, under the 0.3% round trip
    const [doc] = await useMongo().collection('sentimentReadings').find().toArray()
    expect(doc.confirmed).toBe(false)
  })

  it('confirms a bearish read when price fell past the cost', async () => {
    await useMongo().collection('sentimentReadings').insertOne({
      symbol: 'ETH', sentiment: 'bearish', strength: 0.6, price: 100, readAt: OLD, scored: false,
    })
    await scoreDueReadings({ priceOf: async () => 99 })
    const [doc] = await useMongo().collection('sentimentReadings').find().toArray()
    expect(doc.confirmed).toBe(true)
  })

  it('does not score the same reading twice', async () => {
    await useMongo().collection('sentimentReadings').insertOne({
      symbol: 'ETH', sentiment: 'bullish', strength: 0.6, price: 100, readAt: OLD, scored: false,
    })
    await scoreDueReadings({ priceOf: async () => 101 })
    expect((await scoreDueReadings({ priceOf: async () => 101 })).scored).toBe(0)
  })
})

describe('earning the vote', () => {
  /* The state this ships in. Nothing has been measured, so nothing votes. */
  it('gives zero weight before there is any evidence', async () => {
    const skill = await sentimentSkill()
    expect(skill.validated).toBe(false)
    expect(skill.weight).toBe(0)
    expect(skill.reason).toMatch(/has not been measured yet/)
  })

  it('still gives zero weight one sample short of the minimum', async () => {
    await seed(MIN_SAMPLES - 1, MIN_SAMPLES - 1) // a perfect record, but too few
    const skill = await sentimentSkill()
    expect(skill.validated).toBe(false)
    expect(skill.weight).toBe(0)
  })

  it('refuses the vote when enough readings show it does not predict', async () => {
    await seed(MIN_SAMPLES + 10, Math.floor((MIN_SAMPLES + 10) * 0.4)) // 40% hit rate
    const skill = await sentimentSkill()
    expect(skill.validated).toBe(false)
    expect(skill.weight).toBe(0)
    expect(skill.reason).toMatch(/does not predict/)
  })

  it('grants a vote once it has demonstrably earned one', async () => {
    await seed(50, 35) // 70%
    const skill = await sentimentSkill()
    expect(skill.validated).toBe(true)
    expect(skill.weight).toBeGreaterThan(0)
    expect(skill.hitRate).toBeCloseTo(0.7, 2)
  })

  it('gives a marginal result a marginal say, not a full one', async () => {
    await seed(50, 29) // 58%, just past the bar
    const marginal = await sentimentSkill()
    await useMongo().collection('sentimentReadings').deleteMany({})
    await seed(50, 45) // 90%
    const strong = await sentimentSkill()
    expect(marginal.weight).toBeLessThan(strong.weight)
  })

  it('caps the weight so sentiment can never dominate the decision', async () => {
    await seed(100, 100) // a perfect record
    expect((await sentimentSkill()).weight).toBeLessThanOrEqual(1.5)
  })
})
