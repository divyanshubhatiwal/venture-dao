/**
 * Venture DAO Protocol Constants & On-Chain Treasury Telemetry
 */
export const PROTOCOL_CONFIG = {
  name: 'Venture DAO',
  version: '2.4.0',
  tokenSymbol: 'VDAO',
  tokenDecimals: 18,
  treasuryEth: 500,
  treasuryDeployedEth: 285,
  startingBalance: 100_000,
  targetMultiple: 2.0,
  maxDrawdownLimit: 0.05,
  riskPerTradeLimit: 0.0075,
}

export const DAO_STATS = {
  treasuryEth: PROTOCOL_CONFIG.treasuryEth,
  treasuryUsd: 1_581_250,
  deployedEth: PROTOCOL_CONFIG.treasuryDeployedEth,
  tokenHolders: 1_420,
  totalProposals: 18,
  aiAccuracy: 0.88,
}
