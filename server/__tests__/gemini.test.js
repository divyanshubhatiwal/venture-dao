import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetGeminiCache, analyseSentiment, hasGeminiKey, redact } from '../market/gemini.js'

const KEY = 'AIzaTESTKEY_not_a_real_one_1234567890'
const items = (n = 3) => Array.from({ length: n }, (_, i) => ({ title: `Headline ${i}`, link: `https://x/${i}` }))

const reply = (payload) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
})

const good = {
  sentiment: 'bearish',
  strength: 0.7,
  summary: 'Headlines point to selling pressure.',
  themes: ['rate fears', 'IT weakness'],
  drivers: ['Headline 0'],
}

beforeEach(() => {
  _resetGeminiCache()
  process.env.GEMINI_API_KEY = KEY
})
afterEach(() => {
  delete process.env.GEMINI_API_KEY
})

describe('configuration', () => {
  it('reports whether a key is present without revealing it', () => {
    expect(hasGeminiKey()).toBe(true)
    expect(String(hasGeminiKey())).not.toContain(KEY)
  })

  it('is off, not broken, when no key is configured', async () => {
    delete process.env.GEMINI_API_KEY
    const result = await analyseSentiment(items())
    expect(result.ok).toBe(false)
    expect(result.configured).toBe(false)
    expect(result.reason).toMatch(/not set/)
  })
})

describe('redaction', () => {
  /* The key must never reach a log, an error body or an API response. Google
     echoes the request URL in some errors, so everything is scrubbed. */
  it('removes the key from any text', () => {
    expect(redact(`failed for key=${KEY} at endpoint`)).not.toContain(KEY)
  })

  it('removes Google-shaped keys even when the env var differs', () => {
    delete process.env.GEMINI_API_KEY
    expect(redact('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345')).not.toMatch(/AIzaSy[A-Z]/)
  })

  it('leaves ordinary text alone', () => {
    expect(redact('Gemini returned HTTP 503.')).toBe('Gemini returned HTTP 503.')
  })
})

describe('analysis', () => {
  it('returns a structured read from the headlines', async () => {
    const fetchImpl = vi.fn(async () => reply(good))
    const result = await analyseSentiment(items(), { fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.sentiment).toBe('bearish')
    expect(result.strength).toBeCloseTo(0.7)
    expect(result.themes).toEqual(['rate fears', 'IT weakness'])
  })

  /* The payload has to carry its own caveat. Sentiment shown beside prices is
     one small step from being read as a forecast, and the wording is the only
     thing standing in the way. */
  it('always carries the caveat that this is not a prediction', async () => {
    const fetchImpl = vi.fn(async () => reply(good))
    const result = await analyseSentiment(items(), { fetchImpl })
    expect(result.caveat).toMatch(/[Nn]ot a price prediction/)
  })

  it('sends the headlines and asks for JSON back', async () => {
    const fetchImpl = vi.fn(async () => reply(good))
    await analyseSentiment(items(2), { fetchImpl })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.contents[0].parts[0].text).toContain('Headline 0')
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema).toBeTruthy()
  })

  it('clamps a strength the model returns out of range', async () => {
    const fetchImpl = vi.fn(async () => reply({ ...good, strength: 4.2 }))
    expect((await analyseSentiment(items(), { fetchImpl })).strength).toBe(1)
  })

  it('reports an upstream failure without leaking the key from the body', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => `API key not valid: key=${KEY}`,
    }))
    const result = await analyseSentiment(items(), { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/HTTP 403/)
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it('survives content that is not the JSON it asked for', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'sorry, here is some prose' }] } }] }),
    }))
    expect((await analyseSentiment(items(), { fetchImpl })).ok).toBe(false)
  })

  it('does nothing when there are no headlines', async () => {
    const fetchImpl = vi.fn()
    expect((await analyseSentiment([], { fetchImpl })).ok).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('cache', () => {
  it('does not pay for a second call on the same headlines', async () => {
    const fetchImpl = vi.fn(async () => reply(good))
    await analyseSentiment(items(), { fetchImpl, now: 1_000 })
    const second = await analyseSentiment(items(), { fetchImpl, now: 60_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(second.cached).toBe(true)
  })

  it('re-analyses when the headlines actually change', async () => {
    const fetchImpl = vi.fn(async () => reply(good))
    await analyseSentiment(items(3), { fetchImpl, now: 1_000 })
    await analyseSentiment(items(4), { fetchImpl, now: 2_000 })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
