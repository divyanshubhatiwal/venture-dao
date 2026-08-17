/**
 * Gemini, used for the one thing a language model is actually good at here.
 *
 * WHAT IT DOES: reads the market headlines this app already fetches and
 * returns a structured sentiment read — direction, strength, the themes it
 * saw, and which headlines drove it.
 *
 * WHAT IT DOES NOT DO: forecast prices. A language model has no access to a
 * price series except as text, no training objective related to returns, and
 * it will produce a fluent, confident answer either way. Asking it "will ETH
 * go up" produces prose, not a prediction, and dressing that up as a signal
 * would be the most convincing lie this codebase could tell. Numeric
 * prediction stays with the trained model in src/lib/agent/model.js, which can
 * at least be scored against outcomes it never saw.
 *
 * Reading sentiment out of text IS a language task, and one where the output
 * can be checked against the source by anyone who reads the headlines.
 *
 * THE KEY IS SERVER-SIDE ONLY. It is read from the environment here and must
 * never be prefixed VITE_ — that prefix compiles a value into the browser
 * bundle, which for an API key means publishing it and handing strangers your
 * quota. There is deliberately no route that returns the key.
 */

/**
 * Pinned rather than "-latest".
 *
 * A model that silently changes underneath a trading app changes its judgement
 * with no commit and no way to explain the difference. Two models were retired
 * while this was being built — gemini-2.0-flash and gemini-2.5-flash both
 * returned 404 "no longer available" — which is exactly the failure this pin
 * makes loud instead of silent. The error names the model so it is actionable.
 *
 * A "lite" model is the right size: this is short-text classification, not
 * reasoning, and the larger models cost more for no better answer.
 *
 * GEMINI_MODEL overrides it without a code change when the next one retires.
 */
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const TIMEOUT_MS = 15_000
const CACHE_MS = 10 * 60_000
const MAX_HEADLINES = 25

let cache = { at: 0, payload: null, key: null }

export const hasGeminiKey = () => Boolean(process.env.GEMINI_API_KEY)

/**
 * Ask for JSON and enforce it with a schema.
 *
 * Without responseSchema the model returns prose around its JSON perhaps one
 * time in twenty, and the parse fails at exactly the wrong moment. The schema
 * makes the shape a contract rather than a hope.
 */
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    sentiment: { type: 'STRING', enum: ['bullish', 'bearish', 'neutral'] },
    // 0..1. Asked for explicitly so "slightly negative" and "market in
    // freefall" do not collapse into the same label.
    strength: { type: 'NUMBER' },
    summary: { type: 'STRING' },
    themes: { type: 'ARRAY', items: { type: 'STRING' } },
    drivers: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['sentiment', 'strength', 'summary', 'themes'],
}

const PROMPT = `You are reading market news headlines to judge sentiment.

Rules:
- Judge ONLY what the headlines say. Do not use outside knowledge of prices.
- Do not predict prices or give trading advice.
- If the headlines are mixed or mundane, say neutral. Most days are neutral.
- "strength" is 0 to 1: how strongly the headlines lean, not how confident you feel.
- "drivers" must quote the exact headlines that moved your read, at most three.

Headlines:`

/**
 * Analyse headlines. Returns a structured read, or a reason it could not.
 *
 * Never throws for an unconfigured key or an upstream failure — the news panel
 * has to render regardless, and sentiment is a nice-to-have layered on top of
 * headlines that stand on their own.
 */
export async function analyseSentiment(items, { now = Date.now(), fetchImpl = fetch, force = false } = {}) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { ok: false, configured: false, reason: 'GEMINI_API_KEY is not set — sentiment analysis is off.' }
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, configured: true, reason: 'No headlines to analyse.' }
  }

  const headlines = items.slice(0, MAX_HEADLINES).map((i) => `- ${i.title}`)
  // Key the cache on the headlines themselves: same news, same answer, and no
  // reason to spend another call on it.
  const cacheKey = headlines.join('\n')
  if (!force && cache.payload && cache.key === cacheKey && now - cache.at < CACHE_MS) {
    return { ...cache.payload, cached: true, ageMs: now - cache.at }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetchImpl(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${PROMPT}\n${cacheKey}` }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: SCHEMA,
          // Low, not zero: sentiment reading benefits from a little slack, but
          // a trading screen should not say something different each refresh.
          temperature: 0.2,
        },
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      // The key must never reach a log or an API response. Google echoes the
      // request URL in some errors, so the text is scrubbed before it travels.
      return { ok: false, configured: true, reason: `Gemini returned HTTP ${res.status}.`, detail: redact(body).slice(0, 200) }
    }

    const json = await res.json()
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return { ok: false, configured: true, reason: 'Gemini returned no content.' }

    const parsed = JSON.parse(text)
    const payload = {
      ok: true,
      configured: true,
      model: MODEL,
      sentiment: parsed.sentiment,
      strength: Math.max(0, Math.min(1, Number(parsed.strength) || 0)),
      summary: parsed.summary,
      themes: (parsed.themes ?? []).slice(0, 5),
      drivers: (parsed.drivers ?? []).slice(0, 3),
      headlinesRead: headlines.length,
      analysedAt: now,
      // Carried in the payload so the UI cannot present this as anything else.
      caveat: 'Sentiment read from headlines by a language model. Not a price prediction.',
    }

    cache = { at: now, payload, key: cacheKey }
    return { ...payload, cached: false, ageMs: 0 }
  } catch (err) {
    const reason = err?.name === 'AbortError' ? 'Gemini timed out.' : `Gemini call failed: ${redact(err?.message ?? '')}`
    return { ok: false, configured: true, reason }
  } finally {
    clearTimeout(timer)
  }
}

/** Strip anything that looks like the key out of text before it is logged. */
export function redact(text) {
  const key = process.env.GEMINI_API_KEY
  let out = String(text ?? '')
  if (key) out = out.split(key).join('***')
  return out.replace(/key=[A-Za-z0-9_\-]{10,}/g, 'key=***').replace(/AIza[A-Za-z0-9_\-]{20,}/g, 'AIza***')
}

export function _resetGeminiCache() {
  cache = { at: 0, payload: null, key: null }
}
