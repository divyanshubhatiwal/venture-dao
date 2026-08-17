import { Router } from 'express'
import { getMarketNews } from '../market/news.js'
import { analyseSentiment } from '../market/gemini.js'
import { recordReading, sentimentSkill } from '../market/sentimentTrack.js'
import { getTicker, resolveConfig } from '../trading/delta.js'
import { asHandler } from '../middleware/asyncHelper.js'

const router = Router()

router.get(
  '/markets',
  asHandler(async () => {
    const news = await getMarketNews()
    // Sentiment is layered on top and never gates the headlines: if Gemini is
    // unconfigured, slow or failing, the news still renders.
    const sentiment = await analyseSentiment(news.items)

    // Record each fresh directional read against the price at that moment, so
    // it can be scored later against what actually happened. There is no
    // archive of headlines to backtest against, so evidence has to accumulate
    // forward.
    if (sentiment.ok && !sentiment.cached) {
      try {
        const ticker = await getTicker(resolveConfig(), 'BTCUSD').catch(() => null)
        const price = Number(ticker?.mark_price ?? ticker?.close ?? NaN)
        if (Number.isFinite(price)) {
          await recordReading({ symbol: 'BTC', sentiment: sentiment.sentiment, strength: sentiment.strength, price })
        }
      } catch {
        /* Recording is best-effort; it must never break the news route. */
      }
    }

    // How much say it has earned so far, returned alongside so the UI can show
    // that it is on probation rather than quietly influencing trades.
    const skill = await sentimentSkill().catch(() => null)
    return { ...news, sentiment: { ...sentiment, skill } }
  }),
)

/* The evidence behind sentiment's vote — deliberately readable, because an
   input that influences trades should be arguable. */
router.get('/sentiment/skill', asHandler(() => sentimentSkill()))

export default router
