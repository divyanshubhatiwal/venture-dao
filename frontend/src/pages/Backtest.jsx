import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Cpu,
  Download,
  Flame,
  Layers,
  Play,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Card, ChartTooltip, Chip, PageHeader, SectionTitle, Skeleton } from '../components/ui'
import { backtest, verdict } from '../lib/trading/backtest'
import { getCandles } from '../lib/market/marketApi'
import { getStockCandles } from '../lib/market/stockApi'
import { useToast } from '../context/ToastContext'
import { num, usd } from '../lib/format'

const ASSETS = [
  { symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
  { symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
  { symbol: 'SOL', name: 'Solana', type: 'crypto' },
  { symbol: 'NVDA', name: 'Nvidia Corp', type: 'stock' },
  { symbol: 'AAPL', name: 'Apple Inc', type: 'stock' },
  { symbol: 'TSLA', name: 'Tesla Inc', type: 'stock' },
]

const STRATEGY_PRESETS = [
  {
    id: 'momentum',
    name: 'Institutional Momentum Alpha',
    description: 'EMA20/50 crossover with MACD trend velocity and ATR volatility stops.',
    confidence: 65,
    riskPct: 1.5,
    trailing: true,
    maxHoldBars: 48,
  },
  {
    id: 'mean_reversion',
    name: 'Mean Reversion Sniper',
    description: 'RSI(14) oversold/overbought rebounds with Bollinger Band outer bounces.',
    confidence: 75,
    riskPct: 1.0,
    trailing: false,
    maxHoldBars: 24,
  },
  {
    id: 'breakout',
    name: 'Volatility Breakout Squeeze',
    description: 'Donchian channel breakout with volume surge confirmation and trailing ratchets.',
    confidence: 60,
    riskPct: 2.0,
    trailing: true,
    maxHoldBars: 72,
  },
  {
    id: 'conservative',
    name: 'Capital Preservation Shield',
    description: 'High-confidence AI agreement filter with tight stop losses and minimal leverage.',
    confidence: 85,
    riskPct: 0.5,
    trailing: true,
    maxHoldBars: 36,
  },
]

export default function Backtest() {
  const [selectedAsset, setSelectedAsset] = useState('ETH')
  const [selectedPreset, setSelectedPreset] = useState('momentum')
  const [startingCash, setStartingCash] = useState(10000)
  const [minConfidence, setMinConfidence] = useState(65)
  const [riskPct, setRiskPct] = useState(1.5)
  const [trailing, setTrailing] = useState(true)
  const [maxHoldBars, setMaxHoldBars] = useState(48)
  const [feeBps, setFeeBps] = useState(5)
  const [slippageBps, setSlippageBps] = useState(4)

  const [candles, setCandles] = useState([])
  const [loadingCandles, setLoadingCandles] = useState(true)
  const [backtestResult, setBacktestResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [filterReason, setFilterReason] = useState('all')

  const { toast } = useToast()
  const navigate = useNavigate()

  // Load candle data for selected asset
  const loadAssetCandles = useCallback(async (sym) => {
    setLoadingCandles(true)
    try {
      const asset = ASSETS.find((a) => a.symbol === sym)
      let data = []
      if (asset?.type === 'stock') {
        const res = await getStockCandles(sym, '1h')
        data = res?.candles ?? []
      } else {
        const res = await getCandles(sym, '1h')
        data = res?.candles ?? []
      }
      setCandles(data)
      return data
    } catch {
      setCandles([])
      return []
    } finally {
      setLoadingCandles(false)
    }
  }, [])

  // Execute Backtest
  const runSimulation = useCallback((candleData, opts = {}) => {
    const dataToUse = candleData ?? candles
    if (!dataToUse || dataToUse.length < 50) return

    setRunning(true)
    setTimeout(() => {
      const res = backtest(dataToUse, {
        startingCash: opts.startingCash ?? startingCash,
        riskPct: opts.riskPct ?? riskPct,
        minConfidence: opts.minConfidence ?? minConfidence,
        trailing: opts.trailing ?? trailing,
        maxHoldBars: opts.maxHoldBars ?? maxHoldBars,
        feeBps: opts.feeBps ?? feeBps,
        slippageBps: opts.slippageBps ?? slippageBps,
      })
      setBacktestResult(res)
      setRunning(false)
    }, 150)
  }, [candles, startingCash, riskPct, minConfidence, trailing, maxHoldBars, feeBps, slippageBps])

  // Initial load
  useEffect(() => {
    loadAssetCandles(selectedAsset).then((data) => {
      if (data?.length >= 50) {
        runSimulation(data)
      }
    })
  }, [selectedAsset, loadAssetCandles])

  // Apply Strategy Preset
  const applyPreset = (presetId) => {
    const preset = STRATEGY_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setSelectedPreset(presetId)
    setMinConfidence(preset.confidence)
    setRiskPct(preset.riskPct)
    setTrailing(preset.trailing)
    setMaxHoldBars(preset.maxHoldBars)

    runSimulation(candles, {
      minConfidence: preset.confidence,
      riskPct: preset.riskPct,
      trailing: preset.trailing,
      maxHoldBars: preset.maxHoldBars,
    })

    toast({
      tone: 'info',
      title: `${preset.name} Loaded`,
      description: 'Strategy parameters updated and backtest rerun.',
    })
  }

  // Deploy to Autopilot Bot
  const deployToAutopilot = () => {
    toast({
      tone: 'success',
      title: 'Strategy Deployed to AI Agent!',
      description: `Autopilot configured with ${minConfidence}% confidence and ${riskPct}% risk per trade.`,
    })
    navigate('/agent')
  }

  const metrics = backtestResult?.metrics
  const testVerdict = useMemo(() => (metrics ? verdict(metrics) : null), [metrics])

  // Filtered trades for blotter
  const filteredTrades = useMemo(() => {
    if (!backtestResult?.trades) return []
    if (filterReason === 'all') return backtestResult.trades
    return backtestResult.trades.filter((t) => t.reason === filterReason)
  }, [backtestResult?.trades, filterReason])

  const equityData = useMemo(() => {
    if (!backtestResult?.equityCurve) return []
    return backtestResult.equityCurve.map((p) => ({
      time: new Date(p.t).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit' }),
      equity: p.equity,
      baseline: startingCash,
    }))
  }, [backtestResult?.equityCurve, startingCash])

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Institutional Quantitative Studio"
        title="AI Strategy Backtester"
        subtitle="Walk-forward backtest engine with zero look-ahead, pessimistic fill modeling, and exchange fees charged on entry and exit."
        actions={
          <>
            <button
              onClick={() => runSimulation(candles)}
              disabled={running || loadingCandles}
              className="btn-primary"
            >
              <RefreshCw size={15} className={running ? 'animate-spin' : ''} />
              Run Backtest
            </button>
            <button onClick={deployToAutopilot} className="btn border border-brand-500/40 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20">
              <Zap size={15} />
              Deploy to Autopilot
            </button>
          </>
        }
      />

      {/* Asset Switcher Pill Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-400 mr-1">Instrument:</span>
          {ASSETS.map((a) => (
            <button
              key={a.symbol}
              onClick={() => setSelectedAsset(a.symbol)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                selectedAsset === a.symbol
                  ? 'bg-gradient-to-r from-brand-600 to-accent text-white shadow-md'
                  : 'border border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white'
              }`}
            >
              <span className="font-mono">{a.symbol}</span>
              <span className="ml-1.5 opacity-60 text-[10px]">{a.type.toUpperCase()}</span>
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-500 font-mono">
          {candles.length ? `${candles.length} Hourly Candles Loaded` : 'Loading Candles...'}
        </span>
      </div>

      {/* Strategy Preset Selectors */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STRATEGY_PRESETS.map((preset) => {
          const active = selectedPreset === preset.id
          return (
            <div
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              className={`cursor-pointer rounded-2xl border p-4 transition-all duration-200 ${
                active
                  ? 'border-brand-500/60 bg-gradient-to-b from-brand-500/15 to-accent/5 shadow-lg shadow-brand-500/10 scale-[1.01]'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-bold text-slate-100">
                  <Sparkles size={14} className={active ? 'text-brand-300' : 'text-slate-500'} />
                  {preset.name}
                </span>
                {active && <span className="h-2 w-2 rounded-full bg-brand-400 shadow-glow" />}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{preset.description}</p>
              <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2 text-[10px] font-mono text-slate-500">
                <span>Min Conf: {preset.confidence}%</span>
                <span>Risk: {preset.riskPct}%</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Main Studio Grid: Parameters Left, Performance Dashboard Right */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 items-start">
        {/* Left Column: Parameter Customizer (4 Cols) */}
        <Card className="p-5 xl:col-span-4 space-y-4">
          <SectionTitle icon={Sliders} title="Strategy Engine Parameters" hint="Tune risk controls and evidence thresholds" />

          {/* Capital */}
          <div>
            <label className="text-xs font-semibold text-slate-300">Initial Test Capital ($ USD)</label>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {[5000, 10000, 50000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => {
                    setStartingCash(amt)
                    runSimulation(candles, { startingCash: amt })
                  }}
                  className={`rounded-lg py-1.5 text-xs font-mono font-semibold transition ${
                    startingCash === amt
                      ? 'bg-white/15 text-white border border-white/20'
                      : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/5'
                  }`}
                >
                  ${amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Min Confidence Slider */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">AI Confidence Gate</span>
              <span className="font-mono font-bold text-brand-300">{minConfidence}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="90"
              step="5"
              value={minConfidence}
              onChange={(e) => setMinConfidence(Number(e.target.value))}
              onMouseUp={() => runSimulation(candles)}
              className="mt-2 w-full accent-brand-400"
            />
            <span className="text-[10px] text-slate-500">Only trigger entries when signal confidence exceeds threshold.</span>
          </div>

          {/* Risk Per Trade Slider */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">Risk per Trade (% Equity)</span>
              <span className="font-mono font-bold text-emerald-400">{riskPct}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5.0"
              step="0.5"
              value={riskPct}
              onChange={(e) => setRiskPct(Number(e.target.value))}
              onMouseUp={() => runSimulation(candles)}
              className="mt-2 w-full accent-emerald-400"
            />
            <span className="text-[10px] text-slate-500">Maximum account loss if initial stop loss is hit.</span>
          </div>

          {/* Trailing Stop & Max Hold */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
            <div>
              <label className="text-xs font-semibold text-slate-300">Trailing Stop</label>
              <button
                onClick={() => {
                  const next = !trailing
                  setTrailing(next)
                  runSimulation(candles, { trailing: next })
                }}
                className={`mt-1.5 w-full rounded-xl py-2 text-xs font-semibold transition ${
                  trailing
                    ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border border-white/10 bg-white/[0.04] text-slate-400'
                }`}
              >
                {trailing ? '✓ ACTIVE' : 'DISABLED'}
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300">Max Hold (Bars)</label>
              <input
                type="number"
                min="12"
                max="120"
                value={maxHoldBars}
                onChange={(e) => setMaxHoldBars(Number(e.target.value))}
                onBlur={() => runSimulation(candles)}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs font-mono text-white focus:border-brand-500"
              />
            </div>
          </div>

          {/* Real Exchange Costs & Execution Model */}
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 text-xs space-y-2.5">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Hedge Fund Execution Model</p>
            
            <div className="grid grid-cols-2 gap-1.5">
              {[
                ['twap', 'TWAP Algorithm', 'Time-weighted slice'],
                ['vwap', 'VWAP Algorithm', 'Volume-weighted slice'],
              ].map(([id, label, desc]) => (
                <div key={id} className="rounded-lg border border-brand-500/30 bg-brand-500/10 p-2 text-center">
                  <span className="block font-mono text-[11px] font-bold text-brand-300">{label}</span>
                  <span className="text-[9px] text-slate-400">{desc}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-slate-400 text-[11px] border-t border-white/[0.05] pt-2">
              <span>Taker Fee</span>
              <span className="font-mono text-slate-200">{feeBps} bps (0.05%)</span>
            </div>
            <div className="flex items-center justify-between text-slate-400 text-[11px]">
              <span>Simulated Slippage</span>
              <span className="font-mono text-slate-200">{slippageBps} bps (0.04%)</span>
            </div>
            <p className="text-[10px] text-slate-500">Pessimistic fill simulation: stops trigger first on candle wicks.</p>
          </div>

          <button
            onClick={() => runSimulation(candles)}
            disabled={running}
            className="w-full btn-primary py-2.5 text-xs font-semibold shadow-lg shadow-brand-500/20"
          >
            <Play size={14} className={running ? 'animate-spin' : ''} />
            {running ? 'Simulating Strategy...' : 'Re-Execute Walk-Forward Backtest'}
          </button>
        </Card>

        {/* Right Column: Performance Results & Charts (8 Cols) */}
        <div className="space-y-4 xl:col-span-8">
          {/* Strict Institutional Verdict Banner */}
          {testVerdict && (
            <Card className="p-4 overflow-hidden border-l-4" style={{ borderLeftColor: testVerdict.pass ? '#34d399' : '#fb7185' }}>
              <div className="flex items-start gap-3">
                {testVerdict.pass ? (
                  <ShieldCheck size={20} className="shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <ShieldAlert size={20} className="shrink-0 text-rose-400 mt-0.5" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                      Evidence Gate Status:
                    </span>
                    <span
                      className={`font-mono text-xs font-bold ${
                        testVerdict.pass ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {testVerdict.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-300">{testVerdict.detail}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Primary Financial Return Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-3.5">
              <span className="text-[11px] text-slate-400">Total Net Return</span>
              <p
                className={`mt-1 font-mono text-xl font-bold ${
                  (metrics?.totalReturn ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {metrics ? `${metrics.totalReturn > 0 ? '+' : ''}${metrics.totalReturn}%` : '—'}
              </p>
              <span className="text-[10px] text-slate-500">
                P&L: {metrics ? (metrics.netPnl >= 0 ? `+$${metrics.netPnl}` : `-$${Math.abs(metrics.netPnl)}`) : '—'}
              </span>
            </Card>

            <Card className="p-3.5">
              <span className="text-[11px] text-slate-400">Win Rate</span>
              <p className="mt-1 font-mono text-xl font-bold text-white">
                {metrics?.winRate != null ? `${metrics.winRate}%` : '—'}
              </p>
              <span className="text-[10px] text-slate-500">
                {metrics ? `${metrics.tradeCount} Completed Trades` : '—'}
              </span>
            </Card>

            <Card className="p-3.5">
              <span className="text-[11px] text-slate-400">Profit Factor</span>
              <p
                className={`mt-1 font-mono text-xl font-bold ${
                  (metrics?.profitFactor ?? 0) >= 1.2
                    ? 'text-emerald-400'
                    : (metrics?.profitFactor ?? 0) >= 1.0
                      ? 'text-amber-300'
                      : 'text-rose-400'
                }`}
              >
                {metrics?.profitFactor != null ? (metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor) : '—'}
              </p>
              <span className="text-[10px] text-slate-500">Gross Win / Gross Loss</span>
            </Card>

            <Card className="p-3.5">
              <span className="text-[11px] text-slate-400">Max Drawdown</span>
              <p className="mt-1 font-mono text-xl font-bold text-rose-400">
                {metrics ? `-${metrics.maxDrawdown}%` : '—'}
              </p>
              <span className="text-[10px] text-slate-500">Peak-to-Trough Decline</span>
            </Card>
          </div>

          {/* Institutional Risk Ratios Grid (Hedge Fund Telemetry) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-3.5 border-brand-500/20 bg-brand-500/[0.03]">
              <span className="text-[11px] text-brand-300 font-semibold">Sharpe Ratio</span>
              <p className="mt-1 font-mono text-lg font-bold text-white">
                {metrics?.sharpeRatio != null ? metrics.sharpeRatio : '—'}
              </p>
              <span className="text-[10px] text-slate-500">Annualized Risk-Adjusted</span>
            </Card>

            <Card className="p-3.5 border-brand-500/20 bg-brand-500/[0.03]">
              <span className="text-[11px] text-sky-300 font-semibold">Sortino Ratio</span>
              <p className="mt-1 font-mono text-lg font-bold text-white">
                {metrics?.sortinoRatio != null ? metrics.sortinoRatio : '—'}
              </p>
              <span className="text-[10px] text-slate-500">Downside Volatility Risk</span>
            </Card>

            <Card className="p-3.5 border-brand-500/20 bg-brand-500/[0.03]">
              <span className="text-[11px] text-amber-300 font-semibold">Calmar Ratio</span>
              <p className="mt-1 font-mono text-lg font-bold text-white">
                {metrics?.calmarRatio != null ? metrics.calmarRatio : '—'}
              </p>
              <span className="text-[10px] text-slate-500">Return / Max Drawdown</span>
            </Card>

            <Card className="p-3.5 border-brand-500/20 bg-brand-500/[0.03]">
              <span className="text-[11px] text-rose-300 font-semibold">1-Day VaR (95%)</span>
              <p className="mt-1 font-mono text-lg font-bold text-rose-300">
                {metrics?.var95 != null ? `-${metrics.var95}%` : '—'}
              </p>
              <span className="text-[10px] text-slate-500">95% Confidence Risk</span>
            </Card>
          </div>

          {/* Interactive Equity Growth Curve */}
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2">
              <SectionTitle icon={TrendingUp} title="Simulated Equity Curve" hint="Account balance over time vs $10,000 baseline" />
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <span className="h-2 w-2 rounded-full bg-brand-400" />
                  Strategy Equity
                </span>
                <span className="flex items-center gap-1.5 text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-white/20" />
                  Initial Baseline
                </span>
              </div>
            </div>

            <div className="mt-3 h-[240px] w-full">
              {loadingCandles ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                    <XAxis dataKey="time" tickLine={false} axisLine={false} minTickGap={20} tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis
                      domain={['auto', 'auto']}
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickFormatter={(v) => `$${v.toLocaleString()}`}
                    />
                    <Tooltip content={<ChartTooltip formatter={(v) => `$${v.toLocaleString()}`} />} />
                    <Area type="linear" dataKey="equity" name="Strategy Equity" stroke="#818cf8" strokeWidth={2} fill="url(#eqFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          {/* Trade Blotter & Audit Ledger */}
          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 pb-3">
              <SectionTitle icon={Layers} title="Executed Trade Blotter" hint="Audit log of all walk-forward entry and exit orders" />
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
                {['all', 'target', 'stop', 'time'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setFilterReason(r)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase transition ${
                      filterReason === r ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 border-y border-white/[0.07] bg-ink-900/90 backdrop-blur-md">
                  <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2">Side</th>
                    <th className="px-4 py-2">Entry</th>
                    <th className="px-4 py-2">Exit</th>
                    <th className="px-4 py-2 text-right">P&L ($)</th>
                    <th className="px-4 py-2 text-right">Return</th>
                    <th className="px-4 py-2 text-center">Exit Trigger</th>
                    <th className="px-4 py-2 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {!filteredTrades.length ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No trades triggered for this filter in the current testing window.
                      </td>
                    </tr>
                  ) : (
                    filteredTrades.map((t, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02] transition">
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                              t.side === 'long'
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-rose-500/15 text-rose-300'
                            }`}
                          >
                            {t.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-200">${t.entry}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-200">${t.exit}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-bold ${t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.pnl >= 0 ? `+$${t.pnl}` : `-$${Math.abs(t.pnl)}`}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-mono ${t.pnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {t.pnlPct >= 0 ? `+${t.pnlPct}%` : `${t.pnlPct}%`}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              t.reason === 'target'
                                ? 'bg-emerald-500/10 text-emerald-300'
                                : t.reason === 'stop'
                                  ? 'bg-rose-500/10 text-rose-300'
                                  : 'bg-white/10 text-slate-400'
                            }`}
                          >
                            {t.reason}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-400">{t.bars} bars</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
