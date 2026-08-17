import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Coins,
  Cpu,
  FilePlus,
  Flame,
  Globe,
  Hand,
  History,
  Hourglass,
  Layers,
  Lock,
  Plus,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Timer,
  TrendingUp,
  Users,
  Vote,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react'
import { Card, Chip, PageHeader, SectionTitle, Skeleton } from '../components/ui'
import { useWallet } from '../context/WalletContext'
import { useMarket } from '../context/MarketContext'
import { useToast } from '../context/ToastContext'
import { num, relativeTime, usd } from '../lib/format'

const INITIAL_PROPOSALS = [
  {
    id: 'VDAO-042',
    title: 'Deploy 50 ETH to Arbitrum Camelot Automated Liquidity Vault',
    category: 'Treasury Deployment',
    proposer: '0x8f2a4b17De93c1a05Ee7F3b62D40cA95bB71c410',
    requestedEth: 50,
    summary:
      'Allocate 50 ETH into Camelot decentralized liquidity pools on Arbitrum to harvest 14.8% APY yield with auto-compounding and 0% impermanent loss delta hedging.',
    forVotes: 642000,
    againstVotes: 48000,
    abstainVotes: 12000,
    quorumRequired: 400000,
    status: 'active',
    endsIn: '2 days 14 hours',
    userVoted: null,
  },
  {
    id: 'VDAO-043',
    title: 'Increase AI Autopilot Single-Position Risk Ceiling from 1.5% to 2.5%',
    category: 'Risk Engine',
    proposer: '0x32A4214E8f74B8D56e29789b7A163c4C56a29e12',
    requestedEth: 0,
    summary:
      'Allow the AI Trading Agent to allocate up to 2.5% risk per trade on high-confidence (85%+) macro trend breakouts, accelerating capital growth toward the 300 ETH target.',
    forVotes: 512000,
    againstVotes: 184000,
    abstainVotes: 24000,
    quorumRequired: 400000,
    status: 'active',
    endsIn: '4 days 8 hours',
    userVoted: null,
  },
  {
    id: 'VDAO-044',
    title: 'Allocate 25 ETH to NVIDIA & Tech Equity Delta-Hedging Desk',
    category: 'Cross-Market Expansion',
    proposer: '0x19B8cE072E2164A4A9A13970bF15B17a783785Fe',
    requestedEth: 25,
    summary:
      'Establish liquidity on the synthetic equity desk for NVDA, AAPL, and TSLA tokenized perps with 0% delta market neutrality.',
    forVotes: 388000,
    againstVotes: 96000,
    abstainVotes: 15000,
    quorumRequired: 400000,
    status: 'active',
    endsIn: '5 days 21 hours',
    userVoted: null,
  },
]

const EXECUTED_PROPOSALS = [
  {
    id: 'VDAO-041',
    title: 'Integrate Delta Exchange Testnet for Institutional Perps Order Routing',
    category: 'Protocol Upgrade',
    requestedEth: 0,
    forVotes: 890000,
    againstVotes: 12000,
    status: 'executed',
    executedAt: '3 days ago',
  },
  {
    id: 'VDAO-040',
    title: 'Seed 100 ETH to Base Chain Treasury Smart Contract',
    category: 'Treasury',
    requestedEth: 100,
    forVotes: 1020000,
    againstVotes: 40000,
    status: 'executed',
    executedAt: '12 days ago',
  },
  {
    id: 'VDAO-039',
    title: 'Activate Walk-Forward Backtesting Evidence Gate on Signal Engine',
    category: 'AI Model Safety',
    requestedEth: 0,
    forVotes: 940000,
    againstVotes: 8000,
    status: 'executed',
    executedAt: '24 days ago',
  },
]

export default function Governance() {
  const [govTab, setGovTab] = useState('proposals')
  const [proposals, setProposals] = useState(INITIAL_PROPOSALS)
  const [votingOn, setVotingOn] = useState(null)

  // New proposal form
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Treasury Deployment')
  const [requestedEth, setRequestedEth] = useState('25')
  const [summary, setSummary] = useState('')

  const { account, connect, connecting } = useWallet()
  const { ethPrice } = useMarket()
  const { toast } = useToast()

  const votingPower = account?.votingPower ?? 84000

  // Keyboard navigation for sub-tabs (1, 2, 3)
  useEffect(() => {
    const handleKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      if (e.key === '1') setGovTab('proposals')
      if (e.key === '2') setGovTab('create')
      if (e.key === '3') setGovTab('history')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  // Handle vote cast
  const castVote = (proposalId, support) => {
    setVotingOn(proposalId)
    setTimeout(() => {
      setProposals((prev) =>
        prev.map((p) => {
          if (p.id !== proposalId) return p
          return {
            ...p,
            forVotes: support === 'for' ? p.forVotes + votingPower : p.forVotes,
            againstVotes: support === 'against' ? p.againstVotes + votingPower : p.againstVotes,
            abstainVotes: support === 'abstain' ? p.abstainVotes + votingPower : p.abstainVotes,
            userVoted: support,
          }
        }),
      )
      setVotingOn(null)
      toast({
        tone: 'success',
        title: 'Vote Cast Successfully!',
        description: `Your ${votingPower.toLocaleString()} VDAO voting weight was submitted on-chain for ${support.toUpperCase()}.`,
      })
    }, 400)
  }

  // Handle submit proposal
  const submitProposal = (e) => {
    e.preventDefault()
    if (!title.trim() || !summary.trim()) {
      toast({ tone: 'warn', title: 'Missing Fields', description: 'Please provide a title and summary.' })
      return
    }

    const newProp = {
      id: `VDAO-04${proposals.length + 2}`,
      title,
      category,
      proposer: account?.address ?? '0x8f2a4b17De93c1a05Ee7F3b62D40cA95bB71c410',
      requestedEth: Number(requestedEth) || 0,
      summary,
      forVotes: votingPower,
      againstVotes: 0,
      abstainVotes: 0,
      quorumRequired: 400000,
      status: 'active',
      endsIn: '7 days',
      userVoted: 'for',
    }

    setProposals([newProp, ...proposals])
    setTitle('')
    setSummary('')
    setGovTab('proposals')

    toast({
      tone: 'success',
      title: 'Proposal Submitted to DAO!',
      description: `${newProp.id} is now open for community voting.`,
    })
  }

  const treasuryEth = DAO_STATS.treasuryEth
  const treasuryUsd = ethPrice ? treasuryEth * ethPrice : 1581250

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Decentralized Autonomous Organization"
        title="DAO Governance & Capital Allocator"
        subtitle="On-chain voting portal: allocate DAO treasury funds, approve algorithmic strategies, and govern protocol risk ceilings."
        actions={
          <>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 backdrop-blur-md">
              <Vote size={14} className="text-brand-300" />
              <span className="text-xs font-semibold text-slate-300">
                Voting Power: <span className="font-mono text-white">{votingPower.toLocaleString()} VDAO</span>
              </span>
            </div>

            {!account ? (
              <button onClick={connect} disabled={connecting} className="btn-primary">
                <Wallet size={15} />
                {connecting ? 'Connecting...' : 'Connect Web3 Wallet'}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-mono text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {account.address.slice(0, 6)}...{account.address.slice(-4)}
              </span>
            )}
          </>
        }
      />

      {/* Treasury Capital Allocation Banner */}
      <Card className="mb-5 p-5 overflow-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-white/[0.07]">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-300">
              <Coins size={15} />
              <span>DAO Controlled Capital</span>
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="font-mono text-2xl font-bold text-white">{treasuryEth} ETH</span>
              <span className="font-mono text-sm text-slate-400">≈ ${treasuryUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs">
            <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3.5 py-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Active Proposals</span>
              <p className="mt-0.5 font-mono text-base font-bold text-white">{proposals.length} Open</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3.5 py-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Total Votes Cast</span>
              <p className="mt-0.5 font-mono text-base font-bold text-emerald-400">1.84M VDAO</p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3.5 py-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-500">Quorum Standard</span>
              <p className="mt-0.5 font-mono text-base font-bold text-slate-200">40.0% Required</p>
            </div>
          </div>
        </div>

        {/* 4-Way Allocation Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-300 pb-2">
            <span>Treasury Deployment Ratio</span>
            <span className="font-mono text-emerald-400">89.3% Capital Efficiency</span>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full bg-white/[0.08] flex">
            <div className="h-full bg-brand-500 transition-all" style={{ width: '45%' }} title="AI Autopilot (285 ETH)" />
            <div className="h-full bg-emerald-500 transition-all" style={{ width: '28%' }} title="DeFi Yield (180 ETH)" />
            <div className="h-full bg-sky-500 transition-all" style={{ width: '16%' }} title="Reserves (100 ETH)" />
            <div className="h-full bg-amber-500 transition-all" style={{ width: '11%' }} title="Unallocated (67.5 ETH)" />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4 pt-1">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-brand-500" />
              AI Autopilot: <strong className="font-mono text-white">285 ETH (45%)</strong>
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Yield Staking: <strong className="font-mono text-white">180 ETH (28%)</strong>
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-sky-500" />
              Reserves / Cash: <strong className="font-mono text-white">100 ETH (16%)</strong>
            </span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              Unallocated: <strong className="font-mono text-white">67.5 ETH (11%)</strong>
            </span>
          </div>
        </div>
      </Card>

      {/* Segmented Tab Switcher */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/40 p-1.5 backdrop-blur-xl">
        {[
          { id: 'proposals', label: 'Active Proposals', icon: Vote, num: '1', badge: proposals.length },
          { id: 'create', label: 'Create New Proposal', icon: FilePlus, num: '2' },
          { id: 'history', label: 'Execution Ledger & History', icon: History, num: '3', badge: EXECUTED_PROPOSALS.length },
        ].map(({ id, label, icon: Icon, num, badge }) => {
          const active = govTab === id
          return (
            <button
              key={id}
              onClick={() => setGovTab(id)}
              className={`group flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
                active
                  ? 'bg-gradient-to-r from-brand-600 to-accent text-white shadow-lg shadow-brand-500/25 scale-[1.02]'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <Icon size={14} className={active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'} />
              <span>{label}</span>
              {badge != null && (
                <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-400'}`}>
                  {badge}
                </span>
              )}
              <kbd
                className={`ml-1 rounded px-1.5 py-0.5 font-mono text-[9px] transition ${
                  active ? 'bg-black/30 text-brand-200' : 'bg-white/[0.06] text-slate-500 group-hover:text-slate-300'
                }`}
              >
                {num}
              </kbd>
            </button>
          )
        })}
      </div>

      {/* Tab 1: Active Proposals */}
      {govTab === 'proposals' && (
        <div className="space-y-4">
          {proposals.map((p) => {
            const totalVotes = p.forVotes + p.againstVotes + p.abstainVotes || 1
            const forPct = Math.round((p.forVotes / totalVotes) * 100)
            const againstPct = Math.round((p.againstVotes / totalVotes) * 100)
            const quorumMet = totalVotes >= p.quorumRequired

            return (
              <Card key={p.id} className="p-5 overflow-hidden transition hover:border-white/20">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-brand-300">{p.id}</span>
                      <Chip tone="border-brand-500/30 bg-brand-500/10 text-brand-200">{p.category}</Chip>
                      {p.requestedEth > 0 && (
                        <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                          Requesting {p.requestedEth} ETH
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[11px] text-slate-500 ml-auto sm:ml-0">
                        <Timer size={12} />
                        Ends in {p.endsIn}
                      </span>
                    </div>

                    <h3 className="mt-2 text-base font-bold text-white">{p.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-300">{p.summary}</p>
                    <p className="mt-2 text-[10px] font-mono text-slate-500">Proposer: {p.proposer}</p>
                  </div>

                  {/* Quorum Badge */}
                  <div className="shrink-0 rounded-xl border border-white/10 bg-black/20 p-3 text-center sm:w-44">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400">Quorum Status</span>
                    <p className={`mt-1 font-mono text-xs font-bold ${quorumMet ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {quorumMet ? '✓ Quorum Met' : 'Quorum Pending'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-500 font-mono">
                      {(totalVotes / 1000).toFixed(0)}k / {(p.quorumRequired / 1000).toFixed(0)}k VDAO
                    </p>
                  </div>
                </div>

                {/* Vote Percentage Progress Bars */}
                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  <div className="flex items-center justify-between text-xs font-semibold pb-1.5">
                    <span className="text-emerald-400">FOR: {forPct}% ({p.forVotes.toLocaleString()} VDAO)</span>
                    <span className="text-rose-400">AGAINST: {againstPct}% ({p.againstVotes.toLocaleString()} VDAO)</span>
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08] flex">
                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${forPct}%` }} />
                    <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${againstPct}%` }} />
                  </div>
                </div>

                {/* Voting Action Buttons */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-1">
                  {p.userVoted ? (
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 size={16} />
                      <span>You voted <strong className="uppercase">{p.userVoted}</strong> with your {votingPower.toLocaleString()} VDAO</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => castVote(p.id, 'for')}
                        disabled={votingOn === p.id}
                        className="flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20"
                      >
                        <ThumbsUp size={13} />
                        Vote FOR
                      </button>

                      <button
                        onClick={() => castVote(p.id, 'against')}
                        disabled={votingOn === p.id}
                        className="flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20"
                      >
                        <ThumbsDown size={13} />
                        Vote AGAINST
                      </button>

                      <button
                        onClick={() => castVote(p.id, 'abstain')}
                        disabled={votingOn === p.id}
                        className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-slate-400 transition hover:text-white"
                      >
                        <Hand size={13} />
                        Abstain
                      </button>
                    </div>
                  )}

                  <span className="text-[11px] text-slate-500 font-mono">
                    Smart Contract Timelock: 24h post-vote
                  </span>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Tab 2: Create Proposal */}
      {govTab === 'create' && (
        <Card className="p-6">
          <SectionTitle icon={FilePlus} title="Draft New DAO Proposal" hint="Submit an on-chain proposal for community voting" />

          <form onSubmit={submitProposal} className="mt-4 space-y-4 max-w-2xl">
            <div>
              <label className="label">Proposal Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Allocate 30 ETH to Base Chain Liquidity Provision"
                className="input mt-1 py-2.5"
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="input mt-1 py-2.5">
                  <option value="Treasury Deployment">Treasury Deployment</option>
                  <option value="Risk Engine">Risk Engine &amp; Parameters</option>
                  <option value="Cross-Market Expansion">Cross-Market Expansion</option>
                  <option value="Protocol Upgrade">Protocol Upgrade</option>
                </select>
              </div>

              <div>
                <label className="label">Requested Treasury Capital (ETH)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={requestedEth}
                  onChange={(e) => setRequestedEth(e.target.value)}
                  className="input mt-1 py-2.5 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="label">Detailed Strategic Rationale</label>
              <textarea
                rows={5}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Explain the strategy, expected return, risk parameters, and why the DAO should allocate capital..."
                className="input mt-1 py-2.5 leading-relaxed"
                required
              />
            </div>

            <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-3.5 text-xs text-slate-300 space-y-1">
              <p className="font-semibold text-brand-200">Governance Staking Rule:</p>
              <p className="text-[11px] leading-relaxed text-slate-400">
                Submitting a proposal requires at least 10,000 VDAO voting weight. Your current voting weight ({votingPower.toLocaleString()} VDAO) qualifies.
              </p>
            </div>

            <button type="submit" className="btn-primary py-2.5 px-6 font-semibold">
              <Plus size={15} />
              Submit On-Chain Proposal
            </button>
          </form>
        </Card>
      )}

      {/* Tab 3: History & Execution Ledger */}
      {govTab === 'history' && (
        <Card className="overflow-hidden p-0">
          <div className="p-5 pb-3">
            <SectionTitle icon={History} title="Executed Governance Archive" hint="History of passed and on-chain executed proposals" />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-y border-white/[0.07] bg-white/[0.02]">
                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Proposal</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Capital</th>
                  <th className="px-5 py-3">Approval %</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Executed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {EXECUTED_PROPOSALS.map((p) => {
                  const total = p.forVotes + p.againstVotes
                  const approvalPct = Math.round((p.forVotes / total) * 100)
                  return (
                    <tr key={p.id} className="transition hover:bg-white/[0.03]">
                      <td className="px-5 py-3">
                        <span className="font-mono font-bold text-brand-300 mr-2">{p.id}</span>
                        <span className="font-medium text-slate-200">{p.title}</span>
                      </td>
                      <td className="px-5 py-3 text-slate-400">{p.category}</td>
                      <td className="px-5 py-3 font-mono text-slate-200">
                        {p.requestedEth > 0 ? `${p.requestedEth} ETH` : '—'}
                      </td>
                      <td className="px-5 py-3 font-mono font-bold text-emerald-400">{approvalPct}% FOR</td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300 uppercase">
                          <CheckCircle2 size={10} />
                          Executed
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-slate-500 font-mono">{p.executedAt}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
